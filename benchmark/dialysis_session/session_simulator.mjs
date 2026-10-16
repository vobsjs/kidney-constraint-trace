#!/usr/bin/env node
/**
 * ============================================================================
 *  SEALED SAMPLING SIMULATOR -- HOST-SIDE
 * ============================================================================
 *
 * This file holds ONLY the sealed material for the post-dialysis sampling
 * benchmark: the true exchange parameters, and the noise realisation.
 *
 * Everything else -- the time grid, the forward model, and the estimator that the
 * protocol's analysis plan refers to -- now lives in the REPOSITORY at
 * dialysis_session/estimator.mjs, because a clinical collaborator must be able to
 * run the analysis without access to this directory. There is deliberately ONE
 * implementation of the estimator so the two cannot drift apart.
 *
 * Nothing here is needed to run the protocol. It exists only to benchmark
 * sampling designs.
 */

import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = process.env.BENCHMARK_REPO ?? resolve(here, '..', '..')
const estimatorModule = await import(
  pathToFileURL(join(REPO, 'dialysis_session', 'estimator.mjs')).href
)

// Re-exported so the benchmark scripts keep a single import site.
export const {
  TIME_GRID,
  MANDATORY_TIMES,
  BUDGET,
  SESSION_MINUTES,
  NOISE_PROPORTIONAL_SD,
  concentrationAt,
  truthForKc,
  estimateFromSamples,
} = estimatorModule

/** Backwards-compatible alias: the repository name for this is truthForKc. */
export const truthEKtV = truthForKc

// ---------------------------------------------------------------- sealed truth

/**
 * True patient exchange parameters, as multiples of V(L). These are the BENCHMARK
 * truth, not clinical facts: 16 is HEMO's value for urea, 10 and 24 bracket it and
 * 24 is the value the ultrafiltration test localised to. The choice of these
 * three is what is sealed.
 */
export const TRUTH_SCENARIOS = Object.freeze({
  slow_exchange_10: 10,
  hemo_reference_16: 16,
  fast_exchange_24: 24,
})

// ---------------------------------------------------------------- sealed field

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
function normalFrom(rand) {
  let u = 0
  let v = 0
  while (u === 0) u = rand()
  while (v === 0) v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function openSession({ seed, kcMult, sigma = NOISE_PROPORTIONAL_SD, budget = BUDGET, options = {} }) {
  const rand = mulberry32(seed)
  const field = new Map()
  const truth = truthForKc(kcMult, options)
  for (const minute of TIME_GRID) {
    const exact = concentrationAt(minute, kcMult, options)
    field.set(minute, { minute, exact, measured: exact * (1 + sigma * normalFrom(rand)) })
  }

  const samples = []
  const log = []
  let spent = 0

  function draw(minute, rationale = '') {
    const entry = field.get(minute)
    if (entry === undefined) {
      throw new RangeError(`off-grid sample time ${minute} min. Allowed: ${TIME_GRID.join(', ')}`)
    }
    const seen = samples.find((s) => s.minute === minute)
    if (seen !== undefined) {
      log.push({ n: log.length + 1, minute, duplicate: true, rationale })
      return { ...seen, duplicate: true, remaining: budget - spent }
    }
    if (spent >= budget) throw new RangeError(`budget exhausted: ${budget} samples taken`)
    spent += 1
    const sample = { minute, bunMgNPerL: entry.measured }
    samples.push(sample)
    log.push({ n: log.length + 1, minute, duplicate: false, rationale, value: entry.measured })
    return { ...sample, duplicate: false, remaining: budget - spent }
  }

  return Object.freeze({
    draw,
    get samples() {
      return samples.map((s) => ({ ...s }))
    },
    get log() {
      return log.map((l) => ({ ...l }))
    },
    get remaining() {
      return budget - spent
    },
    get spent() {
      return spent
    },
    budget,
    sigma,
    /** Host-only: never hand this to a design. */
    get sealedTruth() {
      return { eKtV: truth.eKtV, spKtV: truth.spKtV, reboundFraction: truth.reboundFraction }
    },
  })
}
