/**
 * Two-pool patient urea kinetics coupled to the validated dialyzer model.
 *
 * STAGE 5. Stages 1-3 modelled a drug in a population; stage 4 modelled the
 * device. This puts a human body on the other end of the hardware.
 *
 * THE PATIENT (all values verified from the source, not assumed)
 *   Daugirdas JT, Depner TA. Creatinine generation from kinetic modeling with or
 *   without postdialysis serum creatinine measurement: results from the HEMO
 *   study. Nephrol Dial Transplant 2017;32(11):1926-1933. PMC5837547.
 *
 *   - two-pool (proximal/distal) urea kinetic model
 *   - modelled urea distribution volume       V = 31.1 (SD 7.0) L
 *   - proximal : distal volume ratio          1 : 2  (1/3 - 2/3)
 *   - intercompartmental clearance            Kc = 16 x V(L) mL/min for urea
 *   - urea generation rate (as nitrogen)      4.85 (SD 1.95) mg/min
 *   - measured cross-dialyzer urea clearance  230 (SD 37) mL/min at 1 h
 *
 * THE DEVICE
 *   Stage 4's counter-current KoA model. It is not re-fitted here: the same
 *   `clearance()` function that reproduced the manufacturer data to 0.89% is
 *   used to generate the intradialytic removal term, so the two stages are
 *   genuinely coupled rather than independently parameterised.
 *
 * WHAT REBOUND IS
 *   The dialyzer only sees the proximal pool. Urea then flows back from the
 *   distal pool, so the concentration measured immediately at the end of the
 *   session is lower than the concentration the patient settles at. Single-pool
 *   Kt/V, computed from that immediate sample, therefore OVERSTATES the dose
 *   actually delivered. The equilibrated value is the one that matters.
 */

import { clearance as dialyzerClearance } from '../dialyzer/dialyzer_model.mjs'

/** Verified HEMO population values. */
export const HEMO = Object.freeze({
  ureaDistributionVolumeL: 31.1,
  ureaDistributionVolumeSdL: 7.0,
  proximalFraction: 1 / 3, // proximal:distal = 1:2
  kcPerLitreMlMin: 16, // Kc (mL/min) = 16 * V (L)
  ureaGenerationMgNPerMin: 4.85,
  measuredCrossDialyzerUreaClearanceMlMin: 230,
})

/**
 * Patient state and two-pool constants.
 * Concentrations are carried as mg N/L internally; BUN is reported in mg/dL.
 */
export function makePatient({ volumeL = HEMO.ureaDistributionVolumeL, generationMgNPerMin = HEMO.ureaGenerationMgNPerMin } = {}) {
  const V1 = volumeL * HEMO.proximalFraction
  const V2 = volumeL * (1 - HEMO.proximalFraction)
  const kcMlMin = HEMO.kcPerLitreMlMin * volumeL
  return {
    volumeL,
    V1, // L, proximal (dialyzer-accessible)
    V2, // L, distal
    kcLPerMin: kcMlMin / 1000,
    generationMgNPerMin,
  }
}

/**
 * Mass-based two-pool derivatives.
 *
 * Integrating MASS rather than concentration is what makes ultrafiltration
 * expressible at all: the proximal volume shrinks during the session, so a
 * concentration ODE would need a dV/dt correction term that cancels confusingly
 * and hides whether the convective removal has been double-counted.
 *
 * Mass leaving the patient is the diffusive dialyzer clearance plus the
 * ultrafiltrate itself, which carries solute at the proximal concentration. The
 * sieving coefficient for urea is ~1, so the convective term is Quf*C1 and no
 * separate clearance term is added on top of it.
 *
 * State: [M1, M2] in mg N, with V1 supplied by the caller.
 */
export function massDerivatives(patient, M1, M2, V1, { clearanceLPerMin = 0, ultrafiltrationLPerMin = 0 } = {}) {
  const { V2, kcLPerMin, generationMgNPerMin } = patient
  const C1 = M1 / V1
  const C2 = M2 / V2
  const g1 = generationMgNPerMin * (patient.V1 / (patient.V1 + V2))
  const g2 = generationMgNPerMin * (V2 / (patient.V1 + V2))
  const exchange = kcLPerMin * (C2 - C1)
  const dM1 = g1 + exchange - clearanceLPerMin * C1 - ultrafiltrationLPerMin * C1
  const dM2 = g2 - exchange
  return [dM1, dM2]
}

/** One RK4 step on mass, with the proximal volume changing at a known rate. */
function rk4Mass(patient, M1, M2, V1, V1dot, opts, dt) {
  const half = dt / 2
  const [a1, a2] = massDerivatives(patient, M1, M2, V1, opts)
  const [b1, b2] = massDerivatives(patient, M1 + half * a1, M2 + half * a2, V1 + half * V1dot, opts)
  const [c1, c2] = massDerivatives(patient, M1 + half * b1, M2 + half * b2, V1 + half * V1dot, opts)
  const [d1, d2] = massDerivatives(patient, M1 + dt * c1, M2 + dt * c2, V1 + dt * V1dot, opts)
  return [M1 + (dt / 6) * (a1 + 2 * b1 + 2 * c1 + d1), M2 + (dt / 6) * (a2 + 2 * b2 + 2 * c2 + d2)]
}

/**
 * Simulate one interdialytic interval followed by one dialysis session.
 *
 * Returns the full trajectory plus the three concentrations the clinic actually
 * argues about: pre-dialysis, immediate post-dialysis, and equilibrated.
 */
export function simulateSession({
  patient = makePatient(),
  dialyzer = { Qb: 250, Qd: 500, KoA: 1000 },
  sessionMinutes = 240,
  interdialyticMinutes = 44 * 60,
  sampleStepMinutes = 5,
  reboundMinutes = 60,
  seedConcentrationMgNPerL = 600,
  ultrafiltrationL = 0,
}) {
  const clLPerMin = dialyzerClearance({ Qb: dialyzer.Qb, Qd: dialyzer.Qd, KoA: dialyzer.KoA }) / 1000
  const dt = sampleStepMinutes
  const totalVolume = patient.V1 + patient.V2
  const qufLPerMin = ultrafiltrationL / sessionMinutes
  const V1End = patient.V1 - ultrafiltrationL

  // One dialysis + rebound cycle from a given equilibrated pre-dialysis
  // concentration. The system is LINEAR in concentration, so the map
  // C_pre -> C_equilibrated is affine and two evaluations determine it exactly.
  function runCycle(cPre) {
    let M1 = cPre * patient.V1
    let M2 = cPre * patient.V2
    let V1 = patient.V1
    const dialysisTrack = []
    for (let t = 0; t < sessionMinutes; t += dt) {
      ;[M1, M2] = rk4Mass(patient, M1, M2, V1, -qufLPerMin, { clearanceLPerMin: clLPerMin, ultrafiltrationLPerMin: qufLPerMin }, dt)
      V1 -= qufLPerMin * dt
      dialysisTrack.push({ minute: t + dt, C1: M1 / V1, C2: M2 / patient.V2, V1 })
    }
    const postImmediate = M1 / V1
    const postDistal = M2 / patient.V2

    const reboundTrack = [{ minute: 0, C1: postImmediate, C2: postDistal, V1 }]
    for (let t = 0; t < reboundMinutes; t += 1) {
      ;[M1, M2] = rk4Mass(patient, M1, M2, V1, 0, {}, 1)
      reboundTrack.push({ minute: t + 1, C1: M1 / V1, C2: M2 / patient.V2, V1 })
    }

    // Equilibrated concentration at the END-OF-SESSION (contracted) volume, which
    // is the volume the clinic would sample from.
    const contractedVolume = V1 + patient.V2
    const equilibrated = (M1 + M2) / contractedVolume
    // The patient regains the ultrafiltered fluid before the next session, which
    // dilutes the same mass back into the baseline volume.
    const restored = (M1 + M2) / totalVolume
    return { postImmediate, postDistal, equilibrated, restored, dialysisTrack, reboundTrack }
  }

  // EXACT PERIODIC STEADY STATE, no cycle iteration.
  // Over a 44 h interdialytic interval the two pools fully equilibrate: the
  // exchange time constant is V2/Kc ~ 42 min, i.e. about 60 time constants. So the
  // next session starts from a single equilibrated concentration.
  const fromZero = runCycle(0)
  const fromOne = runCycle(1)
  const alpha = fromOne.restored - fromZero.restored
  const beta = fromZero.restored
  const generationRise = (patient.generationMgNPerMin * interdialyticMinutes) / totalVolume
  const cPre = (beta + generationRise) / (1 - alpha)

  const final = runCycle(cPre)
  const pre = cPre
  const spKtV = Math.log(pre / final.postImmediate)
  const eKtV = Math.log(pre / final.equilibrated)

  return {
    patient,
    dialyzer,
    clearanceMlMin: clLPerMin * 1000,
    ultrafiltrationL,
    convectiveClearanceMlMin: qufLPerMin * 1000,
    totalClearanceMlMin: (clLPerMin + qufLPerMin) * 1000,
    sessionMinutes,
    preMgNPerL: pre,
    postImmediateMgNPerL: final.postImmediate,
    postDistalMgNPerL: final.postDistal,
    equilibratedMgNPerL: final.equilibrated,
    contractedVolumeL: V1End + patient.V2,
    spKtV,
    eKtV,
    reboundFraction: (final.equilibrated - final.postImmediate) / final.postImmediate,
    interdialyticRiseMgNPerL: generationRise,
    dialysisTrack: final.dialysisTrack,
    reboundTrack: final.reboundTrack,
  }
}

/** BUN in mg/dL from internal mg N/L. */
export const toBunMgDl = (mgNPerL) => mgNPerL / 10
