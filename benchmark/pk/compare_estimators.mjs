#!/usr/bin/env node
/**
 * ESTIMATOR COMPARISON IN THE ACTIVE SETTING -- HOST-SIDE
 *
 * The static stage chose maximum likelihood over unweighted least squares on
 * evidence at 36 observations. With only 12 adaptive observations the trade-off
 * could differ, so it is re-measured rather than inherited.
 *
 * Both estimators see exactly the same 12 observations from exactly the same
 * strategy on exactly the same seed. Only the objective differs.
 *
 * Run:  node compare_estimators.mjs [seeds]
 */

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { openSession, BUDGET, SEALED_TRUTH } from './simulator.mjs'
import { makeStrategy } from './strategies.mjs'
import { fitMl, fitRmse, PARAMETER_NAMES } from './estimator.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const TRUTH_VECTOR = [
  SEALED_TRUTH.clearanceAtCrcl92LPerH,
  SEALED_TRUTH.crclSlopePerMlMin,
  SEALED_TRUTH.volumeOfDistributionL,
]
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length

function main() {
  const seeds = Number(process.argv[2] ?? 200)
  const strategies = ['uniform12', 'random12', 'active']
  process.stdout.write(`Estimator comparison: ${seeds} seeds x ${strategies.length} strategies x ${BUDGET} observations\n\n`)

  const rows = []
  for (const strategyName of strategies) {
    const perEstimator = { ml: [], ls: [] }
    for (let seed = 1; seed <= seeds; seed += 1) {
      const session = openSession({ seed, budget: BUDGET })
      const strategy = makeStrategy(strategyName, seed)
      while (session.remaining > 0) {
        const c = strategy.next({ observations: session.observations, step: 0 })
        session.query(c.crclMlMin, c.timeH, '')
      }
      for (const [key, fit] of [['ml', fitMl], ['ls', fitRmse]]) {
        const p = fit(session.observations).parameters
        perEstimator[key].push(mean(p.map((v, k) => Math.abs(v - TRUTH_VECTOR[k]) / TRUTH_VECTOR[k])))
      }
    }
    const mlMean = mean(perEstimator.ml)
    const lsMean = mean(perEstimator.ls)
    rows.push({ strategy: strategyName, mlMean, lsMean })
    process.stdout.write(
      `  ${strategyName.padEnd(11)} ML ${(mlMean * 100).toFixed(2).padStart(6)}%   ` +
        `unweighted LS ${(lsMean * 100).toFixed(2).padStart(6)}%   ` +
        `-> ${mlMean < lsMean ? 'ML better' : 'unweighted LS better'}\n`,
    )
  }

  writeFileSync(
    join(here, 'estimator_comparison.json'),
    `${JSON.stringify({ generatedBy: 'compare_estimators.mjs', seeds, rows }, null, 2)}\n`,
    'utf8',
  )
  process.stdout.write('\nwrote estimator_comparison.json\n')
}

main()
