#!/usr/bin/env node
/**
 * ============================================================================
 *  BENCH DESIGNS -- HOST-SIDE
 * ============================================================================
 *
 * Every design answers one question: given the measurements so far, which
 * (Qb, Qd) should be bought next? The budget is 8.
 *
 * THE ACTIVE RULE, AND WHY IT IS SIMPLE HERE
 *   With proportional measurement error the Fisher information about KoA from a
 *   single observation is (d ln CL / d ln KoA)^2 / sigma^2 -- that is, the
 *   SQUARED ELASTICITY. With one parameter the determinant criterion used in the
 *   pharmacokinetic stage collapses to a sum, so the D-optimal rule is exactly:
 *
 *       measure next where the elasticity is largest,
 *
 *   re-evaluating after every measurement because the elasticity map depends on
 *   the current estimate of KoA. There is no matrix algebra and no update
 *   formula to hide behind -- the rule is stated and then tested.
 */

import { GRID, BUDGET, sensitivityToKoA } from './koa_benchmark.mjs'

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

const key = (p) => `${p.Qb}|${p.Qd}`

/** Information contributed by a candidate point, given a current KoA estimate. */
function information(point, koA) {
  const e = sensitivityToKoA({ Qb: point.Qb, Qd: point.Qd, KoA: koA })
  return e * e
}

// ---------------------------------------------------------------------------
// uniform8 -- a fixed regular lattice a bench would plausibly be told to run.
// Four blood flows crossed with two dialysate flows, evenly spaced.
// ---------------------------------------------------------------------------
export const UNIFORM_DESIGN = Object.freeze(
  [150, 250, 350, 400].flatMap((Qb) => [300, 500].map((Qd) => Object.freeze({ Qb, Qd }))),
)

export function uniform8() {
  let i = 0
  return {
    name: 'uniform8',
    next() {
      const p = UNIFORM_DESIGN[i]
      i += 1
      return { ...p, rationale: `fixed lattice point ${i}/8 (non-adaptive)` }
    },
  }
}

// ---------------------------------------------------------------------------
// random8 -- eight distinct uniformly random operating points.
// ---------------------------------------------------------------------------
export function random8(seed) {
  const rand = mulberry32((seed ^ 0x85ebca6b) >>> 0)
  const pool = [...GRID]
  const chosen = []
  while (chosen.length < BUDGET) chosen.push(pool.splice(Math.floor(rand() * pool.length), 1)[0])
  let i = 0
  return {
    name: 'random8',
    next() {
      const p = chosen[i]
      i += 1
      return { ...p, rationale: `uniform random draw ${i}/8 (non-adaptive)` }
    },
  }
}

// ---------------------------------------------------------------------------
// active8 -- sequential D-optimal for a single parameter: maximise the elasticity.
// ---------------------------------------------------------------------------
export function active8() {
  const taken = new Set()
  let current = 1000 // prior KoA before any data; mid-range for real dialyzers
  return {
    name: 'active8',
    next({ observations, estimator }) {
      if (observations.length >= 2) {
        try {
          const fit = estimator(observations)
          if (Number.isFinite(fit.koA) && fit.koA > 0) current = fit.koA
        } catch {
          /* keep the previous estimate */
        }
      }
      const ranked = GRID.filter((p) => !taken.has(key(p)))
        .map((p) => ({ ...p, info: information(p, current) }))
        .sort((a, b) => b.info - a.info)
      const best = ranked[0]
      taken.add(key(best))
      const runnerUp = ranked[1]
      return {
        ...best,
        rationale:
          `D-optimal: highest elasticity |d ln CL / d ln KoA| = ${Math.sqrt(best.info).toFixed(4)} ` +
          `at the current estimate KoA = ${current.toFixed(0)}. ` +
          `Runner-up Qb ${runnerUp.Qb}/Qd ${runnerUp.Qd} (${Math.sqrt(runnerUp.info).toFixed(4)}).`,
        diagnostics: { elasticity: Math.sqrt(best.info), ranked: ranked.slice(0, 4) },
      }
    },
  }
}

// ---------------------------------------------------------------------------
// oracle8 -- the best possible NON-adaptive design, computed at the true KoA.
// An upper bound no real design can reach, used to interpret the comparison.
// ---------------------------------------------------------------------------
export function computeOracleDesign(koA) {
  const ranked = [...GRID].sort((a, b) => information(b, koA) - information(a, koA))
  return ranked.slice(0, BUDGET)
}

export function oracle8(koA) {
  const design = computeOracleDesign(koA)
  let i = 0
  return {
    name: 'oracle8',
    next() {
      const p = design[i]
      i += 1
      return { ...p, rationale: `oracle D-optimal static point ${i}/8 (computed at the true KoA)` }
    },
  }
}

export const STRATEGY_NAMES = Object.freeze(['uniform8', 'random8', 'active8', 'oracle8'])

export function makeStrategy(name, seed, koA) {
  if (name === 'uniform8') return uniform8()
  if (name === 'random8') return random8(seed)
  if (name === 'active8') return active8()
  if (name === 'oracle8') return oracle8(koA)
  throw new Error(`unknown design: ${name}`)
}
