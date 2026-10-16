#!/usr/bin/env node
/**
 * ANALYSIS ESTIMATOR for the four-draw protocol.
 *
 * This is the code the protocol's §6.2 analysis plan refers to. It was placed in
 * the repository rather than with the benchmark internals, because a clinical
 * collaborator receiving this package must be able to run the analysis. It
 * contains no sealed material: it estimates a patient's exchange parameter from
 * that patient's own measurements and reads off the equilibrated dose.
 *
 * WHAT IT DOES
 *   Given BUN measurements at chosen times during and after a dialysis session,
 *   fit the single free parameter -- the intercompartmental clearance Kc --
 *   holding the distribution volume from anthropometry and the dialyzer
 *   clearance from the validated KoA model. Then report eKt/V.
 *
 * WHY MAXIMUM LIKELIHOOD
 *   BUN assay error is proportional, so the correct objective is the
 *   heteroscedastic normal likelihood, INCLUDING the log-variance Jacobian term:
 *
 *     -2 log L = SUM [ (y - f)^2 / (sigma f)^2 + 2 ln(sigma f) ]
 *
 *   Omitting the second term biases the fit. This was established on evidence in
 *   earlier stages of this project and is re-used unchanged.
 *
 * Run:  node dialysis_session/estimator.mjs     (self-test on a synthetic session)
 */

import { pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { makePatient, simulateSession, HEMO } from './patient_dialyzer.mjs'

const here = dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------- design space

/** Sampling times a unit could realistically take, minutes from session start. */
export const TIME_GRID = Object.freeze([
  0, 30, 60, 90, 120, 150, 180, 210, 240, 245, 250, 260, 270, 285, 300, 330, 360,
])
/** t = 0 is the pre-dialysis draw and is mandatory; the rest are bought. */
export const MANDATORY_TIMES = Object.freeze([0])
export const BUDGET = 4
export const SESSION_MINUTES = 240

/**
 * Blood-urea-nitrogen assay noise, proportional.
 * A modelling choice, not a sourced figure: clinical BUN assays are typically
 * quoted at 1-3% CV. Sensitivity is measured at 1%, 2% and 4%.
 */
export const NOISE_PROPORTIONAL_SD = 0.02

/** The protocol's fixed draw schedule. */
export const PROTOCOL_TIMES = Object.freeze([0, 120, 240, 270])

// ---------------------------------------------------------------- forward model

/** Simulate a patient with a given Kc multiple of V(L). */
export function simulateForKc(kcMult, { volumeL = HEMO.ureaDistributionVolumeL, ...opts } = {}) {
  const patient = { ...makePatient({ volumeL }), kcLPerMin: (kcMult * volumeL) / 1000 }
  return simulateSession({ patient, sessionMinutes: SESSION_MINUTES, ...opts })
}

/** The exact BUN (mg N/L) at a given minute for a patient with Kc multiple kcMult. */
export function concentrationAt(minute, kcMult, opts = {}) {
  const sim = simulateForKc(kcMult, opts)
  if (minute <= 0) return sim.preMgNPerL
  if (minute <= SESSION_MINUTES) {
    const row = sim.dialysisTrack.find((r) => r.minute === minute)
    return row !== undefined ? row.C1 : sim.dialysisTrack[sim.dialysisTrack.length - 1].C1
  }
  const row = sim.reboundTrack.find((r) => r.minute === minute - SESSION_MINUTES)
  return row !== undefined ? row.C1 : sim.equilibratedMgNPerL
}

/** Truth for a patient: equilibrated Kt/V, single-pool Kt/V, rebound fraction. */
export function truthForKc(kcMult, opts = {}) {
  const sim = simulateForKc(kcMult, opts)
  return { eKtV: sim.eKtV, spKtV: sim.spKtV, reboundFraction: sim.reboundFraction, sim }
}

// ---------------------------------------------------------------- estimator

/**
 * Recover Kc -- and hence eKt/V -- from the samples actually taken.
 *
 * One unknown, so a bracketed golden-section search on the likelihood. The model
 * prediction at each sampled minute is regenerated for each candidate Kc, which
 * is what allows a sample taken BEFORE equilibration to inform the equilibrated
 * dose: the rebound is modelled, not waited out.
 *
 * @param {Array<{minute:number,bunMgNPerL:number}>} samples
 */
export function estimateFromSamples(samples, { sigma = NOISE_PROPORTIONAL_SD, options = {} } = {}) {
  const ordered = [...samples].sort((a, b) => a.minute - b.minute)
  let cache = { kcMult: Number.NaN, curve: null }

  function curveFor(kcMult) {
    if (cache.kcMult === kcMult && cache.curve !== null) return cache.curve
    const truth = truthForKc(kcMult, options)
    const curve = {
      pre: truth.sim.preMgNPerL,
      equilibrated: truth.sim.equilibratedMgNPerL,
      dialysis: new Map(truth.sim.dialysisTrack.map((r) => [r.minute, r.C1])),
      rebound: new Map(truth.sim.reboundTrack.map((r) => [r.minute, r.C1])),
      kcMult,
    }
    cache = { kcMult, curve }
    return curve
  }

  function predicted(curve, minute) {
    if (minute <= 0) return curve.pre
    if (minute <= SESSION_MINUTES) return curve.dialysis.get(minute) ?? Number.NaN
    return curve.rebound.get(minute - SESSION_MINUTES) ?? curve.equilibrated
  }

  function objective(kcMult) {
    if (!(kcMult > 0)) return Number.POSITIVE_INFINITY
    const curve = curveFor(kcMult)
    let total = 0
    for (const s of ordered) {
      const f = predicted(curve, s.minute)
      if (!Number.isFinite(f) || f <= 0) return Number.POSITIVE_INFINITY
      total += ((s.bunMgNPerL - f) / (sigma * f)) ** 2 + 2 * Math.log(sigma * f)
    }
    return total
  }

  const phi = (Math.sqrt(5) - 1) / 2
  let a = Math.log(3)
  let b = Math.log(60)
  let c = b - phi * (b - a)
  let d = a + phi * (b - a)
  let fc = objective(Math.exp(c))
  let fd = objective(Math.exp(d))
  for (let i = 0; i < 60; i += 1) {
    if (fc < fd) {
      b = d
      d = c
      fd = fc
      c = b - phi * (b - a)
      fc = objective(Math.exp(c))
    } else {
      a = c
      c = d
      fc = fd
      d = a + phi * (b - a)
      fd = objective(Math.exp(d))
    }
  }
  const kcMult = Math.exp((a + b) / 2)
  const truth = truthForKc(kcMult, options)
  return {
    kcMult,
    eKtV: truth.eKtV,
    spKtV: truth.spKtV,
    reboundFraction: truth.reboundFraction,
    objective: objective(kcMult),
  }
}

/**
 * The Daugirdas-Schneditz rate equation, the standard-of-care comparison.
 *
 *   spKt/V - eKt/V = a*(spKt/V / t_hours) - b,   a = 0.6, b = 0.03
 *
 * Source (form and both constants verified against it): HEMO Study Manual of
 * Operations, NIDDK, http://repository.niddk.nih.gov/media/studies/hemo/Manual_of_Operations.pdf
 * which attributes the derivation to Daugirdas JT, Schneditz D, ASAIO J
 * 1995;41(3):M719-24, PMID 8573901.
 */
export function rateEquationEKtV(spKtV, sessionHours) {
  return spKtV - (0.6 * spKtV) / sessionHours + 0.03
}

/** Rebound-correction magnitude, same source. */
export function rateEquationGap(spKtV, sessionHours) {
  return (0.6 * spKtV) / sessionHours - 0.03
}

// ---------------------------------------------------------------- self-test

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href

if (invokedDirectly) {
  process.stdout.write('estimator self-test: recover eKt/V from the protocol schedule\n')
  process.stdout.write('='.repeat(70) + '\n')
  for (const kcMult of [10, 16, 24]) {
    const truth = truthForKc(kcMult)
    const samples = PROTOCOL_TIMES.map((minute) => ({
      minute,
      bunMgNPerL: concentrationAt(minute, kcMult) * (1 + 0.02 * ((minute % 7) / 7 - 0.5)),
    }))
    const fit = estimateFromSamples(samples)
    process.stdout.write(
      `  true Kc ${String(kcMult).padStart(2)}xV  ->  fitted ${fit.kcMult.toFixed(2)}xV   ` +
        `eKt/V ${fit.eKtV.toFixed(3)} vs true ${truth.eKtV.toFixed(3)}   ` +
        `error ${Math.abs(fit.eKtV - truth.eKtV).toFixed(4)}\n`,
    )
  }
  process.stdout.write('\nrate equation cross-check (form verified against the HEMO manual):\n')
  process.stdout.write("  manual's worked example: spKt/V 1.2 over 3 h -> gap 0.21\n")
  process.stdout.write(`  this implementation:                        gap ${rateEquationGap(1.2, 3).toFixed(2)}\n`)
}
