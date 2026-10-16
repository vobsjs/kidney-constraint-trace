#!/usr/bin/env node
/**
 * Frozen generator for the literature-derived reference data set.
 *
 * WHAT THIS PRODUCES
 *   A serum gentamicin concentration-time reference table across six creatinine
 *   clearance (CrCl) strata, evaluated deterministically from the PUBLISHED
 *   one-compartment population PK model of Duong et al. 2022 (Bos 2019
 *   structural model, re-estimated), using the published cohort descriptors and
 *   the published cohort dosing range.
 *
 *   These are MODEL-DERIVED reference points: every number is an exact
 *   deterministic function of published parameter values. NO residual noise and
 *   NO simulated observations are introduced. See data/dataset.json and README.md
 *   for the full provenance statement.
 *
 * LITERATURE SOURCE (parameter values taken verbatim from the publications)
 *   Duong A, Simard C, Williamson D, Marsot A.
 *   "Model Re-Estimation: An Alternative for Poor Predictive Performance during
 *   External Evaluations? Example of Gentamicin in Critically Ill Patients."
 *   Pharmaceutics 2022;14(7):1426. doi:10.3390/pharmaceutics14071426. (Table S2, Bos row)
 *
 *   Structural model from:
 *   Bos JC, Prins JM, Misticio MC, Nunguiane G, Lang CN, Beirao JC, Mathot RAA,
 *   van Hest RM. "Population pharmacokinetics with Monte Carlo simulations of
 *   gentamicin in a population of severely ill adult patients from sub-Saharan
 *   Africa." Antimicrob Agents Chemother 2019;63(4):e02328-18.
 *   doi:10.1128/AAC.02328-18.
 *
 *   Published parameters used here:
 *     CL(CrCl) = 3.44 L/h * (1 + 0.00925 * (CrCl - 92))      [Duong 2022, Table S2, Bos row]
 *     V        = 22.4 L                                       [Duong 2022, Table S2, Bos row]
 *   Cohort descriptors (Duong 2022, Table 1, combined HSCM + IUCPQ cohort, n = 87):
 *     Cockcroft-Gault CrCl 92.2 +/- 48.9 mL/min; total body weight 80.0 +/- 21.5 kg.
 *
 * DETERMINISM
 *   Pure arithmetic, no randomness. Running this script reproduces
 *   data/reference_points.csv byte-for-byte on any IEEE-754 platform.
 *
 * Run:  node tools/generate_reference_data.mjs --write
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')

/** Published parameter values. Do not tune these; they define the reference curve. */
export const PUBLISHED = {
  clearanceAtCrcl92LPerH: 3.44,
  crclSlopePerMlMin: 0.00925,
  volumeOfDistributionL: 22.4,
  crclReferenceMlMin: 92,
  // Publication's residual error model, recorded for provenance only. It is NOT
  // applied: the reference curve is the noise-free published-model prediction.
  propSdReported: 0.32,
  addSdReportedMgL: 0.056,
}

/** Regimen and sampling design used to tabulate the published model. */
export const DESIGN = {
  bodyWeightKg: 80.0, // Duong 2022 Table 1 cohort mean
  doseMgPerKg: 5.0, // standard extended-interval gentamicin dose
  infusionHours: 0.5,
  // Six strata spanning the cohort's renal-function range (mean 92.2, SD 48.9).
  crclStrataMlMin: [45, 60, 75, 92, 110, 130],
  // Sampling within one 24 h dosing interval (routine TDM window).
  sampleTimesH: [0.5, 1, 2, 4, 8, 12],
}

/** Total clearance (L/h) predicted by the published linear CrCl model. */
export function publishedClearance(creatinineClearanceMlMin) {
  const { clearanceAtCrcl92LPerH, crclSlopePerMlMin, crclReferenceMlMin } = PUBLISHED
  return clearanceAtCrcl92LPerH * (1 + crclSlopePerMlMin * (creatinineClearanceMlMin - crclReferenceMlMin))
}

/** One-compartment IV infusion concentration (mg/L) at time t (h). */
export function infusionConcentration({ doseMg, infusionHours, clearanceLPerH, volumeL, timeH }) {
  const rate = doseMg / infusionHours // mg/h
  const k = clearanceLPerH / volumeL // 1/h
  const plateau = rate / clearanceLPerH // mg/L, steady-state during infusion
  if (timeH <= infusionHours) return plateau * (1 - Math.exp(-k * timeH))
  const atEnd = plateau * (1 - Math.exp(-k * infusionHours))
  return atEnd * Math.exp(-k * (timeH - infusionHours))
}

export function build() {
  const doseMg = DESIGN.doseMgPerKg * DESIGN.bodyWeightKg
  const rows = []
  for (const crcl of DESIGN.crclStrataMlMin) {
    const clearanceLPerH = publishedClearance(crcl)
    for (const timeH of DESIGN.sampleTimesH) {
      const concentrationMgL = infusionConcentration({
        doseMg,
        infusionHours: DESIGN.infusionHours,
        clearanceLPerH,
        volumeL: PUBLISHED.volumeOfDistributionL,
        timeH,
      })
      rows.push({ crclMlMin: crcl, timeH, concentrationMgL })
    }
  }
  return rows
}

export function toCsv(rows) {
  const header = 'crcl_ml_min,time_h,concentration_mg_l'
  const body = rows.map((r) => `${r.crclMlMin},${r.timeH},${formatFixed(r.concentrationMgL, 6)}`)
  return `${[header, ...body].join('\n')}\n`
}

/** Fixed-decimal formatting without exponent notation, stable across platforms. */
function formatFixed(value, digits) {
  const factor = 10 ** digits
  return (Math.round(value * factor) / factor).toFixed(digits)
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href

if (invokedDirectly && process.argv.includes('--write')) {
  const rows = build()
  mkdirSync(join(repoRoot, 'data'), { recursive: true })
  writeFileSync(join(repoRoot, 'data', 'reference_points.csv'), toCsv(rows), 'utf8')
  process.stdout.write(`wrote ${rows.length} reference points to data/reference_points.csv\n`)
  for (const r of rows) {
    process.stdout.write(
      `  CrCl ${String(r.crclMlMin).padStart(3)} mL/min  t=${String(r.timeH).padStart(4)} h  ` +
        `${r.concentrationMgL.toFixed(4).padStart(9)} mg/L\n`,
    )
  }
}
