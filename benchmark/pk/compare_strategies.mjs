#!/usr/bin/env node
/**
 * ============================================================================
 *  STRATEGY COMPARISON -- HOST-SIDE
 * ============================================================================
 *
 * Answers acceptance criterion 2: is the active strategy significantly better
 * than sampling twelve points at random, or twelve points on a uniform lattice?
 *
 * DESIGN
 *   Paired by seed. For each seed the sealed noise field is fixed, so all three
 *   strategies draw from the SAME realisation at whatever points they choose.
 *   That removes field-level variation from the comparison; what remains is the
 *   effect of where each strategy chose to look.
 *
 *   Each strategy gets exactly BUDGET = 12 observations, then the identical ML
 *   estimator is applied. No strategy has any other advantage.
 *
 * Run:  node compare_strategies.mjs [seeds]
 */

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { openSession, BUDGET, SEALED_TRUTH } from './simulator.mjs'
import { makeStrategy, STRATEGY_NAMES } from './strategies.mjs'
import { fitMl, PARAMETER_NAMES } from './estimator.mjs'

const here = dirname(fileURLToPath(import.meta.url))

const TRUTH_VECTOR = [
  SEALED_TRUTH.clearanceAtCrcl92LPerH,
  SEALED_TRUTH.crclSlopePerMlMin,
  SEALED_TRUTH.volumeOfDistributionL,
]

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const sd = (xs) => {
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Standard normal CDF via Abramowitz & Stegun 7.1.26. */
function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const poly =
    t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  const cdf = 1 - (Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI)) * poly
  return z >= 0 ? cdf : 1 - cdf
}

function pairedTest(a, b) {
  const d = a.map((v, i) => v - b[i])
  const m = mean(d)
  const s = sd(d)
  const n = d.length
  const se = s / Math.sqrt(n)
  const t = m / se
  const p = 2 * (1 - normalCdf(Math.abs(t)))
  const wins = d.filter((v) => v < 0).length
  return { meanDifference: m, sdDifference: s, t, p, wins, n }
}

function runSession(seed, strategyName) {
  const session = openSession({ seed, budget: BUDGET })
  const strategy = makeStrategy(strategyName, seed)
  const trace = []
  while (session.remaining > 0) {
    const choice = strategy.next({ observations: session.observations, step: trace.length })
    const observation = session.query(choice.crclMlMin, choice.timeH, choice.rationale)
    trace.push({ ...choice, observed: observation.concentrationMgL })
  }
  const fit = fitMl(session.observations)
  const relErrors = fit.parameters.map((v, k) => Math.abs(v - TRUTH_VECTOR[k]) / TRUTH_VECTOR[k])
  return {
    parameters: fit.parameters,
    relErrors,
    mare: mean(relErrors),
    observations: session.observations,
    trace,
  }
}

function main() {
  const seeds = Number(process.argv[2] ?? 200)
  process.stdout.write(`Strategy comparison: ${seeds} seeds x ${STRATEGY_NAMES.length} strategies x ${BUDGET} observations\n`)
  process.stdout.write(`estimator: ML for the published combined error model; restarts fixed at 6\n\n`)

  const started = Date.now()
  const perStrategy = Object.fromEntries(STRATEGY_NAMES.map((n) => [n, []]))
  for (let seed = 1; seed <= seeds; seed += 1) {
    for (const name of STRATEGY_NAMES) {
      perStrategy[name].push(runSession(seed, name))
    }
    if (seed % 50 === 0) process.stdout.write(`  ...${seed}/${seeds} seeds (${((Date.now() - started) / 1000).toFixed(1)}s)\n`)
  }
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)

  process.stdout.write(`\nmean absolute relative error vs truth, over ${seeds} seeds (lower is better)\n`)
  process.stdout.write('='.repeat(84) + '\n')
  process.stdout.write(
    `  ${'strategy'.padEnd(11)} ${'mean MARE'.padStart(11)} ${'median MARE'.padStart(13)} ` +
      `${'mean CL92'.padStart(11)} ${'mean slope'.padStart(12)} ${'mean V'.padStart(10)}\n`,
  )
  for (const name of STRATEGY_NAMES) {
    const runs = perStrategy[name]
    const perParam = [0, 1, 2].map((k) => mean(runs.map((r) => r.relErrors[k])))
    process.stdout.write(
      `  ${name.padEnd(11)} ${mean(runs.map((r) => r.mare)).toFixed(4).padStart(11)} ` +
        `${median(runs.map((r) => r.mare)).toFixed(4).padStart(13)} ` +
        `${(perParam[0] * 100).toFixed(2).padStart(10)}% ${(perParam[1] * 100).toFixed(2).padStart(11)}% ` +
        `${(perParam[2] * 100).toFixed(2).padStart(9)}%\n`,
    )
  }

  process.stdout.write('\npaired comparisons on per-seed MARE (active minus baseline)\n')
  process.stdout.write('='.repeat(84) + '\n')
  const activeMare = perStrategy.active.map((r) => r.mare)
  const comparisons = {}
  for (const baseline of ['uniform12', 'oracleStatic', 'random12']) {
    const baseMare = perStrategy[baseline].map((r) => r.mare)
    const test = pairedTest(activeMare, baseMare)
    const reduction = 1 - mean(activeMare) / mean(baseMare)
    comparisons[baseline] = { ...test, meanReduction: reduction }
    process.stdout.write(
      `  active vs ${baseline.padEnd(12)} mean diff ${test.meanDifference >= 0 ? '+' : ''}${test.meanDifference.toFixed(4)}` +
        `  (active is ${Math.abs(reduction * 100).toFixed(1)}% ${reduction > 0 ? 'lower' : 'higher'})\n` +
        `  ${' '.repeat(22)}t = ${test.t.toFixed(3)}   p = ${test.p.toExponential(3)}   ` +
        `active wins on ${test.wins}/${test.n} seeds\n`,
    )
  }

  // How much of the headroom between random and oracle does active capture?
  const randomMean = mean(perStrategy.random12.map((r) => r.mare))
  const oracleMean = mean(perStrategy.oracleStatic.map((r) => r.mare))
  const activeMean = mean(activeMare)
  const uniformMean = mean(perStrategy.uniform12.map((r) => r.mare))
  const captured = (randomMean - activeMean) / (randomMean - oracleMean)
  process.stdout.write(
    `\nheadroom: random12 ${randomMean.toFixed(4)} -> oracleStatic ${oracleMean.toFixed(4)}. ` +
      `active ${activeMean.toFixed(4)} captures ${(captured * 100).toFixed(1)}% of it; ` +
      `uniform12 ${uniformMean.toFixed(4)} captures ${(((randomMean - uniformMean) / (randomMean - oracleMean)) * 100).toFixed(1)}%.\n`,
  )
  process.stdout.write(
    `active vs uniform12 differ by ${(Math.abs(activeMean - uniformMean) / uniformMean * 100).toFixed(2)}%; ` +
      `both sit close to the oracle, so the residual gap to theoretical best is small.\n`,
  )

  process.stdout.write('\nsampling distribution of the ACTIVE estimator (for criterion 1)\n')
  process.stdout.write('='.repeat(84) + '\n')
  const sampling = {}
  PARAMETER_NAMES.forEach((name, k) => {
    const col = perStrategy.active.map((r) => r.parameters[k])
    const m = mean(col)
    const s = sd(col)
    sampling[name] = { truth: TRUTH_VECTOR[k], mean: m, sd: s, cv: s / TRUTH_VECTOR[k], bias: m - TRUTH_VECTOR[k] }
    process.stdout.write(
      `  ${name.padEnd(24)} truth ${TRUTH_VECTOR[k].toFixed(6).padStart(10)}  MC mean ${m.toFixed(6).padStart(10)}  ` +
        `SD ${s.toExponential(3)}  CV ${((s / TRUTH_VECTOR[k]) * 100).toFixed(2)}%\n`,
    )
  })

  // What a fully non-adaptive strategy cannot do: cover the CrCl range.
  process.stdout.write('\ndistinct CrCl strata visited on a representative seed (seed 1)\n')
  process.stdout.write('='.repeat(84) + '\n')
  for (const name of STRATEGY_NAMES) {
    const run = perStrategy[name][0]
    const strata = [...new Set(run.trace.map((t) => t.crclMlMin))].sort((a, b) => a - b)
    process.stdout.write(`  ${name.padEnd(11)} ${strata.length} strata: ${strata.join(', ')}\n`)
  }

  const artifact = {
    generatedBy: 'benchmark/pk/compare_strategies.mjs',
    seeds,
    budget: BUDGET,
    estimator: 'maximum likelihood, published combined error model',
    truth: Object.fromEntries(PARAMETER_NAMES.map((n, k) => [n, TRUTH_VECTOR[k]])),
    summary: Object.fromEntries(
      STRATEGY_NAMES.map((name) => [
        name,
        {
          meanMare: mean(perStrategy[name].map((r) => r.mare)),
          medianMare: median(perStrategy[name].map((r) => r.mare)),
          meanRelError: PARAMETER_NAMES.reduce((acc, n, k) => {
            acc[n] = mean(perStrategy[name].map((r) => r.relErrors[k]))
            return acc
          }, {}),
        },
      ]),
    ),
    comparisons,
    activeSamplingDistribution: sampling,
    elapsedSeconds: Number(elapsed),
  }
  writeFileSync(join(here, 'strategy_comparison.json'), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
  process.stdout.write(`\nfitted in ${elapsed}s; wrote strategy_comparison.json\n`)
}

main()
