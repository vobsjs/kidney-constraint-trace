#!/usr/bin/env node
/**
 * ============================================================================
 *  ACTIVE-EXPERIMENT SIMULATOR -- HOST-SIDE. Contains the sealed noise field.
 * ============================================================================
 *
 * Interface contract (this is what makes the loop "active"):
 *
 *   - The full noisy dataset is NEVER exposed. It is materialised inside the
 *     session closure and is reachable only one point at a time, through
 *     query().
 *   - One query returns exactly ONE observation: one CrCl stratum, one time.
 *   - The budget is 12 observations. Query 13 throws.
 *   - Re-querying an already-seen point returns the cached value and does NOT
 *     consume budget (it carries no new information).
 *
 * The noise realisation is a deterministic function of the seed, so two
 * strategies evaluated on the same seed see the SAME noise at the SAME points.
 * That is what makes the strategy comparison in compare_strategies.mjs a paired
 * test rather than a comparison of two different random draws.
 *
 * The candidate grid is the 6 CrCl strata x 6 sampling times used by the static
 * predecessor, so the active loop and the static benchmark interrogate the same
 * underlying curve.
 */

import { TRUTH, DESIGN, NOISE, generate } from './generate_reference_data.mjs'

export const STRATA_ML_MIN = Object.freeze([...DESIGN.crclStrataMlMin])
export const TIMES_H = Object.freeze([...DESIGN.sampleTimesH])
export const BUDGET = 12
export const GRID = Object.freeze(
  STRATA_ML_MIN.flatMap((crclMlMin) => TIMES_H.map((timeH) => Object.freeze({ crclMlMin, timeH }))),
)

const keyOf = (crclMlMin, timeH) => `${crclMlMin}|${timeH}`

/** Materialise the sealed field: deterministic given the seed. */
function buildField(seed) {
  const field = new Map()
  for (const row of generate(seed)) {
    field.set(keyOf(row.crclMlMin, row.timeH), {
      crclMlMin: row.crclMlMin,
      timeH: row.timeH,
      sd: row.sd,
      concentrationMgL: row.noisyMgL,
    })
  }
  return field
}

/**
 * Open an experiment session.
 *
 * The returned object is the ONLY handle on the data. `field` is captured in
 * the closure and is not a property of the result, not serialisable, and not
 * enumerable -- a caller cannot walk it.
 */
export function openSession({ seed, budget = BUDGET }) {
  if (!Number.isInteger(budget) || budget <= 0) throw new TypeError('budget must be a positive integer')
  const field = buildField(seed)
  const observations = []
  const log = []
  let spent = 0

  function query(crclMlMin, timeH, rationale = '') {
    const key = keyOf(crclMlMin, timeH)
    const point = field.get(key)
    if (point === undefined) {
      throw new RangeError(
        `point not on the candidate grid: CrCl=${crclMlMin}, t=${timeH}. ` +
          `Allowed CrCl: ${STRATA_ML_MIN.join(', ')}; allowed t: ${TIMES_H.join(', ')}`,
      )
    }
    const alreadySeen = observations.find((o) => o.crclMlMin === crclMlMin && o.timeH === timeH)
    if (alreadySeen !== undefined) {
      log.push({ n: log.length + 1, crclMlMin, timeH, duplicate: true, rationale, budgetSpent: spent })
      return { ...alreadySeen, duplicate: true, remaining: budget - spent }
    }
    if (spent >= budget) {
      throw new RangeError(`budget exhausted: ${budget} observations already collected`)
    }
    spent += 1
    const observation = {
      crclMlMin: point.crclMlMin,
      timeH: point.timeH,
      concentrationMgL: point.concentrationMgL,
    }
    observations.push(observation)
    log.push({ n: log.length + 1, crclMlMin, timeH, duplicate: false, rationale, budgetSpent: spent })
    return { ...observation, duplicate: false, remaining: budget - spent }
  }

  return Object.freeze({
    query,
    get observations() {
      return observations.map((o) => ({ ...o }))
    },
    get queryLog() {
      return log.map((l) => ({ ...l }))
    },
    get remaining() {
      return budget - spent
    },
    get spent() {
      return spent
    },
    budget,
    seed,
  })
}

/** Noise standard deviation at a prediction, from the published error model. */
export function noiseSd(predictedMgL) {
  return Math.sqrt((NOISE.proportional * predictedMgL) ** 2 + NOISE.additiveMgL ** 2)
}

/** Truth accessor, for Host-side scoring only. Never hand this to a strategy. */
export const SEALED_TRUTH = Object.freeze({ ...TRUTH })
