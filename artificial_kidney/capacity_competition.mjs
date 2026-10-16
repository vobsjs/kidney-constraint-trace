/**
 * ============================================================================
 *  STAGE 7 -- CAPACITY COMPETITION BETWEEN SPECIES
 * ============================================================================
 *
 * Stage 6 modelled the cartridge as having ONE capacity: 43.7 g of urea. I
 * recorded that as the stage's largest simplification, on the reasoning that a
 * real cartridge must also bind potassium, phosphate, sulphate and bicarbonate,
 * so the true lifetime must be shorter.
 *
 * Working the published numbers properly showed that reasoning was HALF WRONG and
 * that the real structure is different -- and more useful. The cartridge is not
 * one pool that urea shares. It is SEVERAL PARALLEL POOLS, one per sorbent layer,
 * and the device dies when the FIRST of them is exhausted. Urea is only one of
 * those pools.
 *
 * ---------------------------------------------------------------------------
 * THE THREE POOLS, AND WHAT THE SOURCE MEASURES
 * ---------------------------------------------------------------------------
 * Layer                binds                              published capacity
 * -------------------  ---------------------------------  --------------------
 * zirconium phosphate  NH4+ (from urea), K+, Ca2+, Mg2+     1.42-1.66 mEq/g ZP
 *   (ZP), cation       HCO3- via hydroxide exchange          (Table 4)
 * hydrous zirconium    phosphate, bicarbonate, sulphate     80-113 mEq total
 *   oxide/alumina      (anions)                             (HZO complement)
 * activated charcoal   creatinine, urate, middle molecules  not published
 *
 * ---------------------------------------------------------------------------
 * THE STOICHIOMETRY THAT RESOLVED AN OPEN QUESTION
 * ---------------------------------------------------------------------------
 * Stage 6 recorded an arithmetic inconsistency it could not explain: the source
 * reports 145.9 mEq of ammonium for a 1/10-scale cartridge and calls that
 * equivalent to 43.7 g of urea for the full-scale one, which does not scale by 10.
 *
 * It does once the chemistry is right. Urease hydrolysis is
 *
 *     (NH2)2CO  +  H2O  ->  2 NH3 + CO2
 *
 * so ONE urea molecule yields TWO ammonium ions. Therefore
 *
 *     43.7 g urea = 727.6 mmol = 1455 mEq NH4+  =  145.9 mEq x 10  (10x scale)
 *
 * which closes the discrepancy exactly, and agrees with Table 4's measured D3150
 * capacity of 42.9 g minimum / 53.6 g average. The arithmetic in stage 6 was not
 * wrong; the stoichiometry I had assumed (1 mEq per mmol) was.
 *
 * ---------------------------------------------------------------------------
 * WHAT "COMPETITION" ACTUALLY DOES HERE
 * ---------------------------------------------------------------------------
 * The measured 43.7 g urea capacity was obtained WITH the competing species
 * present, so it is a real cartridge specification, not a clean-room figure.
 * Dividing it down again for potassium would double-count. What was missing in
 * stage 6 is not a correction to the urea pool -- it is the OTHER POOLS.
 */

/** Published values, read from the REDY literature. See README §3. */
export const SORBENT = Object.freeze({
  // Table 4, measured cartridge capacities (g urea per cartridge)
  ureaCapacityG: { d3150Min: 42.9, d3150Avg: 53.6, d3150Computed: 43.7, d1050Min: 48.8, d3250Min: 64.3 },
  // Table 4, ammonium capacity per gram of ZP (mEq/g)
  zpAmmoniumMeqPerG: { min: 1.10, max: 1.66, measured: 1.47 },
  // ZP characterisation by titration (mEq/g)
  zpTotalCationMeqPerG: 3.8,
  zpTotalCationSdMeqPerG: 1.14,
  zpSodiumMeqPerG: 2.8,
  zpHydrogenMeqPerG: 1.0,
  // HZO/alumina anion complement (mEq, whole cartridge)
  hzoAnionComplementMeq: { min: 80, max: 113 },
  // Measured over the same 1/10-scale run as the ammonium figure
  measuredAmmoniumMeq: 145.9,
  measuredOtherCationMeq: 42.4,
  // Fraction of degraded urea carbon that exits as bicarbonate on ZP
  ureaCarbonToBicarbonate: 0.27,
  /** Sulphate shows no NET uptake after 90 min (displaced by bicarbonate). */
  sulphateNetUptake: 0,
})

/** Daily loads. Generation is HEMO-verified; the rest are standard figures. */
export const LOADS = Object.freeze({
  /** 15.0 g urea/day = 249.8 mmol/day, and 2 mEq of NH4+ per mmol. */
  ureaMmolPerDay: 15.0e3 / 60.06,
  get ammoniumMeqPerDay() {
    return this.ureaMmolPerDay * 2
  },
  /** Measured ratio: 42.4 mEq of K/Ca/Mg per 145.9 mEq of ammonium. */
  get otherCationMeqPerDay() {
    return this.ammoniumMeqPerDay * (SORBENT.measuredOtherCationMeq / SORBENT.measuredAmmoniumMeq)
  },
  /** 27% of urea carbon leaves as bicarbonate, consuming ZP hydroxide capacity. */
  get bicarbonateOnZpMeqPerDay() {
    return this.ureaMmolPerDay * SORBENT.ureaCarbonToBicarbonate
  },
  /** Absorbed dietary phosphorus in CKD: ~20 mmol/day. ~1.8 mEq/mmol at pH 7.4. */
  phosphateMmolPerDay: 20,
  phosphateMeqPerMmol: 1.8,
  get phosphateMeqPerDay() {
    return this.phosphateMmolPerDay * this.phosphateMeqPerMmol
  },
})

// ---------------------------------------------------------------- the pools

/**
 * ZP CATION POOL.
 *
 * Capacity is derived, not assumed: the cartridge is sized to hold `ureaCapacityG`
 * of urea as ammonium, at the measured 1.47 mEq/g of ZP. That fixes the ZP mass,
 * and the ZP's own operative capacity follows from the measured titration figure.
 *
 * The point of interest is that ammonium does NOT get the whole pool: bicarbonate
 * and the other cations draw on the same ZP.
 */
export function zpPool({ ureaCapacityG = SORBENT.ureaCapacityG.d3150Computed } = {}) {
  const ammoniumMeq = (ureaCapacityG / 60.06) * 1000 * 2
  const zpMassG = ammoniumMeq / SORBENT.zpAmmoniumMeqPerG.measured
  // Operative capacity observed under dialysis conditions. The titration figure
  // (3.80 mEq/g) is explicitly NOT applicable under dialysis; the measured run
  // used 188.3 mEq of a 99.1 g bed, i.e. 1.90 mEq/g.
  const operativeMeqPerG = (SORBENT.measuredAmmoniumMeq + SORBENT.measuredOtherCationMeq) / 99.1
  return {
    name: 'ZP (cations)',
    binds: 'NH4+ from urea, K+, Ca2+, Mg2+, HCO3- via hydroxide',
    zpMassG,
    ammoniumCapacityMeq: ammoniumMeq,
    operativeCapacityMeq: zpMassG * operativeMeqPerG,
    operativeMeqPerG,
  }
}

/**
 * HZO/ALUMINA ANION POOL. Phosphate and bicarbonate. Sulphate is excluded: the
 * source shows no net uptake after 90 min because bicarbonate displaces it.
 */
export function hzoPool({ capacityMeq = (SORBENT.hzoAnionComplementMeq.min + SORBENT.hzoAnionComplementMeq.max) / 2 } = {}) {
  return {
    name: 'HZO/alumina (anions)',
    binds: 'phosphate, bicarbonate',
    capacityMeq,
    rangeMeq: [SORBENT.hzoAnionComplementMeq.min, SORBENT.hzoAnionComplementMeq.max],
  }
}

// ---------------------------------------------------------------- lifetimes

/**
 * Lifetime of each pool, in days, and the device lifetime = the shortest.
 *
 * This is the structural change from stage 6: the question is not "how much urea
 * fits" but "which pool runs out first".
 */
export function poolLifetimes({ ureaCapacityG = SORBENT.ureaCapacityG.d3150Computed, hzoCapacityMeq } = {}) {
  const zp = zpPool({ ureaCapacityG })
  const hzo = hzoPool(hzoCapacityMeq === undefined ? {} : { capacityMeq: hzoCapacityMeq })

  const zpLoadMeqPerDay =
    LOADS.ammoniumMeqPerDay + LOADS.otherCationMeqPerDay + LOADS.bicarbonateOnZpMeqPerDay
  const hzoLoadMeqPerDay = LOADS.phosphateMeqPerDay

  const pools = [
    {
      ...zp,
      loadMeqPerDay: zpLoadMeqPerDay,
      lifetimeDays: zp.operativeCapacityMeq / zpLoadMeqPerDay,
      loadBreakdown: {
        'NH4+ from urea': LOADS.ammoniumMeqPerDay,
        'K+/Ca2+/Mg2+': LOADS.otherCationMeqPerDay,
        'HCO3- on ZP': LOADS.bicarbonateOnZpMeqPerDay,
      },
    },
    {
      ...hzo,
      loadMeqPerDay: hzoLoadMeqPerDay,
      lifetimeDays: hzo.capacityMeq / hzoLoadMeqPerDay,
      loadBreakdown: { phosphate: LOADS.phosphateMeqPerDay },
    },
  ]

  const binding = pools.reduce((a, b) => (a.lifetimeDays <= b.lifetimeDays ? a : b))
  const ureaOnlyDays = ureaCapacityG / (LOADS.ureaMmolPerDay * 60.06 / 1000)

  return { pools, binding, ureaOnlyDays }
}
