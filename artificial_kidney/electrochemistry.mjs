/**
 * ============================================================================
 *  STAGE 10 -- THE SPECIFICATION, CONVERTED INTO SOMETHING MEASURABLE
 * ============================================================================
 *
 * Stage 9 produced a specification it could not test:
 *
 *     "electrochemical urea removal must achieve <= 11.4 kWh per kg of urea"
 *
 * That is a DEVICE-level number. No device exists, so it cannot be checked. But it
 * is algebraically equivalent to an ELECTRODE-level number that any electrochemistry
 * lab can measure in an afternoon:
 *
 *     energy per kg  =  n * F * V_cell / (M_urea * FE)
 *
 *     n       electrons per urea        SOURCED
 *     V_cell  full-cell voltage         DERIVED from sourced electrode potentials
 *     M_urea  molar mass of urea        fixed
 *     FE      faradaic efficiency       <- THIS is the thing to measure
 *
 * So the specification becomes: **FE >= X%**. That is the whole point of this stage
 * -- it converts an untestable requirement into a testable one, without inventing
 * any number.
 *
 * ---------------------------------------------------------------------------
 * THE ONE DIRECTLY RELEVANT EXPERIMENT FOUND
 * ---------------------------------------------------------------------------
 * Carpenter & Stuve, "Electrooxidation of Urea and Creatinine on Nickel Foam-based
 * Electrocatalysts" (ChemRxiv preprint of J Appl Electrochem 2021), University of
 * Washington, funded by Northwest Kidney Centers. It is aimed explicitly at
 * PORTABLE DIALYSIS and uses dialysate-relevant concentrations -- urea 10 mM,
 * creatinine 0.18 mM.
 *
 * Its findings bear directly on FE, and they are not encouraging:
 *
 *   - urea oxidises on NiOOH above 0.45 V vs Hg/HgO at pH 14, as a 6-electron
 *     process to CO2 + N2 + H2O                                            [SOURCED]
 *   - at dialysate concentrations, 0.18 mM creatinine REDUCES urea oxidation
 *     charge by 19% on Ni hydroxide foam                                    [SOURCED]
 *   - on plain Ni foam, creatinine "severely limits" urea oxidation         [SOURCED]
 *   - site blocking by creatinine becomes noticeable after 120 s at 0.6 V   [SOURCED]
 *   - oxygen evolution (OER) competes at the same potentials                [SOURCED]
 *
 * Every one of those attacks FE, not cell voltage. That is the finding: the risk in
 * this specification is FARADAIC EFFICIENCY, and there is now sourced evidence that
 * a real dialysate stream works against it.
 */

// ============================================================================
//  SOURCED ELECTROCHEMISTRY
// ============================================================================

export const UREA_ELECTROCHEMISTRY = Object.freeze({
  /** Complete alkaline urea oxidation to CO2 + N2 + H2O. Source: Carpenter & Stuve. */
  electronsPerUrea: 6,
  electronsPerCreatinine: 21,
  molarMassKgPerMol: 0.06006,
  faradayCMol: 96485,
  /** Hg/HgO reference in 1 M KOH, vs SHE. Standard electrochemistry value. */
  hgHgOVsSheV: 0.140,
  /** Operating potential used in the source's constant-potential holds. */
  holdPotentialVVsHgHgO: 0.6,
  /** Urea oxidation onset. */
  onsetVVsHgHgO: 0.45,
  /** pH of the source's electrolyte (1 M KOH). */
  pH: 14,
  /** Cathode overpotential for hydrogen evolution on nickel, order-of-magnitude. */
  herOverpotentialV: 0.15,
})

/**
 * Full-cell voltage, DERIVED from sourced potentials rather than assumed.
 *
 *   E(anode)  = holdPotential + hgHgOVsSheV                    [vs SHE]
 *   E(cathode)= -0.0592 * pH - herOverpotential                [vs SHE]
 *   V_cell    = E(anode) - E(cathode)
 */
export function deriveCellVoltage({ potentialVVsHgHgO = UREA_ELECTROCHEMISTRY.holdPotentialVVsHgHgO } = {}) {
  const e = UREA_ELECTROCHEMISTRY
  const anodeVsShe = potentialVVsHgHgO + e.hgHgOVsSheV
  const cathodeVsShe = -0.0592 * e.pH - e.herOverpotentialV
  return { anodeVsShe, cathodeVsShe, cellV: anodeVsShe - cathodeVsShe }
}

/** Thermodynamic cell voltage for urea oxidation, for the overpotential comparison. */
export function thermodynamicCellVoltage() {
  // Urea oxidation is -0.746 V vs SHE at pH 14; HER is -0.829 V vs SHE.
  return -0.746 - -0.829
}

// ============================================================================
//  THE CONVERSION
// ============================================================================

/** Energy per kg of urea, kWh, for a given faradaic efficiency and cell voltage. */
export function energyPerKgUrea({ faradaicEfficiency = 1, cellV = deriveCellVoltage().cellV } = {}) {
  const e = UREA_ELECTROCHEMISTRY
  if (!(faradaicEfficiency > 0)) return Number.POSITIVE_INFINITY
  const joulesPerMol = (e.electronsPerUrea * e.faradayCMol * cellV) / faradaicEfficiency
  const joulesPerKg = joulesPerMol / e.molarMassKgPerMol
  return joulesPerKg / 3.6e6
}

/** The faradaic efficiency required to meet an energy specification. */
export function requiredFaradaicEfficiency({ specificationKWhPerKg, cellV = deriveCellVoltage().cellV } = {}) {
  // Invert energyPerKgUrea: FE = n*F*V / (M * E_kWh * 3.6e6)
  const e = UREA_ELECTROCHEMISTRY
  const joulesPerKgAllowed = specificationKWhPerKg * 3.6e6
  const joulesPerMol = joulesPerKgAllowed * e.molarMassKgPerMol
  return (e.electronsPerUrea * e.faradayCMol * cellV) / joulesPerMol
}

/** Continuous power implied, for a given energy per kg. */
export function powerForEnergyPerKg(energyKWhPerKg, gUreaPerDay = 14.97) {
  return (energyKWhPerKg * (gUreaPerDay / 1000) * 1000) / 24
}

// ============================================================================
//  SOURCED INTERFERENCE -- the evidence that attacks FE
// ============================================================================

export const INTERFERENCE = Object.freeze({
  /** The source's own measurement, at dialysate-relevant concentrations. */
  creatinineSuppressionOfUreaCharge: 0.19,
  relevantUreaMmolPerL: 10,
  relevantCreatinineMmolPerL: 0.18,
  siteBlockingOnsetSeconds: 120,
  citation:
    'Carpenter K, Stuve EM. Electrooxidation of Urea and Creatinine on Nickel Foam-based Electrocatalysts. ChemRxiv preprint; published J Appl Electrochem 2021. doi:10.1007/s10800-021-01545-1',
  funding: 'Northwest Kidney Centers -- i.e. it is a dialysis-motivated study, not a wastewater one',
})
