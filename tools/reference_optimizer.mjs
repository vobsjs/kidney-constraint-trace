#!/usr/bin/env node
/**
 * Reference optimizer for the gentamicin creatinine-clearance PK benchmark.
 *
 * Fits the observations collected in the active session. This file deliberately
 * has no knowledge of the true parameter values: it reads only
 * data/session_observations.csv, and it is the same routine the Host-side Monte
 * Carlo study reuses, so the uncertainty it reports is the uncertainty of the
 * exact procedure used here.
 *
 * The noise-free curve and the true values now live inside the repository, under
 * benchmark/pk/, together with the full PK ledger. The seal was retired: see
 * PK_LEDGER.md.
 *
 * `dsh-autoresearch` cannot run on this Windows host (its StateLayout requires
 * POSIX owner-only mode bits, unsatisfiable on win32), so this script performs
 * the minimisation that the autoresearch loop would otherwise perform.
 *
 * Run:  node tools/reference_optimizer.mjs
 *       (also importable: fitParameters, nelderMead, loadReferencePoints)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { simulateCurve } from '../evaluator/pk_model.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')

export const PARAMETER_NAMES = Object.freeze([
  'clearanceAtCrcl92LPerH',
  'crclSlopePerMlMin',
  'volumeOfDistributionL',
])

/** The shipped starting point (model/params.json). */
export const BASELINE = Object.freeze([6.0, 0.003, 40.0])

/**
 * Widely separated restarts. Their agreement is the identifiability evidence:
 * a unique optimum is reached from every one of them.
 */
export const DEFAULT_STARTS = Object.freeze([
  [...BASELINE],
  [1.0, 0.001, 10.0],
  [10.0, 0.02, 60.0],
  [3.0, 0.005, 25.0],
  [2.0, 0.03, 15.0],
  [8.0, 0.0005, 5.0],
])

/** Read a reference table of {crclMlMin, timeH, observedMgL}. */
export function parseReferenceCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
  if (lines.length < 2) throw new Error('reference table has no data rows')
  const header = lines[0].split(',').map((c) => c.trim())
  const iCrcl = header.indexOf('crcl_ml_min')
  const iTime = header.indexOf('time_h')
  const iConc = header.indexOf('concentration_mg_l')
  if (iCrcl < 0 || iTime < 0 || iConc < 0) throw new Error('reference table header is not recognised')
  return lines.slice(1).map((line) => {
    const cells = line.split(',')
    const point = {
      crclMlMin: Number(cells[iCrcl]),
      timeH: Number(cells[iTime]),
      observedMgL: Number(cells[iConc]),
    }
    if (!Object.values(point).every(Number.isFinite)) throw new Error(`malformed row: ${line}`)
    return point
  })
}

export function loadReferencePoints(root = repoRoot) {
  return parseReferenceCsv(readFileSync(join(root, 'data', 'session_observations.csv'), 'utf8'))
}

export function loadRegimen(root = repoRoot) {
  const dataset = JSON.parse(readFileSync(join(root, 'data', 'dataset.json'), 'utf8'))
  const { dose_mg: doseMg, infusion_hours: infusionHours } = dataset.regimen
  if (!Number.isFinite(doseMg) || !Number.isFinite(infusionHours)) {
    throw new Error('data/dataset.json must define regimen.dose_mg and regimen.infusion_hours')
  }
  return { doseMg, infusionHours }
}

/** Unweighted RMSE objective -- the same scalar evaluator/judge.mjs reports. */
export function makeObjective(reference, regimen) {
  return function objective([clearanceAtCrcl92LPerH, crclSlopePerMlMin, volumeOfDistributionL]) {
    if (!(clearanceAtCrcl92LPerH > 0) || crclSlopePerMlMin < 0 || !(volumeOfDistributionL > 0)) {
      return Number.POSITIVE_INFINITY
    }
    const simulated = simulateCurve(
      { clearanceAtCrcl92LPerH, crclSlopePerMlMin, volumeOfDistributionL },
      regimen,
      reference,
    )
    let sumSquaredError = 0
    for (let i = 0; i < reference.length; i += 1) {
      const residual = simulated[i].predictedMgL - reference[i].observedMgL
      sumSquaredError += residual * residual
    }
    return Math.sqrt(sumSquaredError / reference.length)
  }
}

/**
 * Nelder-Mead downhill simplex in log-parameter space, so positivity holds by
 * construction. Deterministic: identical inputs give bit-identical output.
 */
export function nelderMead(objective, start, { maxIterations = 4000, tolerance = 1e-15 } = {}) {
  const n = start.length
  const evaluate = (v) => objective(v.map(Math.exp))

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
  return { parameters: simplex[best].map(Math.exp), rmse: values[best] }
}

/** Multi-start fit. Returns every restart plus the best, for identifiability evidence. */
export function fitParameters(reference, regimen, starts = DEFAULT_STARTS) {
  const objective = makeObjective(reference, regimen)
  const results = starts.map((start) => ({ start: [...start], ...nelderMead(objective, start) }))
  results.sort((a, b) => a.rmse - b.rmse)
  return { objective, results, best: results[0] }
}

function main() {
  const reference = loadReferencePoints()
  const regimen = loadRegimen()
  const { objective, results, best } = fitParameters(reference, regimen)
  const spread = results[results.length - 1].rmse - best.rmse

  process.stdout.write(`reference points (noisy)   : ${reference.length}\n`)
  process.stdout.write(`baseline RMSE (mg/L)       : ${objective(BASELINE).toFixed(6)}\n`)
  process.stdout.write(`optimised RMSE (mg/L)      : ${best.rmse.toFixed(6)}\n\n`)

  process.stdout.write('multi-start convergence:\n')
  for (const r of results) {
    process.stdout.write(
      `  from [${r.start.map((v) => String(v).padStart(7)).join(', ')}] -> ` +
        `RMSE ${r.rmse.toFixed(6)}  [${r.parameters.map((v) => v.toFixed(6)).join(', ')}]\n`,
    )
  }
  process.stdout.write(`  worst-start minus best-start RMSE: ${spread.toExponential(3)}\n\n`)

  process.stdout.write('fitted parameters (natural units):\n')
  PARAMETER_NAMES.forEach((name, i) => {
    process.stdout.write(`  ${name.padEnd(24)} ${best.parameters[i].toFixed(8)}\n`)
  })

  const artifact = {
    generatedBy: 'tools/reference_optimizer.mjs',
    note: 'Fit of the NOISY reference curve. True values are not accessible from this repository; uncertainty and the external check are Host-side.',
    referencePoints: reference.length,
    metric: 'rmse_mg_l',
    baseline: { parameters: [...BASELINE], rmseMgL: objective(BASELINE) },
    optimised: {
      rmseMgL: best.rmse,
      parameters: Object.fromEntries(PARAMETER_NAMES.map((n, i) => [n, best.parameters[i]])),
    },
    multiStart: results.map((r) => ({
      start: r.start,
      rmseMgL: r.rmse,
      parameters: Object.fromEntries(PARAMETER_NAMES.map((n, i) => [n, r.parameters[i]])),
    })),
    worstMinusBestRmse: spread,
    referenceCsvSha256: null,
  }
  mkdirSync(join(repoRoot, 'results'), { recursive: true })
  writeFileSync(join(repoRoot, 'results', 'reference_fit.json'), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
  process.stdout.write('\nwrote results/reference_fit.json\n')
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href

if (invokedDirectly) main()
