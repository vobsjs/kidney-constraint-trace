/**
 * Counter-current haemodialyzer mass-transfer model (the "artificial kidney").
 *
 * FROZEN MODEL. The single device parameter is KoA, the mass-transfer-area
 * coefficient (mL/min): the product of the membrane's overall mass-transfer
 * coefficient and its area. Everything else is operating condition.
 *
 * Standard result for counter-current dialysate flow (Michaels 1968; Sargent &
 * Gotch; the formulation used throughout urea kinetic modelling):
 *
 *     alpha = (KoA / Qb) * (1 - Qb / Qd)
 *     CL    = Qb * (exp(alpha) - 1) / (exp(alpha) - Qb / Qd)
 *
 * Limits, both of which the implementation must respect:
 *   Qd -> infinity :  CL -> Qb * (1 - exp(-KoA / Qb))     (blood-film limited)
 *   Qb -> Qd       :  CL -> Qb * KoA / (KoA + Qb)         (formula is 0/0 there)
 *
 * Units: mL/min throughout. No ultrafiltration (Qf = 0), which is the condition
 * under which the reference manufacturer data used here is tabulated.
 *
 * VALIDATED against real EN ISO 8637-1:2020 in-vitro data from two independent
 * manufacturers; see tools/validate_against_manufacturers.mjs.
 */

/** Clearance (mL/min) for blood flow Qb, dialysate flow Qd, device KoA. */
export function clearance({ Qb, Qd, KoA }) {
  if (!(Qb > 0) || !(Qd > 0) || !(KoA > 0)) return Number.NaN
  const ratio = Qb / Qd
  if (Math.abs(1 - ratio) < 1e-9) return (Qb * KoA) / (KoA + Qb)
  const alpha = (KoA / Qb) * (1 - ratio)
  return (Qb * (Math.exp(alpha) - 1)) / (Math.exp(alpha) - ratio)
}

/**
 * Maximum attainable clearance at a given blood flow, i.e. the KoA -> infinity
 * limit. Used to detect measurements that carry no information about KoA
 * because they already sit at the flow ceiling.
 *
 *   Qd >= Qb :  the ceiling is Qb itself (all blood cleared in one pass)
 *   Qd <  Qb :  the ceiling is Qd (dialysate saturates first)
 */
export function clearanceCeiling({ Qb, Qd }) {
  return Math.min(Qb, Qd)
}

/** Fraction of the attainable ceiling actually reached. 1.0 means no KoA information. */
export function fractionalSaturation({ Qb, Qd, KoA }) {
  return clearance({ Qb, Qd, KoA }) / clearanceCeiling({ Qb, Qd })
}

/** d(clearance)/d(KoA), by central difference. The design-relevant sensitivity. */
export function sensitivityToKoA({ Qb, Qd, KoA }, h = 1e-5) {
  const up = clearance({ Qb, Qd, KoA: KoA * (1 + h) })
  const down = clearance({ Qb, Qd, KoA: KoA * (1 - h) })
  return (up - down) / (2 * h * KoA) // elasticities: relative CL per relative KoA
}

/** Invert clearance -> KoA by bisection. Returns the KoA reproducing a measurement. */
export function inferKoA({ Qb, Qd, measuredClearance, lo = 1, hi = 40000, iterations = 200 }) {
  const ceiling = clearanceCeiling({ Qb, Qd })
  if (!(measuredClearance > 0) || measuredClearance >= ceiling) return Number.NaN
  let low = lo
  let high = hi
  for (let i = 0; i < iterations; i += 1) {
    const mid = (low + high) / 2
    if (clearance({ Qb, Qd, KoA: mid }) < measuredClearance) low = mid
    else high = mid
  }
  return (low + high) / 2
}

/**
 * Clinical propagation: single-pool Kt/V for a treatment, from the device
 * clearance and patient size. Standard urea kinetic relation, with the
 * post-dialysis rebound ignored (single pool):
 *
 *   Kt/V = -ln(1 - CL / (0.06 * V)) * (t / 60) / V * V   -- see below
 *
 * Implemented in the usual form:
 *   Kt/V = (CL * t) / (V * 1000)   with CL in mL/min, t in minutes, V in litres
 *   Kt/V = (CL / 1000) * t / V
 */
export function ktv({ clearanceMlMin, sessionMinutes, volumeLitres }) {
  return ((clearanceMlMin / 1000) * sessionMinutes) / volumeLitres
}
