#!/usr/bin/env node
/**
 * ============================================================================
 *  SEALED KoA-IDENTIFICATION BENCHMARK -- HOST-SIDE
 * ============================================================================
 *
 * The "artificial kidney" experiment. A dialyzer of unknown KoA sits on a bench.
 * The experimenter chooses operating points (Qb, Qd), each choice buys ONE noisy
 * clearance measurement, and the budget is 8 measurements. The task is to
 * recover KoA.
 *
 * This is the direct analogue of a real in-vitro dialyzer characterisation under
 * EN ISO 8637-1:2020 -- the same measurement the manufacturer data in
 * dialyzer/data/manufacturer_clearances.json came from -- except that the
 * operating points are chosen sequentially instead of being fixed by a protocol.
 *
 * Everything sealed lives here: the true KoA and the noise realisation. The
 * repository sees only the measurements actually bought.
 *
 * WHY A BUDGET OF 8
 *   The reference manufacturer tables report clearance at 2-3 blood flows per
 *   device. Eight measurements is a realistic bench session: enough to be
 *   useful, few enough that where you spend them matters.
 */

import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = process.env.BENCHMARK_REPO ?? resolve(here, '..', '..')
const model = await import(pathToFileURL(join(REPO, 'dialyzer', 'dialyzer_model.mjs')).href)
const { clearance, inferKoA, sensitivityToKoA } = model

/** Re-exported so the benchmark's consumers need only one import. */
export { clearance, inferKoA, sensitivityToKoA }

// ---------------------------------------------------------------- design space

/** Operating points a bench can actually reach. Matches clinical RRT ranges. */
export const QB_GRID = Object.freeze([150, 200, 250, 300, 350, 400])
export const QD_GRID = Object.freeze([200, 300, 500, 800])
export const GRID = Object.freeze(
  QB_GRID.flatMap((Qb) => QD_GRID.map((Qd) => Object.freeze({ Qb, Qd }))),
)
export const BUDGET = 8

/**
 * Measurement noise: proportional, because dialyzer clearance is computed from a
 * concentration ratio (mass balance), so the dominant errors -- assay precision
 * and flow accuracy -- scale with the clearance itself.
 *
 * SD = 3% is a modelling choice, NOT a published figure: I could not source a
 * published in-vitro clearance repeatability. It is bounded by the ISO 8637-1
 * acceptance band of +/-10% of the labelled value, and the observed round-trip
 * disagreement in the manufacturer's own published KoA vs labelled clearance
 * (0.06% to 0.89% across three devices). Sensitivity to this choice is measured
 * at 1.5%, 3% and 6% in compare_designs.mjs.
 */
export const NOISE_PROPORTIONAL_SD = 0.03

/**
 * True KoA values used, each a REAL device-solute value derived from the
 * published manufacturer tables (see dialyzer/tools/validate_against_manufacturers.mjs),
 * chosen so that none of them equals a population mean printed in the repository.
 *
 * Note this is a deliberately WEAK seal: KoA is a physical device parameter that a
 * real experimenter would know approximately from the manufacturer's own data, so
 * the sealed quantities that actually matter are the noise realisation and which
 * scenario is active -- not the fact that dialyzers have KoA values of this size.
 */
export const TRUTH_SCENARIOS = Object.freeze({
  // ELISIO 17HX, urea, derived 1367.0 / 1450.4 / 1474.6 across three blood flows
  urea_mid: 1431,
  // ELISIO 11HX, urea, derived 873.3 / 887.8 / 901.2
  urea_small: 888,
  // ELISIO 19HX, phosphate, derived 1005.2 / 976.6 / 930.1
  phosphate: 971,
  // ELISIO 19HX, vitamin B12, derived 465.1 / 456.1 / 449.4
  vitamin_b12: 457,
  // ELISIO 19HX, myoglobin, derived 189.1 / 181.7 / 183.9
  myoglobin: 185,
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

/** Materialise the sealed noisy measurement for every grid point. */
function buildField({ seed, koA, sigma }) {
  const rand = mulberry32(seed)
  const field = new Map()
  for (const point of GRID) {
    const predicted = clearance({ Qb: point.Qb, Qd: point.Qd, KoA: koA })
    const measured = predicted * (1 + sigma * normalFrom(rand))
    field.set(`${point.Qb}|${point.Qd}`, { ...point, predicted, measured })
  }
  return field
}

/**
 * Open a bench session. The field is captured in the closure: not a property of
 * the returned object, not enumerable, not serialisable.
 */
export function openSession({ seed, koA, sigma = NOISE_PROPORTIONAL_SD, budget = BUDGET }) {
  const field = buildField({ seed, koA, sigma })
  const measurements = []
  const log = []
  let spent = 0

  function measure(Qb, Qd, rationale = '') {
    const entry = field.get(`${Qb}|${Qd}`)
    if (entry === undefined) {
      throw new RangeError(
        `off-grid operating point Qb=${Qb}, Qd=${Qd}. Allowed Qb: ${QB_GRID.join(', ')}; allowed Qd: ${QD_GRID.join(', ')}`,
      )
    }
    const seen = measurements.find((m) => m.Qb === Qb && m.Qd === Qd)
    if (seen !== undefined) {
      log.push({ n: log.length + 1, Qb, Qd, duplicate: true, rationale })
      return { ...seen, duplicate: true, remaining: budget - spent }
    }
    if (spent >= budget) throw new RangeError(`budget exhausted: ${budget} measurements taken`)
    spent += 1
    const measurement = { Qb, Qd, clearanceMlMin: entry.measured }
    measurements.push(measurement)
    log.push({ n: log.length + 1, Qb, Qd, duplicate: false, rationale, value: entry.measured })
    return { ...measurement, duplicate: false, remaining: budget - spent }
  }

  return Object.freeze({
    measure,
    get measurements() {
      return measurements.map((m) => ({ ...m }))
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
  })
}

// ---------------------------------------------------------------- estimator

/**
 * Maximum likelihood for the proportional error model.
 *
 *   -2 log L = SUM [ ((y - f)/ (sigma f))^2 + 2 ln(sigma f) ]
 *
 * With a single parameter this is one-dimensional, so it is minimised by a
 * bracketed grid search followed by golden-section refinement -- no local optima
 * to worry about, and no dependence on a simplex implementation.
 */
export function objectiveAt(koA, measurements, sigma) {
  if (!(koA > 0)) return Number.POSITIVE_INFINITY
  let total = 0
  for (const m of measurements) {
    const f = clearance({ Qb: m.Qb, Qd: m.Qd, KoA: koA })
    if (!(f > 0)) return Number.POSITIVE_INFINITY
    total += ((m.clearanceMlMin - f) / (sigma * f)) ** 2 + 2 * Math.log(sigma * f)
  }
  return total
}

/** Golden-section minimisation of the ML objective over KoA in [lo, hi]. */
export function estimateKoA(measurements, sigma = NOISE_PROPORTIONAL_SD, lo = 5, hi = 20000) {
  const phi = (Math.sqrt(5) - 1) / 2
  let a = Math.log(lo)
  let b = Math.log(hi)
  let c = b - phi * (b - a)
  let d = a + phi * (b - a)
  let fc = objectiveAt(Math.exp(c), measurements, sigma)
  let fd = objectiveAt(Math.exp(d), measurements, sigma)
  for (let i = 0; i < 300; i += 1) {
    if (fc < fd) {
      b = d
      d = c
      fd = fc
      c = b - phi * (b - a)
      fc = objectiveAt(Math.exp(c), measurements, sigma)
    } else {
      a = c
      c = d
      fc = fd
      d = a + phi * (b - a)
      fd = objectiveAt(Math.exp(d), measurements, sigma)
    }
  }
  const logKoA = (a + b) / 2
  return { koA: Math.exp(logKoA), objective: objectiveAt(Math.exp(logKoA), measurements, sigma) }
}

