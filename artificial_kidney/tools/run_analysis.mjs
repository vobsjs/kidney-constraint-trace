#!/usr/bin/env node
/**
 * ARTIFICIAL KIDNEY -- module validation and the system-level result.
 *
 * CHECK 1  Does the regeneration module reproduce the published cartridge capacity
 *          and duration?
 * CHECK 2  What does the closed loop do as the cartridge fills?
 * CHECK 3  What actually limits a continuous device -- the membrane or the
 *          cartridge? This is the question the single-device model could not ask.
 * CHECK 4  What does closing the loop buy physiologically, quantified against the
 *          intermittent therapy that stages 4-5 modelled?
 *
 * Run:  node artificial_kidney/tools/run_analysis.mjs
 */

import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = process.env.BENCHMARK_REPO ?? resolve(here, '..', '..')

const {
  simulateRegenerationLoop,
  simulateLoopDecay,
  continuousSteadyState,
  equivalentContinuousClearanceMlMin,
  weeklyClearedVolumeL,
  cartridgeDemand,
  REDY,
  UREA_GENERATION,
} = await import(pathToFileURL(join(REPO, 'artificial_kidney', 'system.mjs')).href)

const { simulateSession, toBunMgDl } = await import(
  pathToFileURL(join(REPO, 'dialysis_session', 'patient_dialyzer.mjs')).href
)

const pad = (v, n) => String(v).padStart(n)
const INTERMITTENT = { Qb: 250, Qd: 500, KoA: 1000, sessionMinutes: 240, sessionsPerWeek: 3 }

// ---------------------------------------------------------------- check 1
process.stdout.write('CHECK 1  Regeneration module vs the published cartridge capacity\n')
process.stdout.write('='.repeat(76) + '\n')
process.stdout.write(`  published REDY D3150 urea capacity : ${REDY.ureaCapacityG} g\n`)
process.stdout.write(`  verified HEMO urea generation      : ${UREA_GENERATION.gUreaPerDay.toFixed(2)} g/day\n\n`)

const run = simulateRegenerationLoop({ minutes: 6 * 24 * 60, dtMin: 1 })
const demand = cartridgeDemand()
process.stdout.write(`  cartridge fully loaded at          : ${run.cartridge.loadingG.toFixed(2)} g ` +
  `(${(run.cartridge.utilisation * 100).toFixed(1)}%)\n`)
process.stdout.write(`  time to 95% utilisation            : ${(run.breakthroughMin / 1440).toFixed(2)} days\n`)
process.stdout.write(`  mass-balance prediction            : ${demand.cartridgeDays.toFixed(2)} days\n`)
process.stdout.write(`  agreement                          : ` +
  `${(Math.abs(run.breakthroughMin / 1440 - demand.cartridgeDays) / demand.cartridgeDays * 100).toFixed(1)}%\n\n`)
process.stdout.write('  The 95% threshold fires slightly early, as it must: 5% of the capacity is\n')
process.stdout.write('  still unused. Nothing is fitted -- capacity and generation are both published.\n\n')

// ---------------------------------------------------------------- check 2
process.stdout.write('CHECK 2  The closed loop as the cartridge fills\n')
process.stdout.write('='.repeat(76) + '\n')
const plateau = run.trace.find((p) => p.minute === 1440)
const analytical = UREA_GENERATION.mgNPerMin / (INTERMITTENT.Qd / 1000)
process.stdout.write(`  steady-state loop urea while the cartridge works:\n`)
process.stdout.write(`    measured from the simulation  ${plateau.dialysateMgNPerL.toFixed(2)} mg N/L\n`)
process.stdout.write(`    influx / dialysate flow       ${analytical.toFixed(2)} mg N/L\n\n`)
process.stdout.write(`  ${'day'.padStart(5)} ${'loop urea'.padStart(11)} ${'cartridge'.padStart(11)}\n`)
for (const p of run.trace) {
  if (p.minute % 1440 !== 0) continue
  process.stdout.write(
    `  ${pad((p.minute / 1440).toFixed(0), 5)} ${pad(p.dialysateMgNPerL.toFixed(2) + ' mgN/L', 11)} ` +
      `${pad((p.utilisation * 100).toFixed(1) + '%', 11)}\n`,
  )
}
process.stdout.write('\n  Flat until the bed exhausts, then abrupt. That is the observed behaviour of a\n')
process.stdout.write('  packed ion-exchange bed: a sharp breakthrough front, not gradual decay.\n')
process.stdout.write('  A real device therefore needs a sorbent monitor, not a concentration trend.\n\n')

// ---------------------------------------------------------------- check 3
process.stdout.write('CHECK 3  What limits a CONTINUOUS artificial kidney?\n')
process.stdout.write('='.repeat(76) + '\n')
const nominalCl = simulateLoopDecay({ Qb: INTERMITTENT.Qb, Qd: INTERMITTENT.Qd, KoA: INTERMITTENT.KoA, minutes: 1, dtMin: 1 })
  .nominalClearanceMlMin
const weeklyL = weeklyClearedVolumeL({ clearanceMlMin: nominalCl, ...INTERMITTENT, clearanceMlMin: nominalCl })
const continuousCl = equivalentContinuousClearanceMlMin({ clearanceMlMin: nominalCl, ...INTERMITTENT })
const singlePassL = (INTERMITTENT.Qd * INTERMITTENT.sessionMinutes * INTERMITTENT.sessionsPerWeek) / 1000

process.stdout.write(`  conventional single-pass intermittent therapy (the stages 4-5 reference):\n`)
process.stdout.write(`    dialyzer clearance        ${nominalCl.toFixed(1)} mL/min\n`)
process.stdout.write(`    schedule                  3 x 4 h per week\n`)
process.stdout.write(`    dialysate consumed        ${singlePassL.toFixed(0)} L/week  (single pass, discarded)\n`)
process.stdout.write(`    weekly cleared volume     ${weeklyL.toFixed(1)} L\n\n`)
process.stdout.write(`  the SAME weekly clearance delivered continuously:\n`)
process.stdout.write(`    required clearance        ${continuousCl.toFixed(2)} mL/min  ` +
  `(${(nominalCl / continuousCl).toFixed(0)}x lower)\n`)
process.stdout.write(`    dialysate inventory       ${REDY.dialysateVolumeL} L, replaced every ` +
  `${demand.cartridgeDays.toFixed(1)} days\n`)
process.stdout.write(`                              (single pass burns ${(singlePassL / 7).toFixed(0)} L/day instead)\n`)
process.stdout.write(`    membrane area             proportionally SMALLER -- this is the easy part\n\n`)
process.stdout.write(`  but the CARTRIDGE must still take up every gram generated:\n`)
process.stdout.write(`    urea generation           ${demand.gUreaPerDay.toFixed(1)} g/day\n`)
process.stdout.write(`    cartridge capacity        ${REDY.ureaCapacityG} g\n`)
process.stdout.write(`    one cartridge lasts       ${demand.cartridgeDays.toFixed(1)} days\n`)
process.stdout.write(`    cartridges per week       ${demand.cartridgesPerWeek.toFixed(1)}\n`)
process.stdout.write(`    cartridges per year       ${demand.cartridgesPerYear.toFixed(0)}\n\n`)
process.stdout.write('  CONCLUSION, and it is the reason this module was worth building:\n')
process.stdout.write('  closing the loop shrinks the MEMBRANE need by ~14x but leaves the CARTRIDGE\n')
process.stdout.write('  demand exactly where it was, because that demand is set by generation alone.\n')
process.stdout.write('  No choice of clearance can reduce it. A continuous artificial kidney is a\n')
process.stdout.write('  sorbent-materials problem, and dialyzer optimisation cannot touch it.\n\n')

// ---------------------------------------------------------------- check 4
process.stdout.write('CHECK 4  What does closing the loop buy physiologically?\n')
process.stdout.write('='.repeat(76) + '\n')
const intermittent = simulateSession({
  dialyzer: { Qb: INTERMITTENT.Qb, Qd: INTERMITTENT.Qd, KoA: INTERMITTENT.KoA },
})
const continuous = continuousSteadyState({ clearanceMlMin: continuousCl })
const peak = toBunMgDl(intermittent.preMgNPerL)
const trough = toBunMgDl(intermittent.postImmediateMgNPerL)

process.stdout.write(`  ${'therapy'.padEnd(32)} ${'BUN peak'.padStart(10)} ${'trough'.padStart(8)} ${'swing'.padStart(8)}\n`)
process.stdout.write(`  ${'intermittent (3 x 4 h/wk)'.padEnd(32)} ${pad(peak.toFixed(1), 10)} ${pad(trough.toFixed(1), 8)} ${pad((peak - trough).toFixed(1), 8)}\n`)
process.stdout.write(`  ${'continuous (regenerated loop)'.padEnd(32)} ${pad(continuous.bunMgDl.toFixed(1), 10)} ${pad(continuous.bunMgDl.toFixed(1), 8)} ${pad('0.0', 8)}\n\n`)
process.stdout.write(`  swing ${(peak - trough).toFixed(1)} -> 0.0 mg/dL\n\n`)
process.stdout.write('  The continuous level is HIGHER (29.3 vs a 12-57 range) because the same weekly\n')
process.stdout.write('  removal spread over 168 h holds a flat plateau. What changes is not the average\n')
process.stdout.write('  but the SWING, which goes to zero.\n')
process.stdout.write('  A kidney holds blood urea nitrogen roughly constant. Intermittent dialysis cannot;\n')
process.stdout.write('  a regenerated closed loop can. That is the functional difference.\n\n')

const normalBun = 15
const neededCl = (UREA_GENERATION.mgNPerMin / (normalBun * 10)) * 1000
process.stdout.write(`  To hold BUN at a normal ${normalBun} mg/dL continuously would need ${neededCl.toFixed(1)} mL/min,\n`)
process.stdout.write(`  ${(neededCl / continuousCl).toFixed(1)}x the matched-dose clearance -- still a small membrane.\n`)
process.stdout.write(`  The cartridge demand is UNCHANGED at ${demand.cartridgeDays.toFixed(1)} days per cartridge, ` +
  `because it is set by generation.\n`)
process.stdout.write('  That is the honest limit of today\'s sorbent technology.\n')
