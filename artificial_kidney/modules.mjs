/**
 * ============================================================================
 *  ARTIFICIAL KIDNEY -- FUNCTIONAL MODULES
 * ============================================================================
 *
 * STAGE 6. Stages 4-5 modelled ONE device: a dialyzer on a bench, then coupled to
 * a patient. That device is a single functional block, and it is an OPEN LOOP --
 * blood in, dialysate bought fresh and discarded, roughly 120 L per session.
 *
 * The open loop is why dialysis is intermittent, and intermittency is the defining
 * functional difference between dialysis and a kidney. A kidney filters ~180 L/day
 * and REABSORBS ~99% of it, returning the fluid and the useful solute. The
 * engineering analogue is dialysate REGENERATION, and it is the module every
 * wearable artificial kidney programme needs.
 *
 * This file decomposes the system by FUNCTION rather than by hardware, because
 * that is the decomposition a kidney actually has:
 *
 *   module          function                            renal analogue
 *   --------------- ----------------------------------- -------------------------
 *   filtration      move solute out of blood            glomerular filtration
 *   regeneration    strip solute from the filtrate      tubular reabsorption
 *                   and RETURN the fluid
 *   compartment     distribute and generate solute      body fluid compartments
 *
 * Filtration and the compartment were validated in stages 4 and 5 and are reused
 * here UNCHANGED. Only regeneration is new.
 *
 * ---------------------------------------------------------------------------
 * REGENERATION MODULE -- model form and its grounding
 * ---------------------------------------------------------------------------
 * A sorbent cartridge removes urea by a two-step route: immobilised urease
 * hydrolyses urea to ammonium and bicarbonate, and zirconium phosphate then
 * exchanges the ammonium for sodium and hydrogen.
 *
 *   urea  --urease-->  NH4+ + HCO3-
 *
 * Published capacities, read from the REDY literature (see README for citations):
 *   - full-scale D3150 cartridge urea capacity       43.7 g
 *   - zirconium phosphate total cation exchange cap. 3.80 +/- 1.14 mEq/g
 *   - commercial REDY recirculating dialysate volume 5.5 L
 *
 * The rate law here is a linear-driving-force form with capacity depletion:
 *
 *   R = k * C_dialysate * (1 - q / q_max)          [g/min]
 *
 * with k set to the dialysate flow rate, i.e. the cartridge is assumed to strip
 * the dialysate stream essentially completely while it has capacity left. This is
 * a MODELLING CHOICE, not a measured isotherm -- it is the simplest form that
 * reproduces the qualitative behaviour the source describes (effective removal
 * until breakthrough, then failure). It is calibrated so that the 1/10-scale
 * cartridge at 20 mL/min dialysate breaks through at the published ~320 min.
 */

import { clearance as dialyzerClearance } from '../dialyzer/dialyzer_model.mjs'

// ---------------------------------------------------------------- published data

/** Values read out of the REDY literature. See README for citations. */
export const REDY = Object.freeze({
  dialysateVolumeL: 5.5,
  ureaCapacityG: 43.7,
  zirconiumPhosphateCationCapacityMeqPerG: 3.8,
  zirconiumPhosphateCapacitySdMeqPerG: 1.14,
  /** 1/10-scale cartridge, 20 mL/min dialysate: breakthrough at ~320 min. */
  tenthScaleDialysateMlMin: 20,
  tenthScaleBreakthroughMin: 320,
})

/** Urea generation, from the HEMO values already verified in stage 5. */
export const UREA_GENERATION = Object.freeze({
  /** HEMO reports 4.85 mg N/min; urea is 60/28 of that by mass. */
  mgNPerMin: 4.85,
  get mgUreaPerMin() {
    return this.mgNPerMin * (60 / 28)
  },
  get gUreaPerDay() {
    return (this.mgUreaPerMin * 1440) / 1000
  },
})

// ---------------------------------------------------------------- module 1

/**
 * FILTRATION MODULE. Reused unchanged from stage 4: the counter-current KoA
 * relation validated against 120 manufacturer measurements. Nothing here is
 * specific to the artificial kidney; it is the same membrane physics.
 */
export function filtrationClearanceMlMin({ Qb, Qd, KoA }) {
  return dialyzerClearance({ Qb, Qd, KoA })
}

// ---------------------------------------------------------------- module 2

/**
 * REGENERATION MODULE -- the new block.
 *
 * State is the cumulative urea removed. The module exposes a removal RATE at a
 * given dialysate concentration, which is what the loop needs.
 */
export function makeRegenerationModule({
  capacityG = REDY.ureaCapacityG,
  dialysateFlowMlMin = REDY.tenthScaleDialysateMlMin,
} = {}) {
  let loadingG = 0

  return {
    name: 'regeneration',
    capacityG,
    dialysateFlowMlMin,
    get loadingG() {
      return loadingG
    },
    get remainingG() {
      return Math.max(capacityG - loadingG, 0)
    },
    get exhausted() {
      return loadingG >= capacityG
    },
    get utilisation() {
      return loadingG / capacityG
    },
    /**
     * Urea removed from the dialysate over `dtMin`, given a dialysate urea
     * concentration in g/L.
     *
     * The cartridge strips everything from the dialysate it processes at flow
     * `dialysateFlowMlMin`, until its capacity is exhausted. That is the idealised
     * behaviour of a packed ion-exchange bed: a sharp breakthrough front, which is
     * what the source describes (removal constant through the run, then failure)
     * rather than gradual decay.
     *
     * What the model really encodes is MASS CONSERVATION against a published
     * capacity: whatever the kinetics, the cartridge is spent once it has taken up
     * q_max grams. The kinetic detail only governs how abrupt the transition is,
     * and an abrupt transition is the observed behaviour.
     */
    remove(CdialysateGPerL, dtMin) {
      if (loadingG >= capacityG) return 0
      const concentration = Math.max(CdialysateGPerL, 0)
      if (concentration === 0) return 0
      const processedG = (dialysateFlowMlMin / 1000) * concentration * dtMin
      const removed = Math.min(processedG, capacityG - loadingG)
      loadingG += removed
      return removed
    },
    reset() {
      loadingG = 0
    },
  }
}

// ---------------------------------------------------------------- module 3

/**
 * COMPARTMENT MODULE. Reused unchanged from stage 5: the two-pool patient with
 * its exact periodic steady state. Reported here only so the module boundary is
 * explicit; the implementation lives in dialysis_session/patient_dialyzer.mjs.
 */
export { simulateSession as compartmentStep } from '../dialysis_session/patient_dialyzer.mjs'

// ---------------------------------------------------------------- system check

/** How long one cartridge lasts against a given generation rate. */
export function cartridgeDurationDays({ capacityG = REDY.ureaCapacityG, gUreaPerDay = UREA_GENERATION.gUreaPerDay } = {}) {
  return capacityG / gUreaPerDay
}
