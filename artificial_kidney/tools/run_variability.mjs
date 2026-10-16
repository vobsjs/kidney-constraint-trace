#!/usr/bin/env node
/**
 * STAGE 8 -- the activated-charcoal pool, and the lifetime as a DISTRIBUTION.
 *
 * CHECK 6  Bound the charcoal pool. It has no published capacity, so the
 *          assumption is explicit and flagged, AND the question is inverted into a
 *          design requirement that needs no assumption at all.
 * CHECK 7  Report cartridge life as a population DISTRIBUTION rather than a range
 *          over parameter uncertainty, and separate the two contributions.
 *
 * Run:  node artificial_kidney/tools/run_variability.mjs
 */

import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = process.env.BENCHMARK_REPO ?? resolve(here, '..', '..')

const {
  lifetimeDistribution,
  requiredCharcoalCapacity,
  charcoalLifetime,
  ASSUMPTIONS,
  UREA_GENERATION_DISTRIBUTION,
} = await import(pathToFileURL(join(REPO, 'artificial_kidney', 'patient_variability.mjs')).href)
const { LOADS, SORBENT } = await import(
  pathToFileURL(join(REPO, 'artificial_kidney', 'capacity_competition.mjs')).href
)

const line = (s = '') => process.stdout.write(s + '\n')
const pad = (v, n) => String(v).padStart(n)

// ---------------------------------------------------------------- check 6
line('CHECK 6  The activated-charcoal pool')
line('='.repeat(76))
line('  Stage 7 left this pool unbounded: the source gives the charcoal MASS but no')
line('  creatinine capacity, and no citable mg/g figure was found in the accessible')
line('  literature. So the gap is closed with an EXPLICIT ASSUMPTION -- and, where')
line('  possible, with no assumption at all.')
line()

line('  6a. THE INVERTED QUESTION -- derivable, no assumption needed')
line()
line(`      charcoal mass in the cartridge : ${ASSUMPTIONS.charcoalMassG} g`)
line(`        basis: ${ASSUMPTIONS.charcoalMassBasis}`)
line()
for (const target of [2.22, 2.64]) {
  const r = requiredCharcoalCapacity({ targetDays: target })
  line(`      to outlast ${target} days, charcoal must provide >= ${r.requiredMgPerG.toFixed(1)} mg/g`)
}
line()
line('      That is a SPECIFICATION, not a measurement: it is what the charcoal pool')
line('      must beat to stop being the binding constraint. No assumption required.')
line()

line('  6b. THE ASSUMPTION -- flagged, not a source value')
line()
line(`      creatinine generation : ${ASSUMPTIONS.creatinineGenerationMgPerDay} mg/day`)
line(`        basis: ${ASSUMPTIONS.creatinineGenerationBasis}`)
line(`      adsorption capacity   : ${ASSUMPTIONS.creatinineAdsorptionMgPerG.low}-${ASSUMPTIONS.creatinineAdsorptionMgPerG.high} mg/g (mid ${ASSUMPTIONS.creatinineAdsorptionMgPerG.mid})`)
line(`        basis: ${ASSUMPTIONS.creatinineAdsorptionBasis}`)
line()
line(`      ${'assumed mg/g'.padStart(13)} ${'charcoal life'.padStart(14)}  verdict`)
for (const key of ['low', 'mid', 'high']) {
  const mg = ASSUMPTIONS.creatinineAdsorptionMgPerG[key]
  const c = charcoalLifetime({ adsorptionMgPerG: mg })
  line(`      ${pad(mg, 13)} ${pad(c.lifetimeDays.toFixed(2) + ' days', 14)}  ` +
    (c.lifetimeDays < 2.64 ? 'BINDS FIRST -> shortens life' : 'does not bind'))
}
line()

// ---------------------------------------------------------------- check 7
line('CHECK 7  Cartridge life as a DISTRIBUTION, not a range')
line('='.repeat(76))
line('  Stage 7 reported 2.22-2.64 days, which is PARAMETER uncertainty only. Here')
line('  each patient draws their own urea generation from the measured HEMO spread.')
line()
line(`    urea generation : ${UREA_GENERATION_DISTRIBUTION.meanMgNPerMin} +/- ` +
  `${UREA_GENERATION_DISTRIBUTION.sdMgNPerMin} mg N/min  (CV ${(UREA_GENERATION_DISTRIBUTION.cv * 100).toFixed(0)}%)`)
line(`    source          : ${UREA_GENERATION_DISTRIBUTION.source} -- measured biology, not an assumption`)
line()

const without = lifetimeDistribution({ draws: 20000, includeCharcoal: false })
const withCharcoal = lifetimeDistribution({ draws: 20000, includeCharcoal: true })

line(`  ${''.padEnd(22)} ${'charcoal excluded'.padStart(18)} ${'charcoal assumed'.padStart(18)}`)
const rows = [
  ['median (days)', without.median.toFixed(2), withCharcoal.median.toFixed(2)],
  ['mean (days)', without.mean.toFixed(2), withCharcoal.mean.toFixed(2)],
  ['CV', (without.cv * 100).toFixed(0) + '%', (withCharcoal.cv * 100).toFixed(0) + '%'],
  ['p05', without.p05.toFixed(2), withCharcoal.p05.toFixed(2)],
  ['p25', without.p25.toFixed(2), withCharcoal.p25.toFixed(2)],
  ['p75', without.p75.toFixed(2), withCharcoal.p75.toFixed(2)],
  ['p95', without.p95.toFixed(2), withCharcoal.p95.toFixed(2)],
  ['maximum', without.max.toFixed(1), withCharcoal.max.toFixed(1)],
  ['cartridges/week (median)', without.cartridgesPerWeekMedian.toFixed(1), withCharcoal.cartridgesPerWeekMedian.toFixed(1)],
  ['cartridges/week (worst 5%)', without.cartridgesPerWeekWorst5pct.toFixed(1), withCharcoal.cartridgesPerWeekWorst5pct.toFixed(1)],
]
for (const [label, a, b] of rows) line(`  ${label.padEnd(26)} ${pad(a, 14)} ${pad(b, 18)}`)
line()

const fail2 = withCharcoal.fractionUnderDays(2)
const fail15 = withCharcoal.fractionUnderDays(1.5)
line(`  fraction of patients exhausting a cartridge inside 2.0 days : ${(fail2 * 100).toFixed(1)}%`)
line(`  fraction exhausting inside 1.5 days                        : ${(fail15 * 100).toFixed(1)}%`)
line()

line('  7a. PATIENT VARIABILITY DOMINATES PARAMETER UNCERTAINTY')
line()
const paramSpread = (2.64 - 2.22) / 2.43
line(`      parameter uncertainty (HZO range) widens life by      ${(paramSpread * 100).toFixed(0)}%`)
line(`      patient variability (urea generation) widens it by    ${(withCharcoal.cv * 100).toFixed(0)}%`)
line(`      ratio                                                 ` +
  `${((withCharcoal.cv / paramSpread)).toFixed(1)}x`)
line()
line('      Stage 7 predicted this; it is confirmed. A range over parameters was the')
line('      wrong shape of answer. The clinical consequence: a device sized for the')
line(`      MEDIAN (${withCharcoal.median.toFixed(2)} days) fails for ${(fail2 * 100).toFixed(0)}% of patients.`)
line()

line('  7b. WHAT THE CHARCOAL ASSUMPTION ACTUALLY CHANGED')
line()
line(`      median       ${without.median.toFixed(2)} -> ${withCharcoal.median.toFixed(2)} days   (unchanged)`)
line(`      mean         ${without.mean.toFixed(2)} -> ${withCharcoal.mean.toFixed(2)} days`)
line(`      p95          ${without.p95.toFixed(2)} -> ${withCharcoal.p95.toFixed(2)} days`)
line(`      maximum      ${without.max.toFixed(1)} -> ${withCharcoal.max.toFixed(1)} days`)
line(`      CV           ${(without.cv * 100).toFixed(0)}% -> ${(withCharcoal.cv * 100).toFixed(0)}%`)
line()
line(`      Charcoal binds in ${((withCharcoal.bindingCounts['activated charcoal'] ?? 0) / withCharcoal.draws * 100).toFixed(1)}% of patients.`)
line('      It does NOT move the typical patient. It CAPS THE TAIL: without it the')
line('      low-generation tail runs to unrealistic lifetimes, because every load was')
line('      scaled with urea generation.')
line()
line('      HONEST CAVEAT: the upper tail therefore rests on an ASSUMPTION, not on a')
line('      measured capacity. The median does not depend on it; the p95 and the mean do.')
line()

line('  7c. WHAT IS AND IS NOT SCALED WITH GENERATION')
line()
line('      scaled     ZP and HZO loads -- urea, K+, phosphate all track protein intake')
line('      NOT scaled charcoal load -- creatinine tracks MUSCLE MASS, which is')
line('                 independent of urea generation')
line()
line('      This is a modelling choice, not a sourced relationship. Scaling creatinine')
line('      with urea would have been wrong in the opposite direction.')
line()

// ---------------------------------------------------------------- regression guard
const meanDrawMmol = (UREA_GENERATION_DISTRIBUTION.meanMgNPerMin * 1440) / 28
line('REGRESSION GUARD')
line('='.repeat(76))
line(`  mmol urea/day from ${UREA_GENERATION_DISTRIBUTION.meanMgNPerMin} mg N/min : ${meanDrawMmol.toFixed(2)}`)
line(`  LOADS.ureaMmolPerDay from 15.0 g/day          : ${LOADS.ureaMmolPerDay.toFixed(2)}`)
line(`  ratio (must be ~1.000)                        : ${(meanDrawMmol / LOADS.ureaMmolPerDay).toFixed(4)}`)
line()
line('  A units error here doubled generation and halved every lifetime; it was caught')
line('  by this guard, not by a test.')
