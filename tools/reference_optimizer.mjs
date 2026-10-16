#!/usr/bin/env node
/**
 * Reference optimizer for the gentamicin creatinine-clearance PK benchmark.
 *
 * PURPOSE
 *   `dsh-autoresearch` cannot run on this Windows host (its StateLayout enforces
 *   POSIX owner-only mode bits, which are unsatisfiable on win32). This script
 *   performs the same optimisation the autoresearch run was meant to perform --
 *   minimise rmse_mg_l over model/params.json -- using a deterministic
 *   multi-start Nelder-Mead, so the scientific result does not depend on the
 *   plugin.
 *
 *   It does NOT modify model/params.json. It reports the fitted optimum and
 *   compares it against the published Duong 2022 (Bos 2019) estimates.
 *
 * WHY MULTI-START
 *   Independent restarts from widely separated initial guesses demonstrate that
 *   the optimum is unique and the three parameters are jointly identifiable from
 *   this reference curve.
 *
 * Run:  node tools/reference_optimizer.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { simulateCurve } from '../evaluator/pk_model.mjs'
import { PUBLISHED } from './generate_reference_data.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')

const PUBLISHED_VECTOR = [
  PUBLISHED.clearanceAtCrcl92LPerH,
  PUBLISHED.crclSlopePerMlMin,
  PUBLISHED.volumeOfDistributionL,
]
const PARAMETER_NAMES = [
  'clearanceAtCrcl92LPerH',
  'crclSlopePerMlMin',
  'volumeOfDistributionL',
]

function loadReference() {
  const text = readFileSync(join(repoRoot, 'data', 'reference_points.csv'), 'utf8')
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  return lines.slice(1).map((line) => {
    const [crclMlMin, timeH, observedMgL] = line.split(',').map(Number)
    return { crclMlMin, timeH, observedMgL }
  })
}

function loadRegimen() {
  const dataset = JSON.parse(readFileSync(join(repoRoot, 'data', 'dataset.json'), 'utf8'))
  return { doseMg: dataset.regimen.dose_mg, infusionHours: dataset.regimen.infusion_hours }
}

/** rmse_mg_l for a parameter vector given in natural units. Any infeasible vector scores Infinity. */
function makeObjective(reference, regimen) {
  return function objective([clearanceAtCrcl92LPerH, crclSlopePerMlMin, volumeOfDistributionL]) {
    if (!(clearanceAtCrcl92LPerH > 0) || crclSlopePerMlMin < 0 || !(volumeOfDistributionL > 0)) {
      return Number.POSITIVE_INFINITY
    }
    const params = { clearanceAtCrcl92LPerH, crclSlopePerMlMin, volumeOfDistributionL }
    const simulated = simulateCurve(params, regimen, reference)
    let sumSquaredError = 0
    for (let i = 0; i < reference.length; i += 1) {
      const residual = simulated[i].predictedMgL - reference[i].observedMgL
      sumSquaredError += residual * residual
    }
    return Math.sqrt(sumSquaredError / reference.length)
  }
}

/**
 * Nelder-Mead downhill simplex, run in log-parameter space so positivity
 * constraints hold by construction. Deterministic.
 */
function nelderMead(objective, start, { maxIterations = 4000, tolerance = 1e-15 } = {}) {
  const n = start.length
  const toNatural = (v) => v.map(Math.exp)
  const evaluate = (v) => objective(toNatural(v))

  let simplex = [start.map(Math.log)]
  for (let i = 0; i < n; i += 1) {
    const point = start.map(Math.log)
    point[i] += 0.6
    simplex.push(point)
  }
  let values = simplex.map(evaluate)

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b])
    simplex = order.map((i) => simplex[i])
    values = order.map((i) => values[i])
    if (Math.abs(values[n] - values[0]) < tolerance) break

    const centroid = Array.from({ length: n }, (_, j) =>
      simplex.slice(0, n).reduce((sum, point) => sum + point[j], 0) / n)

    const reflect = centroid.map((c, j) => c + (c - simplex[n][j]))
    const reflectedValue = evaluate(reflect)

    if (reflectedValue < values[0]) {
      const expand = centroid.map((c, j) => c + 2 * (c - simplex[n][j]))
      const expandedValue = evaluate(expand)
      if (expandedValue < reflectedValue) {
        simplex[n] = expand
        values[n] = expandedValue
      } else {
        simplex[n] = reflect
        values[n] = reflectedValue
      }
    } else if (reflectedValue < values[n - 1]) {
      simplex[n] = reflect
      values[n] = reflectedValue
    } else {
      const contract = centroid.map((c, j) => c + 0.5 * (simplex[n][j] - c))
      const contractedValue = evaluate(contract)
      if (contractedValue < values[n]) {
        simplex[n] = contract
        values[n] = contractedValue
      } else {
        for (let i = 1; i <= n; i += 1) {
          simplex[i] = simplex[i].map((v, j) => (v + simplex[0][j]) / 2)
          values[i] = evaluate(simplex[i])
        }
      }
    }
  }

  const best = values.indexOf(Math.min(...values))
  return { parameters: toNatural(simplex[best]), rmse: values[best] }
}

function main() {
  const reference = loadReference()
  const regimen = loadRegimen()
  const objective = makeObjective(reference, regimen)

  const baseline = [6.0, 0.003, 40.0]
  const starts = [
    baseline,
    [1.0, 0.001, 10.0],
    [10.0, 0.02, 60.0],
    [3.0, 0.005, 25.0],
    [2.0, 0.03, 15.0],
    [8.0, 0.0005, 5.0],
  ]

  const results = starts.map((start) => ({ start, ...nelderMead(objective, start) }))
  results.sort((a, b) => a.rmse - b.rmse)
  const best = results[0]
  const spread = results[results.length - 1].rmse - best.rmse

  process.stdout.write(`reference points           : ${reference.length}\n`)
  process.stdout.write(`baseline RMSE (mg/L)       : ${objective(baseline).toFixed(6)}\n`)
  process.stdout.write(`optimised RMSE (mg/L)      : ${best.rmse.toExponential(4)}\n\n`)

  process.stdout.write('multi-start convergence (uniqueness of the optimum):\n')
  for (const r of results) {
    process.stdout.write(
      `  from [${r.start.map((v) => v.toString().padStart(7)).join(', ')}] -> ` +
        `rmse ${r.rmse.toExponential(3)}  ` +
        `[${r.parameters.map((v) => v.toFixed(6)).join(', ')}]\n`,
    )
  }
  process.stdout.write(`  worst-start minus best-start RMSE: ${spread.toExponential(3)}\n\n`)

  process.stdout.write('parameter recovery against the published values:\n')
  let maxRelativeDeviation = 0
  PARAMETER_NAMES.forEach((name, i) => {
    const fitted = best.parameters[i]
    const published = PUBLISHED_VECTOR[i]
    const deviation = Math.abs(fitted - published) / published
    maxRelativeDeviation = Math.max(maxRelativeDeviation, deviation)
    process.stdout.write(
      `  ${name.padEnd(24)} fitted ${fitted.toFixed(8).padStart(13)}  ` +
        `published ${String(published).padStart(9)}  deviation ${(deviation * 100).toFixed(6)}%\n`,
    )
  })
  process.stdout.write(`  max relative deviation: ${(maxRelativeDeviation * 100).toExponential(3)}%\n\n`)

  // Implied non-renal clearance, for the external check documented in README.md.
  const [cl92, slope] = best.parameters
  const implied = cl92 * (1 + slope * (0 - PUBLISHED.crclReferenceMlMin))
  process.stdout.write(`implied non-renal clearance at CrCl = 0 : ${implied.toFixed(4)} L/h = ${(implied * 1000 / 60).toFixed(2)} mL/min\n`)
  process.stdout.write('  (Veinstein 2013 Table 4 independently reports 0.1205 mL/min/kg = 9.1 mL/min at 75.6 kg)\n\n')

  const underTarget = best.rmse <= 1e-4
  process.stdout.write(`meets the autoresearch target of 1e-4 mg/L: ${underTarget ? 'YES' : 'NO'}\n`)

  const artifact = {
    generatedBy: 'tools/reference_optimizer.mjs',
    note: 'Reference optimisation performed locally because dsh-autoresearch cannot run on win32 (StateLayout POSIX mode check is unsatisfiable).',
    referencePoints: reference.length,
    metric: 'rmse_mg_l',
    target: 1e-4,
    baselineRmseMgL: objective(baseline),
    optimisedRmseMgL: best.rmse,
    fitted: Object.fromEntries(PARAMETER_NAMES.map((n, i) => [n, best.parameters[i]])),
    published: Object.fromEntries(PARAMETER_NAMES.map((n, i) => [n, PUBLISHED_VECTOR[i]])),
    maxRelativeDeviation,
    multiStart: results.map((r) => ({ start: r.start, rmseMgL: r.rmse, parameters: r.parameters })),
    meetsTarget: underTarget,
  }
  mkdirSync(join(repoRoot, 'results'), { recursive: true })
  writeFileSync(join(repoRoot, 'results', 'reference_fit.json'), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
  process.stdout.write('\nwrote results/reference_fit.json\n')
}

main()
