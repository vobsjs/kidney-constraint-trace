/**
 * ============================================================================
 *  STAGE 9 -- REGENERABLE SORBENT: FROM A MASS LIMIT TO A POWER LIMIT
 * ============================================================================
 *
 * Stages 6-8 modelled a DISPOSABLE sorbent. The device dies when a capacity pool
 * empties, and the answer is a lifetime (2.54 d median) plus a logistics demand
 * (2.8 cartridges/week). That is a SUPPLY-CHAIN constraint.
 *
 * A regenerable sorbent removes the consumable. The constraint does not vanish --
 * it changes KIND, from mass to POWER. That is the claim this file tests.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS CHANGE IS, AND WHAT IT IS NOT -- READ THIS FIRST
 * ---------------------------------------------------------------------------
 * IS:      a different KIND of limit. A kidney has no consumable cartridge; it has
 *          a metabolic budget it cannot exceed. Moving from mass-limited to
 *          power-limited is therefore structurally closer to how a kidney is
 *          constrained, even though the chemistry stays abiotic.
 *
 * IS NOT:  biology. Electrochemical oxidation has no molecular recognition -- it
 *          attacks whatever reaches the electrode. It is not active cellular
 *          transport, and it is NOT reabsorption: a tubule RECLAIMS useful solute,
 *          whereas this DESTROYS urea. Stage 6 called the sorbent module "the
 *          tubular reabsorption analogue"; that was a FALSE ANALOGY and is
 *          corrected here. Dialysate regeneration has no renal counterpart.
 *
 * ---------------------------------------------------------------------------
 * HOW THIS IS GROUNDED WITHOUT AN ENERGY FIGURE
 * ---------------------------------------------------------------------------
 * No sourceable energy-per-gram for electrochemical urea oxidation was found (the
 * NSF PAR copy was unreachable, and one open-access PDF was CID-glyph encoded).
 * Rather than invent one, the question is INVERTED, as in stage 8:
 *
 *     "what energy per gram would fit inside the power budget a kidney itself
 *      operates under?"
 *
 * That yields a SPECIFICATION with no assumed electrochemistry. The energy figure
 * then appears only as a swept input, never as a claimed measurement.
 */

import { UREA_GENERATION } from './modules.mjs'
import { ASSUMPTIONS } from './patient_variability.mjs'

// ============================================================================
//  THE PHYSIOLOGICAL ANCHOR -- a real, well-established quantity
// ============================================================================

/**
 * Power the human kidneys spend at rest.
 *
 * The kidneys take ~20-25% of cardiac output and consume ~7-10% of whole-body
 * oxygen uptake, which at rest is ~250 mL/min. Oxidative energy is ~20.1 kJ per
 * litre of O2, so the renal budget is a few watts -- and it is a HARD budget: a
 * kidney cannot exceed it, and it has no cartridge to replace.
 *
 * This is the honest target for an artificial kidney, and the reason "mass -> power"
 * is a real structural change rather than a lateral move between two consumables.
 */
export const KIDNEY_POWER = Object.freeze({
  restingVo2MlPerMin: 250,
  renalOxygenFraction: { low: 0.07, high: 0.10 },
  kJPerLitreO2: 20.1,
  /** Watts, across the published 7-10% range. */
  get lowW() {
    return (this.restingVo2MlPerMin * this.renalOxygenFraction.low * this.kJPerLitreO2) / 60
  },
  get highW() {
    return (this.restingVo2MlPerMin * this.renalOxygenFraction.high * this.kJPerLitreO2) / 60
  },
  get midW() {
    return (this.lowW + this.highW) / 2
  },
  basis: 'renal O2 consumption 7-10% of resting whole-body VO2; 20.1 kJ per litre O2',
})

/** Published energy density of a lithium-ion pack, Wh/kg. */
export const BATTERY = Object.freeze({ whPerKg: 250, basis: 'typical Li-ion pack energy density' })

// ============================================================================
//  THE INVERTED SPECIFICATION -- no electrochemistry assumed
// ============================================================================

/**
 * Energy per kg of urea that would exactly fit a given continuous power budget.
 *
 *   E [kWh/kg] = P [W] * 24 h / 1000  /  (urea kg per day)
 */
export function energyPerKgFromPower(powerW, { gUreaPerDay = UREA_GENERATION.gUreaPerDay } = {}) {
  const energyWhPerDay = powerW * 24
  const ureaKgPerDay = gUreaPerDay / 1000
  return energyWhPerDay / 1000 / ureaKgPerDay
}

/** The inverse: the continuous power a given energy-per-kg would demand. */
export function powerFromEnergyPerKg(energyKWhPerKg, { gUreaPerDay = UREA_GENERATION.gUreaPerDay } = {}) {
  const ureaKgPerDay = gUreaPerDay / 1000
  const energyWhPerDay = energyKWhPerKg * 1000 * ureaKgPerDay
  return energyWhPerDay / 24
}

/** Battery mass needed to carry a day of that energy. */
export function batteryMassKg(energyKWhPerKg, { gUreaPerDay = UREA_GENERATION.gUreaPerDay, whPerKg = BATTERY.whPerKg, days = 1 } = {}) {
  const ureaKgPerDay = gUreaPerDay / 1000
  const whPerDay = energyKWhPerKg * 1000 * ureaKgPerDay
  return { whPerDay, whCarried: whPerDay * days, massKg: (whPerDay * days) / whPerKg }
}

// ============================================================================
//  COMPARING THE TWO KINDS OF CONSTRAINT
// ============================================================================

/**
 * The disposable sorbent's mass demand, for a like-for-like comparison.
 *
 * Cartridge masses are the sorbent layers themselves, from the REDY source's
 * 1/10-scale column packings scaled x10 (the scaling is flagged in stage 8).
 */
export const CARTRIDGE_MASS = Object.freeze({
  zirconiumPhosphateG: 990, // derived in stage 7 from the measured ammonium capacity
  charcoalG: ASSUMPTIONS.charcoalMassG,
  hzoAluminaG: 21.4 * 10,
  ureaseAluminaG: 20.3 * 10,
  get totalKg() {
    return (this.zirconiumPhosphateG + this.charcoalG + this.hzoAluminaG + this.ureaseAluminaG) / 1000
  },
})

/**
 * Side-by-side: what each constraint costs the patient.
 *
 * The structural difference that matters is not the mass -- the two are comparable
 * -- it is that the sorbent mass is CONSUMED and must be resupplied, whereas the
 * battery mass is CARRIED and recharged.
 */
export function compareConstraints({ energyKWhPerKg = 20, cartridgeLifetimeDays = 2.54, days = 30 } = {}) {
  const battery = batteryMassKg(energyKWhPerKg, { days: 1 })
  const power = powerFromEnergyPerKg(energyKWhPerKg)
  const cartridges = days / cartridgeLifetimeDays

  return {
    days,
    disposable: {
      carriedKg: CARTRIDGE_MASS.totalKg,
      resuppliedKg: CARTRIDGE_MASS.totalKg * cartridges,
      cartridges,
      consignment: 'replaced and discarded',
    },
    regenerable: {
      carriedKg: battery.massKg,
      resuppliedKg: 0,
      whPerDay: battery.whPerDay,
      continuousPowerW: power,
      consignment: 'recharged',
    },
  }
}

/**
 * A real wearable device to check the mass scale against.
 *
 * Gura's Wearable Artificial Kidney: <5 kg, battery-driven, ~400 mL of sterile
 * water, sorbent-based dialysate regeneration. It reached clinical trials
 * (NCT02280005). This is the closest thing to a realised device, and it bounds the
 * mass a wearable can plausibly carry.
 */
export const WAK_REFERENCE = Object.freeze({
  massKg: 5,
  waterMl: 400,
  regenerator: 'sorbent-based (disposable)',
  trial: 'NCT02280005',
  basis: 'published description of the Wearable Artificial Kidney',
})
