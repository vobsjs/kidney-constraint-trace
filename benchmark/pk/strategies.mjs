#!/usr/bin/env node
/**
 * ============================================================================
 *  SAMPLING STRATEGIES -- HOST-SIDE
 * ============================================================================
 *
 * Every strategy exposes the same interface:
 *
 *   next({ observations, step }) -> { crclMlMin, timeH, rationale }
 *
 * so the driver in compare_strategies.mjs treats them identically and the
 * comparison is fair. `observations` contains only the points that strategy has
 * already collected -- no strategy can see the sealed field.
 *
 * Strategies:
 *   uniform12  a fixed regular lattice; non-adaptive
 *   random12   twelve distinct uniformly random grid points; non-adaptive
 *   active     sequential Bayesian D-optimal design; adaptive
 */

import { GRID, BUDGET, SEALED_TRUTH } from './simulator.mjs'
import {
  fitMl,
  pointInformation,
  addMatrices,
  determinant3,
  zeroInformation,
  PARAMETER_NAMES,
} from './estimator.mjs'
import { NOISE } from './generate_reference_data.mjs'

const TRUTH_VECTOR = [
  SEALED_TRUTH.clearanceAtCrcl92LPerH,
  SEALED_TRUTH.crclSlopePerMlMin,
  SEALED_TRUTH.volumeOfDistributionL,
]

/** Deterministic PRNG, independent of the noise field's stream. */
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

const keyOf = (p) => `${p.crclMlMin}|${p.timeH}`

// ---------------------------------------------------------------------------
// uniform12 -- a fixed, evenly spaced lattice over the design rectangle.
//
// Three CrCl levels (45 / 75 / 130 mL/min, spanning the observed range) crossed
// with four sampling times (0.5 / 2 / 8 / 12 h, spanning early through terminal).
// Non-adaptive: the same twelve points regardless of what is observed.
// ---------------------------------------------------------------------------
export const UNIFORM_POINTS = Object.freeze(
  [45, 75, 130].flatMap((crclMlMin) =>
    [0.5, 2, 8, 12].map((timeH) => Object.freeze({ crclMlMin, timeH })),
  ),
)

export function uniform12() {
  let i = 0
  return {
    name: 'uniform12',
    next() {
      const point = UNIFORM_POINTS[i]
      i += 1
      return { ...point, rationale: `fixed lattice point ${i}/12 (non-adaptive)` }
    },
  }
}

// ---------------------------------------------------------------------------
// random12 -- twelve distinct uniformly random grid points.
// ---------------------------------------------------------------------------
export function random12(seed) {
  const rand = mulberry32((seed ^ 0x9e3779b9) >>> 0)
  const pool = [...GRID]
  const chosen = []
  while (chosen.length < BUDGET) {
    const idx = Math.floor(rand() * pool.length)
    chosen.push(pool.splice(idx, 1)[0])
  }
  let i = 0
  return {
    name: 'random12',
    next() {
      const point = chosen[i]
      i += 1
      return { ...point, rationale: `uniform random draw ${i}/12 (non-adaptive)` }
    },
  }
}

// ---------------------------------------------------------------------------
// active -- sequential Bayesian D-optimal design.
//
// At each step: the points observed so far accumulate a Fisher information
// matrix M in LOG-parameter space; each candidate point would contribute I_d;
// the strategy takes the point maximising log det(M + I_d + M0). That is the
// design that most reduces the volume of the joint parameter confidence
// ellipsoid, one observation ahead. M0 is a weak log-space prior that keeps the
// determinant non-singular before three independent directions have been seen.
//
// The sensitivities are evaluated at the current ML estimate, so the strategy is
// adaptive: what it samples next depends on what it has learned. Before enough
// observations exist to fit, it uses a fixed prior mean instead.
// ---------------------------------------------------------------------------

/** Weak log-space prior precision. SD = 1 in log units is a factor of ~2.7. */
const PRIOR_PRECISION = 1.0
const PRIOR_MEAN = Object.freeze([3.0, 0.008, 20.0])

export function active(seed) {
  const seen = new Set()
  let current = [...PRIOR_MEAN]
  let usedPrior = true

  return {
    name: 'active',
    next({ observations }) {
      // Refit whenever there is enough data for a three-parameter fit.
      if (observations.length >= 4) {
        try {
          const fit = fitMl(observations)
          if (fit.parameters.every((v) => Number.isFinite(v) && v > 0)) {
            current = fit.parameters
            usedPrior = false
          }
        } catch {
          /* keep the previous estimate */
        }
      }

      // Accumulated information from the observations actually collected.
      let M = zeroInformation()
      for (const o of observations) {
        M = addMatrices(M, pointInformation(current, o.crclMlMin, o.timeH))
      }

      let bestPoint = null
      let bestScore = Number.NEGATIVE_INFINITY
      const scores = []
      for (const candidate of GRID) {
        if (seen.has(keyOf(candidate))) continue
        const I = pointInformation(current, candidate.crclMlMin, candidate.timeH)
        const total = addMatrices(addMatrices(M, I), [
          [PRIOR_PRECISION, 0, 0],
          [0, PRIOR_PRECISION, 0],
          [0, 0, PRIOR_PRECISION],
        ])
        const score = Math.log(Math.max(determinant3(total), Number.MIN_VALUE))
        scores.push({ ...candidate, score })
        if (score > bestScore) {
          bestScore = score
          bestPoint = candidate
        }
      }

      seen.add(keyOf(bestPoint))
      const top = scores.sort((a, b) => b.score - a.score).slice(0, 3)
      const estimate = current.map((v) => Number(v.toPrecision(4)))
      const basis = usedPrior ? 'prior mean' : 'current ML estimate'
      return {
        ...bestPoint,
        rationale:
          `D-optimal: maximises log det(M + I_d + M0) using sensitivities at the ${basis} ` +
          `[${estimate.join(', ')}]` +
          (observations.length === 0 ? '; no data yet, so this is the most informative single point' : '') +
          `. Runner-up points: ${top
            .slice(1)
            .map((p) => `CrCl ${p.crclMlMin}/t ${p.timeH}`)
            .join(', ')}.`,
        diagnostics: { determinant: bestScore, rankings: top },
      }
    },
  }
}

export const STRATEGY_NAMES = Object.freeze(['uniform12', 'random12', 'active', 'oracleStatic'])

// ---------------------------------------------------------------------------
// oracleStatic -- the best possible NON-adaptive design, computed with the truth.
//
// Why this exists: greedy D-optimal selection saturates for a three-parameter
// model. Once three independent information directions are covered, every extra
// point adds almost nothing to the determinant, so the adaptive strategy stops
// exploring and the design cannot improve much on a well-spread fixed lattice.
//
// This strategy computes the exact D-optimal twelve-point subset of the grid by
// an exchange algorithm evaluated AT THE TRUTH -- an oracle no real strategy can
// match, since it needs the answer. It is an upper bound on any non-adaptive
// design, and it tells us whether the uniform lattice is already near-optimal
// (in which case "active fails to beat uniform" is a property of the problem,
// not a defect of the active rule).
// ---------------------------------------------------------------------------
export function computeOracleDesign(iters = 200) {
  const info = GRID.map((p) => pointInformation(TRUTH_VECTOR, p.crclMlMin, p.timeH))

  const totalInfo = (subset) => {
    let M = zeroInformation()
    for (const i of subset) M = addMatrices(M, info[i])
    return M
  }
  const scoreOf = (subset) => Math.log(Math.max(determinant3(totalInfo(subset)), Number.MIN_VALUE))

  // Start from the uniform lattice if it is on the grid, else the first twelve.
  const uniformIdx = UNIFORM_POINTS.map((p) =>
    GRID.findIndex((g) => g.crclMlMin === p.crclMlMin && g.timeH === p.timeH),
  )
  let current = uniformIdx.every((i) => i >= 0) ? [...uniformIdx] : GRID.map((_, i) => i).slice(0, BUDGET)
  let best = scoreOf(current)

  for (let iter = 0; iter < iters; iter += 1) {
    let improved = false
    for (let slot = 0; slot < current.length; slot += 1) {
      const outside = GRID.map((_, i) => i).filter((i) => !current.includes(i))
      for (const candidate of outside) {
        const trial = [...current]
        trial[slot] = candidate
        const s = scoreOf(trial)
        if (s > best + 1e-12) {
          best = s
          current = trial
          improved = true
        }
      }
    }
    if (!improved) break
  }
  return current.map((i) => ({ ...GRID[i] }))
}

export function oracleStatic() {
  const design = computeOracleDesign()
  let i = 0
  return {
    name: 'oracleStatic',
    next() {
      const point = design[i]
      i += 1
      return {
        ...point,
        rationale: `oracle D-optimal static design point ${i}/${BUDGET} (computed at the truth; upper bound, not achievable in practice)`,
      }
    },
  }
}

export function makeStrategy(name, seed) {
  if (name === 'uniform12') return uniform12()
  if (name === 'random12') return random12(seed)
  if (name === 'active') return active(seed)
  if (name === 'oracleStatic') return oracleStatic()
  throw new Error(`unknown strategy: ${name}`)
}

export { PARAMETER_NAMES, NOISE }
