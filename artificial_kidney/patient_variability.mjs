/**
 * ============================================================================
 *  STAGE 8 -- THE CHARCOAL POOL, AND PATIENT VARIABILITY
 * ============================================================================
 *
 * Two things stage 7 left open:
 *
 *   1. The activated-charcoal pool had NO capacity, so creatinine and urate placed
 *      no bound on cartridge life. Stage 7 recorded that as a known gap.
 *   2. Every load was a steady-state daily AVERAGE, so the lifetime was reported as
 *      a deterministic range over PARAMETER uncertainty. Stage 7 noted that patient
 *      variability is larger -- and left it out.
 *
 * ---------------------------------------------------------------------------
 * ON THE CHARCOAL ASSUMPTION -- READ THIS BEFORE USING THE NUMBERS
 * ---------------------------------------------------------------------------
 * The REDY source gives the charcoal MASS but no creatinine capacity, and a search
 * of the accessible literature found no citable mg/g figure for creatinine on
 * activated carbon. So the capacity below is an ASSUMPTION, not a source value, and
 * is marked as such everywhere it appears.
 *
 * But the assumption can be largely avoided by INVERTING the question. Instead of
 * asking "how long does charcoal last", ask:
 *
 *     "what capacity would charcoal need for it NOT to be the binding pool?"
 *
 * That is derivable from the other pools and needs no assumption about charcoal at
 * all. It turns an unknown into a specification, and the assumption is then only
 * needed to say whether real charcoal MEETS it.
 */

import { SORBENT, LOADS, zpPool, hzoPool, poolLifetimes } from './capacity_competition.mjs'

// ============================================================================
//  FLAGGED ASSUMPTIONS -- not source values
// ============================================================================

/**
 * Every entry here is an ASSUMPTION. None is read from the REDY source.
 * They are flagged so they cannot be mistaken for measured quantities.
 */
export const ASSUMPTIONS = Object.freeze({
  /**
   * ASSUMPTION. Charcoal mass in the full-scale cartridge. Scaled from the source's
   * 1/10-scale column packing (24.9 g of activated charcoal), which IS a source
   * value; the x10 scaling is the assumption.
   */
  charcoalMassG: 24.9 * 10,
  charcoalMassBasis: 'source value 24.9 g (1/10 scale) scaled x10 -- the scaling is an assumption',

  /**
   * ASSUMPTION. Creatinine adsorption capacity of activated charcoal, mg per gram.
   * NO CITED SOURCE. This is the number the user authorised as an explicit,
   * clearly-marked assumption in place of an unbounded gap. Reported as a range
   * because the true figure is not known to better than an order of magnitude.
   */
  creatinineAdsorptionMgPerG: { low: 10, mid: 30, high: 50 },
  creatinineAdsorptionBasis: 'ASSUMPTION, no cited source. Plausible span for small-molecule adsorption on activated carbon.',

  /**
   * ASSUMPTION. Creatinine generation, mg/day, for a 70 kg dialysis patient.
   * Standard nephrology figures run ~15-20 mg/kg/day; muscle-wasted dialysis
   * patients sit at the low end.
   */
  creatinineGenerationMgPerDay: 1400,
  creatinineGenerationBasis: 'ASSUMPTION: 20 mg/kg/day x 70 kg. Standard range is 15-20 mg/kg/day.',
})

// ============================================================================
//  THE INVERTED QUESTION -- no assumption needed
// ============================================================================

/**
 * Charcoal capacity required for the charcoal pool NOT to bind before `targetDays`.
 *
 * This is a DESIGN SPECIFICATION, derivable entirely from the other pools. It is
 * the honest way to state the charcoal gap: not "charcoal lasts N days" (which
 * needs a made-up capacity) but "charcoal must beat this, and here is the bar."
 */
export function requiredCharcoalCapacity({ targetDays, creatinineMgPerDay = ASSUMPTIONS.creatinineGenerationMgPerDay, charcoalMassG = ASSUMPTIONS.charcoalMassG } = {}) {
  const creatinineLoadMg = creatinineMgPerDay * targetDays
  return {
    targetDays,
    creatinineLoadMg,
    requiredMgPerG: creatinineLoadMg / charcoalMassG,
    charcoalMassG,
  }
}

/** Lifetime of the charcoal pool under an assumed capacity. */
export function charcoalLifetime({ adsorptionMgPerG = ASSUMPTIONS.creatinineAdsorptionMgPerG.mid, creatinineMgPerDay = ASSUMPTIONS.creatinineGenerationMgPerDay, charcoalMassG = ASSUMPTIONS.charcoalMassG } = {}) {
  const capacityMg = adsorptionMgPerG * charcoalMassG
  return { capacityMg, lifetimeDays: capacityMg / creatinineMgPerDay, adsorptionMgPerG }
}

// ============================================================================
//  PATIENT VARIABILITY -- the lifetime as a DISTRIBUTION
// ============================================================================

/**
 * Between-patient urea generation. HEMO reports 4.85 +/- 1.95 mg N/min: a REAL
 * measured population spread (CV 40%) in dialysis patients, not an assumption.
 */
export const UREA_GENERATION_DISTRIBUTION = Object.freeze({
  meanMgNPerMin: 4.85,
  sdMgNPerMin: 1.95,
  cv: 1.95 / 4.85,
  source: 'HEMO (verified in stage 5)',
})

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
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

function percentile(sorted, p) {
  const i = (sorted.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)
}

/**
 * Monte Carlo the cartridge lifetime over a POPULATION.
 *
 * Sources of variation, kept separate so their contributions can be told apart:
 *   - urea generation      HEMO measured, CV 40%          <- real biology
 *   - HZO complement       published range 80-113 mEq     <- parameter uncertainty
 *   - charcoal capacity    FLAGGED ASSUMPTION             <- not a source value
 *
 * `includeCharcoal: false` gives the stage-7 answer with population variation only,
 * which is what makes the comparison between the two honest.
 */
export function lifetimeDistribution({
  draws = 20000,
  seed = 20261016,
  includeCharcoal = true,
  charcoalMgPerG = ASSUMPTIONS.creatinineAdsorptionMgPerG.mid,
} = {}) {
  const rand = mulberry32(seed)
  const lifetimes = []
  const bindingCounts = {}

  for (let i = 0; i < draws; i += 1) {
    // Urea generation, truncated at a physiologically sane floor.
    const gMgNPerMin = Math.max(
      0.5,
      UREA_GENERATION_DISTRIBUTION.meanMgNPerMin +
        UREA_GENERATION_DISTRIBUTION.sdMgNPerMin * normalFrom(rand),
    )
    // mg N/min -> mmol urea/day. Dividing mg N by 28 (the molar mass of N2) gives
    // mmol of urea directly, because each urea carries two nitrogen atoms. An
    // earlier version multiplied by 2 here, doubling generation and halving every
    // lifetime; the mean must reproduce LOADS.ureaMmolPerDay for the mean patient.
    const ureaMmolPerDay = (gMgNPerMin * 1440) / 28
    const generationScale = ureaMmolPerDay / LOADS.ureaMmolPerDay

    // HZO complement, uniform across its published range.
    const hzoMeq =
      SORBENT.hzoAnionComplementMeq.min +
      rand() * (SORBENT.hzoAnionComplementMeq.max - SORBENT.hzoAnionComplementMeq.min)

    const { pools } = poolLifetimes({ hzoCapacityMeq: hzoMeq })
    const candidates = pools.map((p) => ({
      name: p.name,
      // Every daily load scales with this patient's generation.
      days: p.lifetimeDays / generationScale,
    }))

    if (includeCharcoal) {
      candidates.push({
        name: 'activated charcoal',
        days: charcoalLifetime({ adsorptionMgPerG: charcoalMgPerG }).lifetimeDays,
      })
    }

    const binding = candidates.reduce((a, b) => (a.days <= b.days ? a : b))
    lifetimes.push(binding.days)
    bindingCounts[binding.name] = (bindingCounts[binding.name] ?? 0) + 1
  }

  const sorted = [...lifetimes].sort((a, b) => a - b)
  const mean = lifetimes.reduce((s, v) => s + v, 0) / lifetimes.length
  const variance = lifetimes.reduce((s, v) => s + (v - mean) ** 2, 0) / lifetimes.length

  return {
    draws,
    includeCharcoal,
    charcoalMgPerG,
    mean,
    sd: Math.sqrt(variance),
    cv: Math.sqrt(variance) / mean,
    median: percentile(sorted, 0.5),
    p05: percentile(sorted, 0.05),
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
    p95: percentile(sorted, 0.95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    /** Fraction of patients whose cartridge fails inside two days. */
    fractionUnderDays: (days) => sorted.filter((v) => v < days).length / sorted.length,
    bindingCounts,
    cartridgesPerWeekMedian: 7 / percentile(sorted, 0.5),
    cartridgesPerWeekWorst5pct: 7 / percentile(sorted, 0.05),
  }
}
