#!/usr/bin/env node
/** Pooled per-run statistics for the design comparison, at a given noise level. */
import { openSession, estimateKoA, BUDGET, TRUTH_SCENARIOS } from './koa_benchmark.mjs'
import { makeStrategy, STRATEGY_NAMES } from './strategies.mjs'

const seeds = Number(process.argv[2] ?? 200)
const sigma = Number(process.argv[3] ?? 0.03)
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const errs = Object.fromEntries(STRATEGY_NAMES.map((n) => [n, []]))
for (const [, koA] of Object.entries(TRUTH_SCENARIOS)) {
  for (let seed = 1; seed <= seeds; seed += 1) {
    for (const name of STRATEGY_NAMES) {
      const s = openSession({ seed, koA, sigma, budget: BUDGET })
      const strat = makeStrategy(name, seed, koA)
      while (s.remaining > 0) {
        const c = strat.next({ observations: s.measurements, step: 0, estimator: (m) => estimateKoA(m, sigma) })
        s.measure(c.Qb, c.Qd, c.rationale)
      }
      errs[name].push(Math.abs(estimateKoA(s.measurements, sigma).koA - koA) / koA)
    }
  }
}
console.log(`pooled over ${seeds} seeds x ${Object.keys(TRUTH_SCENARIOS).length} true KoA, sigma=${sigma}`)
console.log('design      mean     median   within5%  within10%')
for (const n of STRATEGY_NAMES) {
  const e = errs[n]
  console.log(
    n.padEnd(11),
    (mean(e) * 100).toFixed(2).padStart(6) + '%',
    (median(e) * 100).toFixed(2).padStart(7) + '%',
    ((e.filter((x) => x <= 0.05).length / e.length) * 100).toFixed(1).padStart(8) + '%',
    ((e.filter((x) => x <= 0.1).length / e.length) * 100).toFixed(1).padStart(9) + '%',
  )
}
