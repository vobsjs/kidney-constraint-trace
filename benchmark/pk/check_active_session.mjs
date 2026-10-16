#!/usr/bin/env node
/**
 * Score the interactive LLM session: external check + statistical placement.
 *
 * 1. External check -- the parameters recovered from the 12 NOISY observations
 *    are evaluated against the sealed NOISE-FREE curve. This is the same gate
 *    the static benchmark used, so the two stages stay comparable.
 * 2. Statistical placement -- each parameter's deviation from truth is
 *    standardised against the active strategy's sampling distribution
 *    (strategy_comparison.json, 200 seeds), which is the "statistical
 *    uncertainty allowed by the noise" that criterion 1 refers to.
 *
 * Run:  node check_active_session.mjs
 */

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { SEALED_TRUTH, BUDGET } from './simulator.mjs'
import { PARAMETER_NAMES, rmseOf } from './estimator.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = process.env.BENCHMARK_REPO ?? resolve(here, '..', '..')
const { simulateCurve } = await import(pathToFileURL(join(REPO, 'evaluator', 'pk_model.mjs')).href)
const { loadRegimen } = await import(pathToFileURL(join(REPO, 'tools', 'reference_optimizer.mjs')).href)

const TRUTH_VECTOR = [
  SEALED_TRUTH.clearanceAtCrcl92LPerH,
  SEALED_TRUTH.crclSlopePerMlMin,
  SEALED_TRUTH.volumeOfDistributionL,
]
/** The static stage's shipped baseline, for a like-for-like comparison. */
const BASELINE = [6.0, 0.003, 40.0]

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const percentileOf = (sorted, v) => sorted.filter((x) => x <= v).length / sorted.length

function main() {
  const session = JSON.parse(readFileSync(join(here, 'sessions', 'llm-session.json'), 'utf8'))
  const estimate = session.final.parameters
  const comparison = JSON.parse(readFileSync(join(here, 'strategy_comparison.json'), 'utf8'))

  // ---- external check against the sealed noise-free curve -------------------
  const text = readFileSync(join(here, 'reference_points_noiseless.csv'), 'utf8')
  const noiseless = text.split(/\r?\n/).filter((l) => l.trim() !== '').slice(1).map((line) => {
    const [crclMlMin, timeH, observedMgL] = line.split(',').map(Number)
    return { crclMlMin, timeH, observedMgL }
  })
  const regimen = loadRegimen()

  const rmseOnNoiseless = (v) => {
    const params = Object.fromEntries(PARAMETER_NAMES.map((n, i) => [n, v[i]]))
    const sim = simulateCurve(params, regimen, noiseless)
    let sse = 0
    for (let i = 0; i < noiseless.length; i += 1) {
      const r = sim[i].predictedMgL - noiseless[i].observedMgL
      sse += r * r
    }
    return Math.sqrt(sse / noiseless.length)
  }

  process.stdout.write('EXTERNAL CHECK -- 12-observation ACTIVE-LOOP estimate vs the NOISE-FREE curve\n')
  process.stdout.write('='.repeat(78) + '\n')
  process.stdout.write(`noise-free points : ${noiseless.length}\n`)
  process.stdout.write(`sha256            : ${createHash('sha256').update(text, 'utf8').digest('hex')}\n`)
  process.stdout.write(`observations used : ${session.spent}/${BUDGET} (budget ${session.budget})\n\n`)

  const scores = {
    truth: rmseOnNoiseless(TRUTH_VECTOR),
    baseline: rmseOnNoiseless(BASELINE),
    session: rmseOnNoiseless(estimate),
  }
  process.stdout.write('RMSE against the NOISE-FREE curve (mg/L):\n')
  process.stdout.write(`  truth (reference)          ${scores.truth.toExponential(4)}\n`)
  process.stdout.write(`  static-stage baseline      ${scores.baseline.toFixed(6)}\n`)
  process.stdout.write(`  active-loop 12-obs estimate ${scores.session.toFixed(6)}\n`)
  process.stdout.write(`  improvement over baseline  ${(scores.baseline / scores.session).toFixed(2)}x\n\n`)

  // ---- statistical placement -----------------------------------------------
  process.stdout.write('deviation from truth, standardised against the active sampling distribution\n')
  process.stdout.write('(200 seeds x 12 observations; the noise-allowed statistical uncertainty)\n')
  process.stdout.write('='.repeat(78) + '\n')
  process.stdout.write(
    `  ${'parameter'.padEnd(24)} ${'truth'.padStart(10)} ${'session'.padStart(12)} ${'rel dev'.padStart(9)} ` +
      `${'MC SD'.padStart(10)} ${'z'.padStart(7)}  verdict\n`,
  )
  const zs = {}
  PARAMETER_NAMES.forEach((name, k) => {
    const dist = comparison.activeSamplingDistribution[name]
    const rel = (estimate[k] - TRUTH_VECTOR[k]) / TRUTH_VECTOR[k]
    const z = (estimate[k] - TRUTH_VECTOR[k]) / dist.sd
    zs[name] = z
    process.stdout.write(
      `  ${name.padEnd(24)} ${TRUTH_VECTOR[k].toFixed(6).padStart(10)} ${estimate[k].toFixed(8).padStart(12)} ` +
        `${(rel * 100).toFixed(2).padStart(8)}% ${dist.sd.toExponential(3).padStart(10)} ${(z >= 0 ? '+' : '') + z.toFixed(2).padStart(6)}  ` +
        `${Math.abs(z) <= 2 ? 'within +/-2 SD' : 'outside +/-2 SD'}\n`,
    )
  })

  // Where does the session's MARE sit in the active strategy's MARE distribution?
  const activeMares = comparison.activeSamplingDistribution
  const mareSd = mean(Object.values(activeMares).map((d) => d.cv))
  const sessionMare = mean(PARAMETER_NAMES.map((n, k) => Math.abs(estimate[k] - TRUTH_VECTOR[k]) / TRUTH_VECTOR[k]))
  process.stdout.write(`\nsession mean absolute relative error: ${(sessionMare * 100).toFixed(2)}%\n`)
  process.stdout.write(
    `  active strategy across 200 seeds: mean ${(comparison.summary.active.meanMare * 100).toFixed(2)}%, ` +
      `median ${(comparison.summary.active.medianMare * 100).toFixed(2)}%\n`,
  )
  process.stdout.write(
    `  uniform12 across 200 seeds: mean ${(comparison.summary.uniform12.meanMare * 100).toFixed(2)}%, ` +
      `median ${(comparison.summary.uniform12.medianMare * 100).toFixed(2)}%\n`,
  )
  process.stdout.write(
    `  oracleStatic across 200 seeds: mean ${(comparison.summary.oracleStatic.meanMare * 100).toFixed(2)}%\n`,
  )
  process.stdout.write(`  parameter SDs (relative): ${(mareSd * 100).toFixed(1)}% average\n`)

  process.stdout.write('\npassed gates:\n')
  process.stdout.write(`  external check (RMSE < baseline)      : ${scores.session < scores.baseline ? 'PASS' : 'FAIL'}\n`)
  process.stdout.write(`  external check (RMSE < 1.0 mg/L)      : ${scores.session < 1.0 ? 'PASS' : 'FAIL'}\n`)
  const within = Object.values(zs).every((z) => Math.abs(z) <= 2)
  process.stdout.write(`  all parameters within +/-2 SD         : ${within ? 'PASS' : 'BORDERLINE'}\n`)
}

main()
