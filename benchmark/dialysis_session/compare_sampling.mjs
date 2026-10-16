#!/usr/bin/env node
/**
 * ============================================================================
 *  SAMPLING-DESIGN COMPARISON -- HOST-SIDE. Answers the stage endpoint.
 * ============================================================================
 *
 * ENDPOINT
 *   Recover the EQUILIBRATED Kt/V to within +/-0.05 Kt/V units from 4 blood
 *   samples, one of which (pre-dialysis) is mandatory.
 *
 * WHY 0.05
 *   The naive clinical shortcut -- single-pool Kt/V from the immediate
 *   end-of-session sample -- is biased LOW on dose by ~0.26 units in this model,
 *   because it cannot see the rebound. A protocol whose residual error is 0.05 is
 *   therefore five times better than the shortcut it replaces, and sits well
 *   inside the ~0.1-0.2 Kt/V granularity at which dose targets are set.
 *
 * Run:  node compare_sampling.mjs [seeds] [sigma]
 */

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  openSession,
  estimateFromSamples,
  concentrationAt,
  truthEKtV,
  TIME_GRID,
  BUDGET,
  SESSION_MINUTES,
  NOISE_PROPORTIONAL_SD,
  TRUTH_SCENARIOS,
} from './session_simulator.mjs'

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
  const s = sd(d)
  const t = mean(d) / (s / Math.sqrt(d.length))
  return { t, p: 2 * (1 - normalCdf(Math.abs(t))), wins: d.filter((v) => v < 0).length, n: d.length }
}

function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Relative sensitivity of BUN(t) to a change in Kc. Where the information lives. */
function logSensitivity(minute, kcMult) {
  const h = 1e-3
  const up = concentrationAt(minute, kcMult * (1 + h))
  const down = concentrationAt(minute, kcMult * (1 - h))
  return (up - down) / (2 * h) / concentrationAt(minute, kcMult)
}

const BUYABLE = TIME_GRID.filter((t) => t !== 0)

// ---------------------------------------------------------------------------
// standard4 -- what a unit actually does: pre, one intradialytic, end, +30 min.
// ---------------------------------------------------------------------------
export const STANDARD_TIMES = Object.freeze([0, 120, 240, 270])
function standard4() {
  let i = 0
  return {
    name: 'standard4',
    next() {
      const minute = STANDARD_TIMES[i]
      i += 1
      return { minute, rationale: `conventional protocol draw ${i}/${STANDARD_TIMES.length}` }
    },
  }
}

// ---------------------------------------------------------------------------
// random4 -- pre plus three uniformly random draw times.
// ---------------------------------------------------------------------------
function random4(seed) {
  const rand = mulberry32((seed ^ 0xc2b2ae35) >>> 0)
  const pool = [...BUYABLE]
  const chosen = [0]
  while (chosen.length < BUDGET) chosen.push(pool.splice(Math.floor(rand() * pool.length), 1)[0])
  chosen.sort((a, b) => a - b)
  let i = 0
  return {
    name: 'random4',
    next() {
      const minute = chosen[i]
      i += 1
      return { minute, rationale: `uniform random draw ${i}/${BUDGET}` }
    },
  }
}

// ---------------------------------------------------------------------------
// active4 -- sequential D-optimal for one parameter: buy the time with the
// largest |d ln BUN / d ln Kc|, re-evaluated after every sample.
// ---------------------------------------------------------------------------
function active4() {
  const taken = new Set()
  let current = 16 // prior: the HEMO reference multiple
  return {
    name: 'active4',
    next({ samples, estimator }) {
      if (samples.length >= 2) {
        try {
          const fit = estimator(samples)
          if (Number.isFinite(fit.kcMult) && fit.kcMult > 0) current = fit.kcMult
        } catch {
          /* keep the previous estimate */
        }
      }
      const ranked = BUYABLE.filter((t) => !taken.has(t))
        .map((t) => ({ minute: t, info: Math.abs(logSensitivity(t, current)) }))
        .sort((a, b) => b.info - a.info)
      const best = ranked[0]
      taken.add(best.minute)
      return {
        minute: best.minute,
        rationale:
          `D-optimal: largest |d ln BUN / d ln Kc| = ${best.info.toFixed(4)} at the current ` +
          `estimate Kc = ${current.toFixed(1)}xV. Runner-up +${ranked[1].minute} min (${ranked[1].info.toFixed(4)}).`,
        diagnostics: { sensitivity: best.info, ranked: ranked.slice(0, 4) },
      }
    },
  }
}

// ---------------------------------------------------------------------------
// oracle4 -- best static design computed at the true Kc. Upper bound.
// ---------------------------------------------------------------------------
function oracle4(kcMult) {
  const ranked = [...BUYABLE].sort(
    (a, b) => Math.abs(logSensitivity(b, kcMult)) - Math.abs(logSensitivity(a, kcMult)),
  )
  const design = [0, ...ranked.slice(0, BUDGET - 1)].sort((a, b) => a - b)
  let i = 0
  return {
    name: 'oracle4',
    next() {
      const minute = design[i]
      i += 1
      return { minute, rationale: `oracle static design (computed at the true Kc), draw ${i}/${BUDGET}` }
    },
  }
}

const DESIGNS = ['standard4', 'random4', 'active4', 'oracle4']
function makeDesign(name, seed, kcMult) {
  if (name === 'standard4') return standard4()
  if (name === 'random4') return random4(seed)
  if (name === 'active4') return active4()
  if (name === 'oracle4') return oracle4(kcMult)
  throw new Error(name)
}

function main() {
  const seeds = Number(process.argv[2] ?? 200)
  const sigma = Number(process.argv[3] ?? NOISE_PROPORTIONAL_SD)

  process.stdout.write('Post-dialysis rebound sampling: recovering EQUILIBRATED Kt/V\n')
  process.stdout.write(`  ${Object.keys(TRUTH_SCENARIOS).length} true Kc x ${seeds} seeds x ${DESIGNS.length} designs x ${BUDGET} samples\n`)
  process.stdout.write(`  assay noise ${(sigma * 100).toFixed(1)}% proportional | endpoint |eKt/V error| <= 0.05\n\n`)

  // ---- where the information lives ----
  process.stdout.write('Sensitivity of BUN to the intercompartmental clearance, |d ln BUN / d ln Kc|\n')
  process.stdout.write('='.repeat(80) + '\n')
  process.stdout.write(`  ${'minute'.padStart(7)} ${['slow(10x)'.padStart(10), 'ref(16x)'.padStart(10), 'fast(24x)'.padStart(10)].join(' ')}  phase\n`)
  for (const t of TIME_GRID) {
    const vals = [10, 16, 24].map((k) => Math.abs(logSensitivity(t, k)).toFixed(4).padStart(10))
    const phase = t === 0 ? 'pre' : t <= SESSION_MINUTES ? 'intradialytic' : 'rebound'
    process.stdout.write(`  ${String(t).padStart(7)} ${vals.join(' ')}  ${phase}\n`)
  }
  process.stdout.write('\n')

  // ---- run ----
  const started = Date.now()
  const results = {}
  for (const [scenario, kcMult] of Object.entries(TRUTH_SCENARIOS)) {
    const truth = truthEKtV(kcMult)
    results[scenario] = { kcMult, truth, byDesign: {}, naive: [], rateEquation: [] }
    for (let seed = 1; seed <= seeds; seed += 1) {
      for (const name of DESIGNS) {
        const session = openSession({ seed, kcMult, sigma, budget: BUDGET })
        const design = makeDesign(name, seed, kcMult)
        while (session.remaining > 0) {
          const choice = design.next({ samples: session.samples, estimator: (s) => estimateFromSamples(s, { sigma }) })
          session.draw(choice.minute, choice.rationale)
        }
        const fit = estimateFromSamples(session.samples, { sigma })
        ;(results[scenario].byDesign[name] ??= []).push({
          eKtV: fit.eKtV,
          error: Math.abs(fit.eKtV - truth.eKtV),
          signedError: fit.eKtV - truth.eKtV,
        })
      }
      // The clinical shortcut: spKt/V straight from the immediate post sample.
      const naive = openSession({ seed, kcMult, sigma, budget: BUDGET })
      naive.draw(0, 'pre')
      naive.draw(240, 'immediate post')
      const sp = Math.log(naive.samples[0].bunMgNPerL / naive.samples[1].bunMgNPerL)
      results[scenario].naive.push({ eKtV: sp, error: Math.abs(sp - truth.eKtV), signedError: sp - truth.eKtV })

      // The actual standard of care: spKt/V plus the Daugirdas rate-equation
      // rebound correction. This costs NO extra blood sample, so it is the arm any
      // claim for extra sampling has to beat.
      const hours = SESSION_MINUTES / 60
      const corrected = sp - (0.6 * sp) / hours + 0.03
      results[scenario].rateEquation.push({
        eKtV: corrected,
        error: Math.abs(corrected - truth.eKtV),
        signedError: corrected - truth.eKtV,
      })
    }
  }
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)

  // ---- per scenario ----
  for (const [scenario, data] of Object.entries(results)) {
    process.stdout.write(`true Kc = ${data.kcMult}xV (${scenario})  ->  true eKt/V ${data.truth.eKtV.toFixed(3)}, spKt/V ${data.truth.spKtV.toFixed(3)}, rebound ${(data.truth.reboundFraction * 100).toFixed(1)}%\n`)
    process.stdout.write('-'.repeat(80) + '\n')
    const rows = [['single-pool (no corr.)', data.naive], ['spKt/V + rate eqn', data.rateEquation], ...DESIGNS.map((n) => [n, data.byDesign[n]])]
    for (const [label, runs] of rows) {
      const errs = runs.map((r) => r.error)
      const bias = mean(runs.map((r) => r.signedError))
      process.stdout.write(
        `  ${label.padEnd(22)} median ${median(errs).toFixed(3)}  mean ${mean(errs).toFixed(3)}  ` +
          `bias ${(bias >= 0 ? '+' : '') + bias.toFixed(3)}  within 0.05 ${((errs.filter((e) => e <= 0.05).length / errs.length) * 100).toFixed(1)}%\n`,
      )
    }
    process.stdout.write('\n')
  }

  // ---- pooled ----
  process.stdout.write('pooled across all true Kc\n')
  process.stdout.write('='.repeat(80) + '\n')
  const pooled = {}
  for (const name of ['naive', 'rateEquation', ...DESIGNS]) {
    pooled[name] = Object.values(results).flatMap((d) => (name === 'naive' ? d.naive : name === 'rateEquation' ? d.rateEquation : d.byDesign[name]).map((r) => r.error))
  }
  for (const name of ['naive', 'rateEquation', ...DESIGNS]) {
    const label = name === 'naive' ? 'single-pool (no corr.)' : name === 'rateEquation' ? 'spKt/V + rate eqn' : name
    process.stdout.write(
      `  ${label.padEnd(22)} median ${median(pooled[name]).toFixed(3)}  mean ${mean(pooled[name]).toFixed(3)}  ` +
        `endpoint hit ${((pooled[name].filter((e) => e <= 0.05).length / pooled[name].length) * 100).toFixed(1)}%\n`,
    )
  }
  process.stdout.write('\npaired comparisons on per-run |error|\n')
  const comparisons = {}
  for (const base of ['standard4', 'random4', 'oracle4']) {
    const t = pairedTest(pooled.active4, pooled[base])
    comparisons[base] = t
    process.stdout.write(
      `  active4 vs ${base.padEnd(10)} mean ${mean(pooled.active4).toFixed(3)} vs ${mean(pooled[base]).toFixed(3)}  ` +
        `t = ${t.t.toFixed(3)}  p = ${t.p.toExponential(2)}  active wins ${t.wins}/${t.n}\n`,
    )
  }

  writeFileSync(
    join(here, 'sampling_comparison.json'),
    `${JSON.stringify(
      {
        generatedBy: 'compare_sampling.mjs',
        seeds,
        sigma,
        budget: BUDGET,
        endpoint: 'absolute eKt/V error <= 0.05',
        pooled: Object.fromEntries(
          Object.entries(pooled).map(([k, v]) => [k, { median: median(v), mean: mean(v), hit: v.filter((e) => e <= 0.05).length / v.length }]),
        ),
        comparisons,
        perScenario: Object.fromEntries(
          Object.entries(results).map(([s, d]) => [
            s,
            { kcMult: d.kcMult, trueEKtV: d.truth.eKtV, trueSpKtV: d.truth.spKtV, rebound: d.truth.reboundFraction },
          ]),
        ),
        elapsedSeconds: Number(elapsed),
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  process.stdout.write(`\nfitted in ${elapsed}s; wrote sampling_comparison.json\n`)
}

main()
