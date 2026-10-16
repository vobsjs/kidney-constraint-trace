#!/usr/bin/env node
/**
 * ============================================================================
 *  ARTIFICIAL KIDNEY -- CLOSED-LOOP SYSTEM
 * ============================================================================
 *
 * The point of the regeneration module is that it CLOSES THE LOOP. Once dialysate
 * is regenerated and returned rather than bought and discarded, three things
 * change at once, and all three matter more than any dialyzer detail:
 *
 *   1. the dialysate inventory drops from ~120 L per session to the 5.5 L loop the
 *      REDY system used -- a ~20x reduction, which is what makes a portable
 *      device conceivable at all;
 *   2. the achievable clearance stops being set by the fresh-dialysate supply and
 *      starts being set by how fast the cartridge can strip the loop;
 *   3. as the cartridge fills, the loop concentration rises and the effective
 *      clearance falls. The limiter becomes CAPACITY, not membrane area.
 *
 * ---------------------------------------------------------------------------
 * CLOSED-LOOP MASS BALANCE
 * ---------------------------------------------------------------------------
 * Loop of volume V_d, urea concentration C_d, dialyzer clearance CL_d against
 * blood concentration C_b:
 *
 *     V_d dC_d/dt = CL_d * (C_b - C_d)  -  R(C_d, loading)
 *
 * The dialyzer acts on the GRADIENT (C_b - C_d), not on C_b alone -- that is the
 * whole difference from single-pass, and it is why a saturated cartridge silently
 * destroys clearance instead of merely wasting dialysate.
 *
 * The patient compartment is the validated two-pool model from stage 5, reused
 * unchanged. Generation comes from the verified HEMO value.
 */

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  makeRegenerationModule,
  filtrationClearanceMlMin,
  REDY,
  UREA_GENERATION,
} from './modules.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = process.env.BENCHMARK_REPO ?? resolve(here, '..')

const { makePatient } = await import(
  pathToFileURL(join(REPO, 'dialysis_session', 'patient_dialyzer.mjs')).href
)

// Urea is followed as MASS in mg N internally, matching the stage-5 patient model.
const MG_N_PER_G_UREA = (28 / 60) * 1000

// ---------------------------------------------------------------- closed loop

/**
 * Simulate the regeneration module in a recirculating loop against a CONSTANT
 * urea influx, which is what a bench test does and what generation amounts to at
 * steady state.
 *
 *   V_d dC_d/dt = influx  -  R(C_d, loading)
 *
 * While the cartridge has capacity it strips the influx as fast as it arrives and
 * the loop stays clean. Once it saturates, nothing removes the influx and the loop
 * concentration climbs at influx/V_d -- the failure is abrupt, which is exactly
 * why a real device needs either a bigger cartridge or a sorbent monitor.
 */
export function simulateRegenerationLoop({
  influxMgNPerMin = UREA_GENERATION.mgNPerMin,
  loopVolumeL = REDY.dialysateVolumeL,
  capacityG = REDY.ureaCapacityG,
  dialysateFlowMlMin = 500,
  minutes = 4 * 24 * 60,
  dtMin = 1,
} = {}) {
  const cartridge = makeRegenerationModule({ capacityG, dialysateFlowMlMin })
  let CdialysateMgNPerL = 0
  const trace = []
  let breakthroughMin = null

  for (let t = 0; t < minutes; t += dtMin) {
    CdialysateMgNPerL += (influxMgNPerMin * dtMin) / loopVolumeL
    const removedG = cartridge.remove(CdialysateMgNPerL / MG_N_PER_G_UREA, dtMin)
    CdialysateMgNPerL = Math.max(0, CdialysateMgNPerL - (removedG * MG_N_PER_G_UREA) / loopVolumeL)

    // "Breakthrough" is defined MODEL-INTERNALLY as 95% cartridge utilisation.
    // The source quotes an ammonium threshold for terminating therapy but the OCR
    // is ambiguous about its units, so no clinical threshold is claimed here.
    if (breakthroughMin === null && cartridge.utilisation >= 0.95) breakthroughMin = t + dtMin

    if (t % 60 === 0) {
      trace.push({
        minute: t,
        dialysateMgNPerL: CdialysateMgNPerL,
        loadingG: cartridge.loadingG,
        utilisation: cartridge.utilisation,
      })
    }
  }

  return { cartridge, cumulativeRemovedG: cartridge.loadingG, breakthroughMin, trace }
}

/**
 * Full closed loop: patient compartment + dialyzer + regenerated dialysate.
 *
 * The dialyzer acts on (C_blood - C_dialysate), so a loading cartridge degrades
 * clearance rather than merely wasting fluid. Returns the effective clearance
 * time-course.
 */
export function simulateLoopDecay({
  bloodMgNPerL = 600,
  Qb = 250,
  Qd = 500,
  KoA = 1000,
  loopVolumeL = REDY.dialysateVolumeL,
  capacityG = REDY.ureaCapacityG,
  minutes = 24 * 60,
  dtMin = 1,
} = {}) {
  const CL = filtrationClearanceMlMin({ Qb, Qd, KoA }) // mL/min
  const cartridge = makeRegenerationModule({ capacityG, dialysateFlowMlMin: Qd })

  let CdialysateMgNPerL = 0
  const trace = []

  for (let t = 0; t < minutes; t += dtMin) {
    const gradient = Math.max(bloodMgNPerL - CdialysateMgNPerL, 0)
    // mL/min * mg/L * min = mL*mg/L = mg/1000
    const removedMgN = (CL * gradient * dtMin) / 1000
    const CdialysateGPerL = CdialysateMgNPerL / MG_N_PER_G_UREA
    const regeneratedG = cartridge.remove(CdialysateGPerL, dtMin)
    const netGainMgN = removedMgN - regeneratedG * MG_N_PER_G_UREA

    CdialysateMgNPerL = Math.max(0, CdialysateMgNPerL + netGainMgN / loopVolumeL)

    const effective = bloodMgNPerL > 0 ? CL * (1 - CdialysateMgNPerL / bloodMgNPerL) : 0
    if (t % 60 === 0) {
      trace.push({
        minute: t,
        dialysateMgNPerL: CdialysateMgNPerL,
        effectiveClearanceMlMin: effective,
        cartridgeUtilisation: cartridge.utilisation,
      })
    }
  }

  const last = trace[trace.length - 1]
  return {
    nominalClearanceMlMin: CL,
    finalClearanceMlMin: last.effectiveClearanceMlMin,
    cartridge,
    cumulativeRemovedG: cartridge.loadingG,
    trace,
  }
}

// ---------------------------------------------------------------- modalities

/**
 * Steady-state blood urea nitrogen under CONTINUOUS clearance.
 *
 * At steady state generation equals removal:
 *     G = CL_eff * C_ss      =>     C_ss = G / CL_eff
 * There is no swing at all: this is the flat profile a kidney produces.
 */
export function continuousSteadyState({ clearanceMlMin, generationMgNPerMin = UREA_GENERATION.mgNPerMin }) {
  const CL = clearanceMlMin / 1000 // L/min
  const mgNPerL = CL > 0 ? generationMgNPerMin / CL : Number.POSITIVE_INFINITY
  return { mgNPerL, bunMgDl: mgNPerL / 10 }
}

/** Weekly cleared volume for an intermittent schedule. */
export function weeklyClearedVolumeL({ clearanceMlMin, sessionMinutes, sessionsPerWeek }) {
  return (clearanceMlMin * sessionMinutes * sessionsPerWeek) / 1000
}

/** The clearance a continuous device would need to match that weekly volume. */
export function equivalentContinuousClearanceMlMin({ clearanceMlMin, sessionMinutes, sessionsPerWeek }) {
  const weeklyL = weeklyClearedVolumeL({ clearanceMlMin, sessionMinutes, sessionsPerWeek })
  return (weeklyL * 1000) / (7 * 24 * 60)
}

/** Cartridge demand for a continuous device running flat out on generation. */
export function cartridgeDemand({ gUreaPerDay = UREA_GENERATION.gUreaPerDay, capacityG = REDY.ureaCapacityG } = {}) {
  return {
    gUreaPerDay,
    cartridgeDays: capacityG / gUreaPerDay,
    cartridgesPerWeek: (7 * gUreaPerDay) / capacityG,
    cartridgesPerYear: (365 * gUreaPerDay) / capacityG,
  }
}

export { makeRegenerationModule, filtrationClearanceMlMin, REDY, UREA_GENERATION, makePatient }
