#!/usr/bin/env node
/**
 * STAGE 10 -- convert the energy specification into a measurable requirement,
 * and test it against the one directly relevant experiment that exists.
 *
 * CHECK 12  Cell voltage, DERIVED from sourced electrode potentials.
 * CHECK 13  The specification, restated as a required faradaic efficiency.
 * CHECK 14  The sourced interference evidence, and what it implies for FE.
 * CHECK 15  Verdict: is the specification met, and what would settle it?
 *
 * Run:  node artificial_kidney/tools/run_faradaic.mjs
 */

import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = process.env.BENCHMARK_REPO ?? resolve(here, '..', '..')

const {
  UREA_ELECTROCHEMISTRY,
  INTERFERENCE,
  deriveCellVoltage,
  thermodynamicCellVoltage,
  energyPerKgUrea,
  requiredFaradaicEfficiency,
  powerForEnergyPerKg,
} = await import(pathToFileURL(join(REPO, 'artificial_kidney', 'electrochemistry.mjs')).href)

const line = (s = '') => process.stdout.write(s + '\n')
const pad = (v, n) => String(v).padStart(n)

const SPEC = 11.4 // kWh/kg, derived in stage 9 from the renal power budget

// ---------------------------------------------------------------- check 12
line('CHECK 12 Cell voltage, derived from sourced electrode potentials')
line('='.repeat(76))
const cv = deriveCellVoltage()
const th = thermodynamicCellVoltage()
line(`  source potential (constant-potential hold)  ${UREA_ELECTROCHEMISTRY.holdPotentialVVsHgHgO} V vs Hg/HgO`)
line(`  Hg/HgO in 1 M KOH vs SHE                    +${UREA_ELECTROCHEMISTRY.hgHgOVsSheV} V`)
line(`  => anode vs SHE                             ${cv.anodeVsShe.toFixed(3)} V`)
line(`  HER cathode at pH ${UREA_ELECTROCHEMISTRY.pH}, with ${UREA_ELECTROCHEMISTRY.herOverpotentialV} V overpotential`)
line(`  => cathode vs SHE                           ${cv.cathodeVsShe.toFixed(3)} V`)
line()
line(`  => V_cell                                   ${cv.cellV.toFixed(2)} V`)
line(`     thermodynamic minimum                    ${th.toFixed(2)} V`)
line(`     overpotential                            ${(cv.cellV - th).toFixed(2)} V`)
line()
line('  The overpotential dominates the cell voltage. That is the "sluggish kinetics"')
line('  the field reports, and it is now a number rather than a claim.')
line()

// ---------------------------------------------------------------- check 13
line('CHECK 13 The specification, restated as a REQUIRED FARADAIC EFFICIENCY')
line('='.repeat(76))
line('  energy per kg = n * F * V_cell / (M_urea * FE)')
line()
line(`    n (electrons per urea, SOURCED)   ${UREA_ELECTROCHEMISTRY.electronsPerUrea}`)
line(`    V_cell (derived above)            ${cv.cellV.toFixed(2)} V`)
line(`    M_urea                            ${UREA_ELECTROCHEMISTRY.molarMassKgPerMol} kg/mol`)
line()
line('  at FE = 100% the energy would be:')
line()
line(`    ${'FE'.padStart(7)} ${'energy (kWh/kg)'.padStart(16)} ${'power (W)'.padStart(11)}  meets <= ${SPEC}?`)
for (const fe of [1, 0.8, 0.6, 0.5, 0.4, 0.35, 0.3, 0.2]) {
  const e = energyPerKgUrea({ faradaicEfficiency: fe, cellV: cv.cellV })
  line(`    ${pad((fe * 100).toFixed(0) + '%', 7)} ${pad(e.toFixed(2), 16)} ${pad(powerForEnergyPerKg(e).toFixed(1), 11)}  ${e <= SPEC ? 'YES' : 'no'}`)
}
line()
const requiredFe = requiredFaradaicEfficiency({ specificationKWhPerKg: SPEC, cellV: cv.cellV })
line(`  =>  THE SPECIFICATION IS EQUIVALENT TO  FE >= ${(requiredFe * 100).toFixed(0)}%`)
line()
line('  This is the point of the stage. An energy-per-kg figure is a DEVICE quantity')
line('  that cannot be checked without a device. A faradaic efficiency is an ELECTRODE')
line('  quantity that any electrochemistry lab measures in an afternoon.')
line()
line(`  For reference: at a realistic 60% FE the energy is ` +
  `${energyPerKgUrea({ faradaicEfficiency: 0.6, cellV: cv.cellV }).toFixed(2)} kWh/kg, ` +
  `comfortably inside the budget.`)
line('  The specification is NOT obviously unmeetable. FE is the whole question.')
line()

// ---------------------------------------------------------------- check 14
line('CHECK 14 The sourced interference evidence')
line('='.repeat(76))
line(`  ${INTERFERENCE.citation}`)
line(`  funded by: ${INTERFERENCE.funding}`)
line()
line('  Aimed explicitly at PORTABLE DIALYSIS, at dialysate-relevant concentrations:')
line(`    urea       ${INTERFERENCE.relevantUreaMmolPerL} mM`)
line(`    creatinine ${INTERFERENCE.relevantCreatinineMmolPerL} mM`)
line()
line('  Its findings, all sourced:')
line(`    - 0.18 mM creatinine reduces urea oxidation charge by ` +
  `${(INTERFERENCE.creatinineSuppressionOfUreaCharge * 100).toFixed(0)}% on Ni hydroxide foam`)
line('    - on plain Ni foam, creatinine "severely limits" urea oxidation')
line(`    - site blocking becomes measurable after ${INTERFERENCE.siteBlockingOnsetSeconds} s`)
line('    - oxygen evolution competes at the same potentials')
line()
line('  EVERY ONE OF THOSE ATTACKS FARADAIC EFFICIENCY, NOT CELL VOLTAGE.')
line()
line('  So the risk in this specification is not that the voltage is too high. It is')
line('  that in a real dialysate stream the current is shared between urea, creatinine,')
line('  and water oxidation, and only the urea fraction counts.')
line()

// ---------------------------------------------------------------- check 15
line('CHECK 15 Verdict')
line('='.repeat(76))
line(`  SPECIFICATION          <= ${SPEC} kWh/kg urea   (stage 9, from the renal power budget)`)
line(`  EQUIVALENT TO          FE >= ${(requiredFe * 100).toFixed(0)}% at V_cell = ${cv.cellV.toFixed(2)} V`)
line()
line('  IS IT MET?             UNKNOWN, and now measurable.')
line()
line('  What changed: the requirement moved from a quantity nobody can check without')
line('  building a device, to a quantity an electrode lab measures directly. That is a')
line('  real advance and it cost no assumption -- n is sourced, V_cell is derived from')
line('  sourced potentials, and M_urea is fixed.')
line()
line('  What did NOT change: no number here is a measurement of a real cell. The')
line('  interference evidence suggests FE is the binding risk, but the source reports')
line('  a 19% CHARGE reduction, not an absolute faradaic efficiency, so the two cannot')
line('  be compared directly. Turning that into a verdict needs an experiment:')
line()
line('    measure FE for urea oxidation in a dialysate-like stream containing')
line('    creatinine and bicarbonate, at dialysate concentrations, over hours.')
line()
line('  Predicted outcome if the interference compounds with OER: FE well below')
line(`  ${(requiredFe * 100).toFixed(0)}%, and the specification FAILS. If OER can be suppressed and creatinine`)
line('  blocking avoided, FE above it, and the specification holds.')
line()
line('  Either result is a real answer. This is what stage 9 said was missing, and it')
line('  is now specified precisely enough to be worth someone\'s bench time.')
