#!/usr/bin/env node
/**
 * DIAGNOSTIC: why unweighted least squares fails, and whether weighting fixes it.
 *
 * The published residual error is heteroscedastic: SD rises with concentration.
 * The sampling design puts almost no slope information in the high-concentration
 * early samples (t = 0.5-2 h, where all CrCl strata overlap) and almost all of it
 * in the low-concentration late samples (t = 8-12 h, where they separate). An
 * unweighted objective therefore gives the informative points the least weight.
 *
 * This script compares, on identical data:
 *   (a) unweighted least squares  -- the shipped objective
 *   (b) weighted least squares    -- weights 1/SD^2 from the published error model
 *
 * and reports both the committed-seed recovery and the full sampling
 * distribution, so the choice is made on evidence.
 *
 * Run:  node compare_objectives.mjs [replicates]
 */

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { TRUTH, NOISE, DESIGN, SEED, generate } from './generate_reference_data.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = process.env.BENCHMARK_REPO ?? resolve(here, '..', '..')
const { nelderMead, PARAMETER_NAMES, BASELINE } = await import(
  pathToFileURL(join(REPO, 'tools', 'reference_optimizer.mjs')).href
)
const { simulateCurve } = await import(pathToFileURL(join(REPO, 'evaluator', 'pk_model.mjs')).href)

const TRUTH_VECTOR = [TRUTH.clearanceAtCrcl92LPerH, TRUTH.crclSlopePerMlMin, TRUTH.volumeOfDistributionL]
const regimen = { doseMg: DESIGN.doseMgPerKg * DESIGN.bodyWeightKg, infusionHours: DESIGN.infusionHours }
const STARTS = [[...BASELINE], [3.0, 0.005, 25.0], [10.0, 0.02, 60.0]]

/** Unweighted RMSE -- the shipped objective. */
function unweighted(rows) {
  return (v) => {
    if (!(v[0] > 0) || v[1] < 0 || !(v[2] > 0)) return Infinity
    const sim = simulateCurve(Object.fromEntries(PARAMETER_NAMES.map((n, i) => [n, v[i]])), regimen, rows)
    let sse = 0
    for (let i = 0; i < rows.length; i += 1) sse += (sim[i].predictedMgL - rows[i].observedMgL) ** 2
    return Math.sqrt(sse / rows.length)
  }
}

/** Weighted RMSE: residuals standardised by the published combined error model. */
function weighted(rows) {
  return (v) => {
    if (!(v[0] > 0) || v[1] < 0 || !(v[2] > 0)) return Infinity
    const sim = simulateCurve(Object.fromEntries(PARAMETER_NAMES.map((n, i) => [n, v[i]])), regimen, rows)
    let chi = 0
    for (let i = 0; i < rows.length; i += 1) {
      const sd = Math.sqrt((NOISE.proportional * sim[i].predictedMgL) ** 2 + NOISE.additiveMgL ** 2)
      chi += ((sim[i].predictedMgL - rows[i].observedMgL) / sd) ** 2
    }
    return Math.sqrt(chi / rows.length)
  }
}

/**
 * Weighted RMSE with weights computed from the OBSERVED value rather than the
 * model prediction. Because the weights no longer depend on the parameters, this
 * is a genuine fixed-weight least-squares problem: it keeps WLS's efficiency on
 * this heteroscedastic design without the plug-in-weight bias, and it is still an
 * RMSE, so it can serve directly as the benchmark metric.
 */
function observedWeighted(rows) {
  const weights = rows.map((r) => 1 / ((NOISE.proportional * r.observedMgL) ** 2 + NOISE.additiveMgL ** 2))
  return (v) => {
    if (!(v[0] > 0) || v[1] < 0 || !(v[2] > 0)) return Infinity
    const sim = simulateCurve(Object.fromEntries(PARAMETER_NAMES.map((n, i) => [n, v[i]])), regimen, rows)
    let chi = 0; let wsum = 0
    for (let i = 0; i < rows.length; i += 1) {
      chi += weights[i] * (sim[i].predictedMgL - rows[i].observedMgL) ** 2
      wsum += weights[i]
    }
    return Math.sqrt(chi / wsum)
  }
}
/**
 * Proper maximum likelihood for the published combined error model.
 *
 * The negative log-likelihood of y ~ N(f, SD(f)^2) is
 *   -2 log L = SUM [ (y - f)^2 / SD^2 + log(SD^2) ]
 * The log(SD^2) term is the Jacobian of the heteroscedastic transformation.
 * Omitting it -- as plain weighted least squares does -- biases the fit, because
 * SD depends on the parameters through f.
 */
function maximumLikelihood(rows) {
  return (v) => {
    if (!(v[0] > 0) || v[1] < 0 || !(v[2] > 0)) return Infinity
    const sim = simulateCurve(Object.fromEntries(PARAMETER_NAMES.map((n, i) => [n, v[i]])), regimen, rows)
    let nll = 0
    for (let i = 0; i < rows.length; i += 1) {
      const variance = (NOISE.proportional * sim[i].predictedMgL) ** 2 + NOISE.additiveMgL ** 2
      nll += ((sim[i].predictedMgL - rows[i].observedMgL) ** 2) / variance + Math.log(variance)
    }
    return nll / rows.length
  }
}

function fit(objectiveFactory, rows) {
  let best = null
  for (const start of STARTS) {
    const r = nelderMead(objectiveFactory(rows), start)
    if (best === null || r.rmse < best.rmse) best = r
  }
  return best
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const sd = (xs) => {
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}

// Committed (noisy) dataset, as the evaluator sees it.
const text = readFileSync(join(here, 'reference_points.csv'), 'utf8')
const committedRows = text.split(/\r?\n/).filter((l) => l.trim() !== '').slice(1).map((line) => {
  const [crclMlMin, timeH, observedMgL] = line.split(',').map(Number)
  return { crclMlMin, timeH, observedMgL }
})

// Noise-free truth, for the external check.
const ntext = readFileSync(join(here, 'reference_points_noiseless.csv'), 'utf8')
const noiselessRows = ntext.split(/\r?\n/).filter((l) => l.trim() !== '').slice(1).map((line) => {
  const [crclMlMin, timeH, observedMgL] = line.split(',').map(Number)
  return { crclMlMin, timeH, observedMgL }
})
const rmseOnNoiseless = (v) => {
  const sim = simulateCurve(Object.fromEntries(PARAMETER_NAMES.map((n, i) => [n, v[i]])), regimen, noiselessRows)
  let sse = 0
  for (let i = 0; i < noiselessRows.length; i += 1) sse += (sim[i].predictedMgL - noiselessRows[i].observedMgL) ** 2
  return Math.sqrt(sse / noiselessRows.length)
}

const replicates = Number(process.argv[2] ?? 200)

process.stdout.write(`committed dataset (seed ${SEED}) -- parameter recovery\n`)
process.stdout.write('='.repeat(78) + '\n')
for (const [label, factory] of [['unweighted LS', unweighted], ['weighted LS  ', weighted], ['max likelihood', maximumLikelihood], ['obs-weighted', observedWeighted]]) {
  const best = fit(factory, committedRows)
  const rel = PARAMETER_NAMES.map((_, i) => ((best.parameters[i] - TRUTH_VECTOR[i]) / TRUTH_VECTOR[i]) * 100)
  process.stdout.write(
    `${label}  [${best.parameters.map((v) => v.toFixed(6)).join(', ')}]\n` +
      `                rel dev ${rel.map((r) => ((r >= 0 ? '+' : '') + r.toFixed(2) + '%').padStart(9)).join(' ')}\n` +
      `                external check on the NOISE-FREE curve: ${rmseOnNoiseless(best.parameters).toExponential(4)} mg/L\n`,
  )
}

process.stdout.write(`\nsampling distribution over ${replicates} independent seeds\n`)
process.stdout.write('='.repeat(78) + '\n')
process.stdout.write(
  `  ${'objective'.padEnd(14)} ${'parameter'.padEnd(24)} ${'MC mean'.padStart(11)} ` +
    `${'MC SD'.padStart(11)} ${'CV%'.padStart(8)} ${'bias%'.padStart(8)}\n`,
)
const store = {}
for (const [label, factory] of [['unweighted', unweighted], ['weighted', weighted], ['maxlike', maximumLikelihood], ['obswt', observedWeighted]]) {
  const est = []
  for (let i = 1; i <= replicates; i += 1) {
    const rows = generate(i).map((r) => ({ crclMlMin: r.crclMlMin, timeH: r.timeH, observedMgL: r.noisyMgL }))
    est.push(fit(factory, rows).parameters)
  }
  store[label] = est
  PARAMETER_NAMES.forEach((name, j) => {
    const col = est.map((e) => e[j])
    const m = mean(col)
    const s = sd(col)
    process.stdout.write(
      `  ${label.padEnd(14)} ${name.padEnd(24)} ${m.toFixed(6).padStart(11)} ${s.toExponential(3).padStart(11)} ` +
        `${((s / TRUTH_VECTOR[j]) * 100).toFixed(2).padStart(7)}% ` +
        `${(((m - TRUTH_VECTOR[j]) / TRUTH_VECTOR[j]) * 100).toFixed(2).padStart(7)}%\n`,
    )
  })
}

process.stdout.write('\ncommitted-seed standardised deviations (z) under each objective\n')
process.stdout.write('='.repeat(78) + '\n')
for (const [label, factory] of [['unweighted', unweighted], ['weighted', weighted], ['maxlike', maximumLikelihood], ['obswt', observedWeighted]]) {
  const best = fit(factory, committedRows)
  const col = store[label]
  PARAMETER_NAMES.forEach((name, j) => {
    const s = sd(col.map((e) => e[j]))
    const z = (best.parameters[j] - TRUTH_VECTOR[j]) / s
    process.stdout.write(
      `  ${label.padEnd(12)} ${name.padEnd(24)} z = ${(z >= 0 ? '+' : '') + z.toFixed(3)}  ` +
        `${Math.abs(z) <= 2 ? 'within +/-2 SD' : 'OUTSIDE +/-2 SD'}\n`,
    )
  })
}
