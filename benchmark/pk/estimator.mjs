#!/usr/bin/env node
/**
 * ============================================================================
 *  ESTIMATOR FOR THE ACTIVE LOOP -- HOST-SIDE
 * ============================================================================
 *
 * Uses the maximum-likelihood estimator for the published combined error model:
 *
 *   -2 log L = SUM [ (y - f)^2 / SD(f)^2 + log(SD(f)^2) ]
 *
 * Chosen over unweighted least squares because the previous stage's ledger
 * established that, under this heteroscedastic published error, unweighted LS
 * gives roughly 99 % of its objective weight to the high-concentration early
 * samples that carry almost no information about the CrCl slope. With a budget
 * of only 12 observations that inefficiency is unaffordable.
 *
 * The same likelihood supplies the Fisher information used by the D-optimal
 * selector, so design and estimation are consistent.
 */

import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'

import { NOISE, DESIGN } from './generate_reference_data.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = process.env.BENCHMARK_REPO ?? resolve(here, '..', '..')
const { nelderMead } = await import(pathToFileURL(join(REPO, 'tools', 'reference_optimizer.mjs')).href)
const { simulateCurve } = await import(pathToFileURL(join(REPO, 'evaluator', 'pk_model.mjs')).href)

export const PARAMETER_NAMES = Object.freeze([
  'clearanceAtCrcl92LPerH',
  'crclSlopePerMlMin',
  'volumeOfDistributionL',
])

export const REGIMEN = Object.freeze({
  doseMg: DESIGN.doseMgPerKg * DESIGN.bodyWeightKg,
  infusionHours: DESIGN.infusionHours,
})

/** Restarts spanning plausible PK space. None of them is the truth. */
export const FIT_STARTS = Object.freeze([
  [2.0, 0.005, 15.0],
  [5.0, 0.02, 30.0],
  [1.0, 0.001, 10.0],
  [10.0, 0.05, 60.0],
  [3.5, 0.01, 22.0],
  [6.0, 0.002, 45.0],
])

export function predictAt(parameters, crclMlMin, timeH) {
  const params = Object.fromEntries(PARAMETER_NAMES.map((n, i) => [n, parameters[i]]))
  const [row] = simulateCurve(params, REGIMEN, [{ crclMlMin, timeH }])
  return row.predictedMgL
}

/** Negative twice the log-likelihood, per observation. Lower is better. */
export function makeMlObjective(observations) {
  return function objective(v) {
    if (!(v[0] > 0) || v[1] < 0 || !(v[2] > 0)) return Number.POSITIVE_INFINITY
    let nll = 0
    for (const o of observations) {
      const f = predictAt(v, o.crclMlMin, o.timeH)
      if (!Number.isFinite(f) || f <= 0) return Number.POSITIVE_INFINITY
      const variance = (NOISE.proportional * f) ** 2 + NOISE.additiveMgL ** 2
      nll += ((f - o.concentrationMgL) ** 2) / variance + Math.log(variance)
    }
    return nll / observations.length
  }
}

/** Multi-start ML fit. Returns the best parameters and objective value. */
export function fitMl(observations, starts = FIT_STARTS) {
  if (observations.length === 0) throw new Error('cannot fit with no observations')
  const objective = makeMlObjective(observations)
  let best = null
  for (const start of starts) {
    const result = nelderMead(objective, start)
    if (best === null || result.rmse < best.value) best = { value: result.rmse, parameters: result.parameters }
  }
  return { parameters: best.parameters, value: best.value, objective }
}

/** Unweighted-RMSE objective, i.e. the metric the static predecessor reported. */
export function makeRmseObjective(observations) {
  return function objective(v) {
    if (!(v[0] > 0) || v[1] < 0 || !(v[2] > 0)) return Number.POSITIVE_INFINITY
    let sse = 0
    for (const o of observations) {
      const r = predictAt(v, o.crclMlMin, o.timeH) - o.concentrationMgL
      sse += r * r
    }
    return Math.sqrt(sse / observations.length)
  }
}

/** Multi-start unweighted least squares, for the estimator comparison. */
export function fitRmse(observations, starts = FIT_STARTS) {
  if (observations.length === 0) throw new Error('cannot fit with no observations')
  const objective = makeRmseObjective(observations)
  let best = null
  for (const start of starts) {
    const result = nelderMead(objective, start)
    if (best === null || result.rmse < best.value) best = { value: result.rmse, parameters: result.parameters }
  }
  return { parameters: best.parameters, value: best.value, objective }
}

/** Unweighted RMSE, the metric the static predecessor reported. */
export function rmseOf(parameters, observations) {
  let sse = 0
  for (const o of observations) {
    const r = predictAt(parameters, o.crclMlMin, o.timeH) - o.concentrationMgL
    sse += r * r
  }
  return Math.sqrt(sse / observations.length)
}

/**
 * Sensitivity of the prediction to each LOG-parameter, by central difference.
 * Working in log-parameters makes the three very differently scaled parameters
 * commensurate, which matters for a determinant-based design criterion.
 */
export function logSensitivity(parameters, crclMlMin, timeH, h = 1e-4) {
  return parameters.map((p, k) => {
    const up = [...parameters]
    const down = [...parameters]
    up[k] = p * (1 + h)
    down[k] = p * (1 - h)
    return (predictAt(up, crclMlMin, timeH) - predictAt(down, crclMlMin, timeH)) / (2 * h)
  })
}

/**
 * Fisher information contributed by one observation, in log-parameter space.
 * Weighted by 1/SD^2 from the published error model.
 */
export function pointInformation(parameters, crclMlMin, timeH) {
  const f = predictAt(parameters, crclMlMin, timeH)
  const variance = (NOISE.proportional * f) ** 2 + NOISE.additiveMgL ** 2
  const g = logSensitivity(parameters, crclMlMin, timeH)
  return g.map((gi) => g.map((gj) => (gi * gj) / variance))
}

/** Sum of 3x3 matrices. */
export function addMatrices(a, b) {
  return a.map((row, i) => row.map((v, j) => v + b[i][j]))
}

/** Determinant of a 3x3 matrix, by cofactor expansion. */
export function determinant3(m) {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  )
}

export function zeroInformation() {
  return [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
}
