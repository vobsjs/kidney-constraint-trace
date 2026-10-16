#!/usr/bin/env node
/**
 * ============================================================================
 *  DESIGN COMPARISON -- HOST-SIDE. Answers the stage endpoint.
 * ============================================================================
 *
 * ENDPOINT
 *   Recover a dialyzer's KoA to within +/-10% from a budget of 8 bench clearance
 *   measurements, and test whether sequential D-optimal choice of the operating
 *   points beats a fixed lattice or random choice.
 *
 * Design of the experiment:
 *   - five true KoA values spanning real devices and real solutes (myoglobin at
 *     151 mL/min through urea at 1431 mL/min);
 *   - 200 noise seeds per KoA;
 *   - all four designs see the SAME noise realisation per seed, so the
 *     comparison is paired;
 *   - an oracle static design computed AT THE TRUTH bounds what any
 *     non-adaptive design could achieve.
 *
 * Run:  node compare_designs.mjs [seeds] [sigma]
 */

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  openSession,
  estimateKoA,
  BUDGET,
  TRUTH_SCENARIOS,
  NOISE_PROPORTIONAL_SD,
} from './koa_benchmark.mjs'
import { makeStrategy, STRATEGY_NAMES } from './strategies.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const sd = (xs) => {
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}
function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const p = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  const c = 1 - (Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI)) * p
  return z >= 0 ? c : 1 - c
}
function pairedTest(a, b) {
  const d = a.map((v, i) => v - b[i])
  const m = mean(d)
  const s = sd(d)
  const t = m / (s / Math.sqrt(d.length))
  return { meanDifference: m, t, p: 2 * (1 - normalCdf(Math.abs(t))), wins: d.filter((v) => v < 0).length, n: d.length }
}

function runDesign({ seed, koA, sigma, name }) {
  const session = openSession({ seed, koA, sigma, budget: BUDGET })
  const strategy = makeStrategy(name, seed, koA)
  const trace = []
  while (session.remaining > 0) {
    const choice = strategy.next({ observations: session.measurements, step: trace.length, estimator: (m) => estimateKoA(m, sigma) })
    const measured = session.measure(choice.Qb, choice.Qd, choice.rationale)
    trace.push({ ...choice, measured: measured.clearanceMlMin })
  }
  const fit = estimateKoA(session.measurements, sigma)
  return {
    estimate: fit.koA,
    relError: Math.abs(fit.koA - koA) / koA,
    signedError: (fit.koA - koA) / koA,
    measurements: session.measurements,
    trace,
  }
}

function main() {
  const seeds = Number(process.argv[2] ?? 200)
  const sigma = Number(process.argv[3] ?? NOISE_PROPORTIONAL_SD)
  const scenarios = Object.entries(TRUTH_SCENARIOS)

  process.stdout.write(`KoA identification: ${scenarios.length} true KoA x ${seeds} seeds x ${STRATEGY_NAMES.length} designs x ${BUDGET} measurements\n`)
  process.stdout.write(`measurement noise: proportional, SD = ${(sigma * 100).toFixed(1)}%\n`)
  process.stdout.write(`endpoint: |KoA_hat - KoA| / KoA <= 10%\n\n`)

  const started = Date.now()
  const results = {}
  for (const [scenario, koA] of scenarios) {
    results[scenario] = { koA, byDesign: {} }
    for (const name of STRATEGY_NAMES) {
      const runs = []
      for (let seed = 1; seed <= seeds; seed += 1) runs.push(runDesign({ seed, koA, sigma, name }))
      results[scenario].byDesign[name] = runs
    }
  }
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)

  // ---------------- per scenario ----------------
  for (const [scenario, data] of Object.entries(results)) {
    process.stdout.write(`true KoA = ${data.koA} mL/min  (${scenario})\n`)
    process.stdout.write('-'.repeat(84) + '\n')
    process.stdout.write(
      `  ${'design'.padEnd(10)} ${'median err'.padStart(11)} ${'mean err'.padStart(10)} ${'within 10%'.padStart(12)} ${'within 5%'.padStart(11)}\n`,
    )
    for (const name of STRATEGY_NAMES) {
      const errs = data.byDesign[name].map((r) => r.relError)
      const within10 = errs.filter((e) => e <= 0.1).length / errs.length
      const within5 = errs.filter((e) => e <= 0.05).length / errs.length
      process.stdout.write(
        `  ${name.padEnd(10)} ${(median(errs) * 100).toFixed(2).padStart(10)}% ${(mean(errs) * 100).toFixed(2).padStart(9)}% ` +
          `${(within10 * 100).toFixed(1).padStart(11)}% ${(within5 * 100).toFixed(1).padStart(10)}%\n`,
      )
    }
    process.stdout.write('\n')
  }

  // ---------------- paired comparisons, pooled ----------------
  process.stdout.write('paired comparisons, pooled across all true KoA values\n')
  process.stdout.write('='.repeat(84) + '\n')
  const pooled = {}
  for (const name of STRATEGY_NAMES) {
    pooled[name] = scenarios.flatMap(([s]) => results[s].byDesign[name].map((r) => r.relError))
  }
  const active = pooled.active8
  const comparisons = {}
  for (const base of ['uniform8', 'oracle8', 'random8']) {
    const t = pairedTest(active, pooled[base])
    const reduction = 1 - mean(active) / mean(pooled[base])
    comparisons[base] = { ...t, reduction }
    process.stdout.write(
      `  active8 vs ${base.padEnd(9)} mean err ${(mean(active) * 100).toFixed(2)}% vs ${(mean(pooled[base]) * 100).toFixed(2)}%  ` +
        `(${(reduction * 100).toFixed(1)}% ${reduction > 0 ? 'lower' : 'higher'})\n` +
        `  ${' '.repeat(19)}t = ${t.t.toFixed(3)}  p = ${t.p.toExponential(2)}  active wins ${t.wins}/${t.n}\n`,
    )
  }

  process.stdout.write('\nendpoint: fraction of runs recovering KoA within 10%\n')
  process.stdout.write('='.repeat(84) + '\n')
  const endpoint = {}
  for (const name of STRATEGY_NAMES) {
    const hit = pooled[name].filter((e) => e <= 0.1).length / pooled[name].length
    endpoint[name] = hit
    process.stdout.write(`  ${name.padEnd(10)} ${(hit * 100).toFixed(1)}%\n`)
  }

  // ---------------- what the active rule actually chose ----------------
  process.stdout.write('\nwhere the active rule spent its budget (true KoA 1431, seed 1)\n')
  process.stdout.write('='.repeat(84) + '\n')
  const example = results.urea_mid.byDesign.active8[0]
  for (const step of example.trace) {
    process.stdout.write(`  ${String(step.Qb).padStart(3)} / ${String(step.Qd).padStart(3)} -> ${step.measured.toFixed(1)} mL/min\n`)
  }
  const chosen = new Set(example.trace.map((t) => `${t.Qb}|${t.Qd}`))
  const uniformSet = new Set(['150|300', '150|500', '250|300', '250|500', '350|300', '350|500', '400|300', '400|500'])
  const overlap = [...chosen].filter((c) => uniformSet.has(c)).length
  process.stdout.write(`  overlap with the uniform lattice: ${overlap}/8 points\n`)

  writeFileSync(
    join(here, 'design_comparison.json'),
    `${JSON.stringify(
      {
        generatedBy: 'compare_designs.mjs',
        seeds,
        sigma,
        budget: BUDGET,
        endpoint: 'relative KoA error <= 10%',
        scenarios: Object.fromEntries(
          Object.entries(results).map(([s, d]) => [
            s,
            {
              trueKoA: d.koA,
              byDesign: Object.fromEntries(
                STRATEGY_NAMES.map((n) => [
                  n,
                  {
                    medianRelError: median(d.byDesign[n].map((r) => r.relError)),
                    meanRelError: mean(d.byDesign[n].map((r) => r.relError)),
                    within10pct: d.byDesign[n].filter((r) => r.relError <= 0.1).length / seeds,
                  },
                ]),
              ),
            },
          ]),
        ),
        pooled: Object.fromEntries(STRATEGY_NAMES.map((n) => [n, { meanRelError: mean(pooled[n]), medianRelError: median(pooled[n]) }])),
        comparisons,
        endpointHitRate: endpoint,
        elapsedSeconds: Number(elapsed),
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  process.stdout.write(`\nfitted in ${elapsed}s; wrote design_comparison.json\n`)
}

main()
