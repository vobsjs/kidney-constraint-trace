/**
 * Frozen one-compartment pharmacokinetic model for intravenous gentamicin, in
 * which total clearance is a linear function of creatinine clearance.
 *
 * HOST-OWNED AND FROZEN. This path is protected by the evaluator policy, so a
 * candidate run can never edit it. Only model/params.json is mutable.
 *
 * Structure (Duong 2022 / Bos 2019, see README.md for full citations):
 *
 *   CL(CrCl) = CL92 * (1 + SLOPE * (CrCl - 92))        [L/h, CrCl in mL/min]
 *   k        = CL / V                                  [1/h]
 *
 *   IV infusion of duration T at rate R = dose / T:
 *     t <= T :  C(t) = (R / CL) * (1 - exp(-k * t))
 *     t >  T :  C(t) = (R / CL) * (1 - exp(-k * T)) * exp(-k * (t - T))
 *
 * Units: time h, dose mg, concentration mg/L, volume L, clearance L/h.
 */

/** CrCl (mL/min) at which the published model centres its clearance term. */
export const CRCL_REFERENCE_ML_MIN = 92

/** Parameter names a candidate may tune in model/params.json. */
export const TUNABLE_PARAMETERS = Object.freeze([
  'clearanceAtCrcl92LPerH',
  'crclSlopePerMlMin',
  'volumeOfDistributionL',
])

/**
 * Validate candidate parameters. Returns a list of human-readable problems; an
 * empty list means the parameters are physiologically and numerically usable.
 */
export function validateParameters(params) {
  const problems = []
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    return ['model/params.json must contain a single JSON object']
  }
  for (const name of TUNABLE_PARAMETERS) {
    const value = params[name]
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      problems.push(`${name} must be a finite number, received ${JSON.stringify(value)}`)
    }
  }
  if (problems.length > 0) return problems

  if (params.clearanceAtCrcl92LPerH <= 0) {
    problems.push(`clearanceAtCrcl92LPerH must be > 0, received ${params.clearanceAtCrcl92LPerH}`)
  }
  if (params.volumeOfDistributionL <= 0) {
    problems.push(`volumeOfDistributionL must be > 0, received ${params.volumeOfDistributionL}`)
  }
  // A negative slope would mean clearance falls as renal function improves.
  if (params.crclSlopePerMlMin < 0) {
    problems.push(`crclSlopePerMlMin must be >= 0, received ${params.crclSlopePerMlMin}`)
  }
  return problems
}

/** Total clearance (L/h) at a given creatinine clearance (mL/min). */
export function totalClearanceLPerH(params, creatinineClearanceMlMin) {
  return (
    params.clearanceAtCrcl92LPerH *
    (1 + params.crclSlopePerMlMin * (creatinineClearanceMlMin - CRCL_REFERENCE_ML_MIN))
  )
}

/** Elimination rate constant (1/h). */
export function eliminationRateConstant(params, creatinineClearanceMlMin) {
  return totalClearanceLPerH(params, creatinineClearanceMlMin) / params.volumeOfDistributionL
}

/**
 * Simulated plasma concentration (mg/L) at one time point (h) after the start of
 * a single constant-rate intravenous infusion.
 */
export function infusionConcentration({ doseMg, infusionHours, clearanceLPerH, volumeL, timeH }) {
  const rate = doseMg / infusionHours // mg/h
  const k = clearanceLPerH / volumeL // 1/h
  const plateau = rate / clearanceLPerH // mg/L
  if (timeH <= infusionHours) return plateau * (1 - Math.exp(-k * timeH))
  const concentrationAtEndOfInfusion = plateau * (1 - Math.exp(-k * infusionHours))
  return concentrationAtEndOfInfusion * Math.exp(-k * (timeH - infusionHours))
}

/**
 * Simulate the concentration-time curve for every reference point.
 *
 * @param {object} params          candidate parameters (model/params.json)
 * @param {object} regimen         { doseMg, infusionHours }
 * @param {Array<{crclMlMin:number,timeH:number}>} points  observation schedule
 * @returns {Array<{crclMlMin:number,timeH:number,predictedMgL:number}>}
 */
export function simulateCurve(params, regimen, points) {
  return points.map((point) => {
    const clearanceLPerH = totalClearanceLPerH(params, point.crclMlMin)
    const predictedMgL = infusionConcentration({
      doseMg: regimen.doseMg,
      infusionHours: regimen.infusionHours,
      clearanceLPerH,
      volumeL: params.volumeOfDistributionL,
      timeH: point.timeH,
    })
    return { crclMlMin: point.crclMlMin, timeH: point.timeH, predictedMgL }
  })
}
