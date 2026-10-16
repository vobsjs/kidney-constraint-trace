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

/** dC/dt for the two-pool system. `clearanceLPerMin` is 0 outside dialysis. */
export function derivatives(patient, C1, C2, clearanceLPerMin) {
  const { V1, V2, kcLPerMin, generationMgNPerMin } = patient
  // Generation is split in proportion to volume.
  const g1 = generationMgNPerMin * (V1 / (V1 + V2))
  const g2 = generationMgNPerMin * (V2 / (V1 + V2))
  const exchange = kcLPerMin * (C2 - C1) // into proximal
  const dC1 = (g1 + exchange - clearanceLPerMin * C1) / V1
  const dC2 = (g2 - exchange) / V2
  return [dC1, dC2]
}

/** One classical RK4 step. */
function rk4(patient, C1, C2, clearanceLPerMin, dt) {
  const [a1, a2] = derivatives(patient, C1, C2, clearanceLPerMin)
  const [b1, b2] = derivatives(patient, C1 + (dt / 2) * a1, C2 + (dt / 2) * a2, clearanceLPerMin)
  const [c1, c2] = derivatives(patient, C1 + (dt / 2) * b1, C2 + (dt / 2) * b2, clearanceLPerMin)
  const [d1, d2] = derivatives(patient, C1 + dt * c1, C2 + dt * c2, clearanceLPerMin)
  return [C1 + (dt / 6) * (a1 + 2 * b1 + 2 * c1 + d1), C2 + (dt / 6) * (a2 + 2 * b2 + 2 * c2 + d2)]
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
}) {
  const clLPerMin = dialyzerClearance({ Qb: dialyzer.Qb, Qd: dialyzer.Qd, KoA: dialyzer.KoA }) / 1000
  const dt = sampleStepMinutes
  const totalVolume = patient.V1 + patient.V2

  // Run one dialysis + rebound cycle from a given equilibrated pre-dialysis
  // concentration. The system is linear in C, so the map C_pre -> C_eq is affine
  // and two evaluations determine it exactly.
  function runCycle(cPre) {
    let C1 = cPre
    let C2 = cPre
    const dialysisTrack = []
    for (let t = 0; t < sessionMinutes; t += dt) {
      ;[C1, C2] = rk4(patient, C1, C2, clLPerMin, dt)
      dialysisTrack.push({ minute: t + dt, C1, C2 })
    }
    const postImmediate = C1
    const postDistal = C2
    const reboundTrack = [{ minute: 0, C1, C2 }]
    for (let t = 0; t < reboundMinutes; t += 1) {
      ;[C1, C2] = rk4(patient, C1, C2, 0, 1)
      reboundTrack.push({ minute: t + 1, C1, C2 })
    }
    const equilibrated = (C1 * patient.V1 + C2 * patient.V2) / totalVolume
    return { postImmediate, postDistal, equilibrated, dialysisTrack, reboundTrack }
  }

  // EXACT PERIODIC STEADY STATE, no cycle iteration.
  // Over a 44 h interdialytic interval the two pools fully equilibrate: the
  // exchange time constant is V2/Kc ~ 42 min for a reference patient, i.e. about
  // 60 time constants. So the next session starts from a single equilibrated
  // concentration, C_pre = C_eq + G*t_inter/V.
  const fromZero = runCycle(0) // generation-only contribution
  const fromOne = runCycle(1) // unit initial condition
  const alpha = fromOne.equilibrated - fromZero.equilibrated
  const beta = fromZero.equilibrated
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
    sessionMinutes,
    preMgNPerL: pre,
    postImmediateMgNPerL: final.postImmediate,
    postDistalMgNPerL: final.postDistal,
    equilibratedMgNPerL: final.equilibrated,
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
