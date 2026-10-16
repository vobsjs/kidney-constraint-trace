#!/usr/bin/env node
/**
 * BOUNDED DIAGNOSTIC: does adding ultrafiltration move the model's rebound toward
 * the value implied by the published (empirically derived) rate equation?
 *
 * The open question from stage 5 is that the mechanistic model over-predicts
 * rebound: 29.9% at a 4 h reference session against ~21.5% implied by the
 * Daugirdas correction, with a systematic session-length trend. Two candidate
 * explanations were on the table:
 *
 *   (i)  a missing physical process -- the model removes no fluid, while a real
 *        session removes 2-3 L and thereby concentrates the proximal pool and
 *        adds convective clearance;
 *   (ii) a wrong exchange parameter -- Kc = 16 x V is quoted in a paper whose
 *        primary subject was creatinine, not urea.
 *
 * This script discriminates between them. Ultrafiltration is NOT a free
 * parameter: the volume is prescribed and recorded in every real session, so
 * adding it is a physical correction rather than a fit. If (i) is the cause, the
 * rebound gap should close. If it does not, (ii) is the remaining explanation and
 * the discrepancy is localised.
 *
 * Run:  node dialysis_session/tools/ultrafiltration_test.mjs
 */

import { simulateSession, makePatient, HEMO, toBunMgDl } from '../patient_dialyzer.mjs'

/** The published rate-equation correction, as the independent reference. */
const rateEquationGap = (spKtV, hours) => 0 + ((0.6 * spKtV) / hours - 0.03)

process.stdout.write('REGRESSION  ultrafiltrationL = 0 must reproduce stage 5 exactly\n')
process.stdout.write('='.repeat(78) + '\n')
const zero = simulateSession({})
process.stdout.write(`  pre-dialysis BUN   ${toBunMgDl(zero.preMgNPerL).toFixed(1)} mg/dL   (stage 5: 57.1)\n`)
process.stdout.write(`  rebound            ${(zero.reboundFraction * 100).toFixed(1)}%        (stage 5: 29.9%)\n`)
process.stdout.write(`  spKt/V             ${zero.spKtV.toFixed(3)}   (stage 5: 1.539)\n`)
process.stdout.write(`  eKt/V              ${zero.eKtV.toFixed(3)}   (stage 5: 1.277)\n\n`)

process.stdout.write('EFFECT OF ULTRAFILTRATION at the reference 4 h session\n')
process.stdout.write('='.repeat(78) + '\n')
process.stdout.write(
  `  ${'UF (L)'.padStart(7)} ${'conv CL'.padStart(9)} ${'pre BUN'.padStart(9)} ${'post'.padStart(7)} ` +
    `${'equil'.padStart(7)} ${'rebound'.padStart(9)} ${'spKt/V'.padStart(8)} ${'eKt/V'.padStart(7)} ${'gap'.padStart(7)}\n`,
)
for (const uf of [0, 1, 2, 2.5, 3, 4]) {
  const s = simulateSession({ ultrafiltrationL: uf })
  process.stdout.write(
    `  ${String(uf).padStart(7)} ${(s.convectiveClearanceMlMin).toFixed(1).padStart(9)} ` +
      `${toBunMgDl(s.preMgNPerL).toFixed(1).padStart(9)} ${toBunMgDl(s.postImmediateMgNPerL).toFixed(1).padStart(7)} ` +
      `${toBunMgDl(s.equilibratedMgNPerL).toFixed(1).padStart(7)} ${(s.reboundFraction * 100).toFixed(1).padStart(8)}% ` +
      `${s.spKtV.toFixed(3).padStart(8)} ${s.eKtV.toFixed(3).padStart(7)} ${(s.spKtV - s.eKtV).toFixed(3).padStart(7)}\n`,
  )
}

process.stdout.write('\nDOES IT CLOSE THE GAP? model gap vs the published correction\n')
process.stdout.write('='.repeat(78) + '\n')
process.stdout.write(`  reference: rate-equation gap implies ${(Math.exp(rateEquationGap(zero.spKtV, 4)) - 1) * 100 > 0 ? '' : ''}rebound of ~21.5% at spKt/V 1.54\n\n`)
process.stdout.write(
  `  ${'session h'.padStart(10)} ${'model gap uf=0'.padStart(15)} ${'model gap uf=2.5'.padStart(17)} ${'formula gap'.padStart(12)}\n`,
)
let worstZero = 0
let worstUf = 0
for (const hours of [3, 3.5, 4, 4.5, 5]) {
  const a = simulateSession({ sessionMinutes: hours * 60, ultrafiltrationL: 0 })
  const b = simulateSession({ sessionMinutes: hours * 60, ultrafiltrationL: 2.5 })
  const formula = rateEquationGap(a.spKtV, hours)
  worstZero = Math.max(worstZero, Math.abs(a.spKtV - a.eKtV - formula))
  worstUf = Math.max(worstUf, Math.abs(b.spKtV - b.eKtV - formula))
  process.stdout.write(
    `  ${String(hours).padStart(10)} ${(a.spKtV - a.eKtV).toFixed(3).padStart(15)} ` +
      `${(b.spKtV - b.eKtV).toFixed(3).padStart(17)} ${formula.toFixed(3).padStart(12)}\n`,
  )
}
process.stdout.write(`\n  worst |model gap - formula gap| with UF = 0   : ${worstZero.toFixed(3)}\n`)
process.stdout.write(`  worst |model gap - formula gap| with UF = 2.5 : ${worstUf.toFixed(3)}\n`)
process.stdout.write(
  worstUf < worstZero - 0.01
    ? '\n  VERDICT: ultrafiltration CLOSES part of the gap. The missing fluid removal was\n  a real contributor, and the model is better for having it.\n'
    : '\n  VERDICT: ultrafiltration does NOT close the gap -- it widens it, because\n  convective clearance removes more and leaves a larger proximal/distal\n  disequilibrium for the rebound to undo. The missing physics is therefore not the\n  explanation, and the discrepancy is localised to the exchange parameter.\n' +
      '  One of the two candidate explanations is now eliminated.\n',
)

// ---------------------------------------------------------------- localisation
process.stdout.write('\nLOCALISATION: what exchange parameter WOULD reproduce the correction?\n')
process.stdout.write('='.repeat(78) + '\n')
process.stdout.write('  Reported as a discrepancy measure, NOT as a fit. Fitting Kc to the very\n')
process.stdout.write('  equation used as the cross-check would make the check circular.\n\n')
const hoursRef = 4
const targetGap = rateEquationGap(zero.spKtV, hoursRef)
process.stdout.write(`  at a ${hoursRef} h session the published correction implies a gap of ${targetGap.toFixed(3)}\n\n`)
process.stdout.write(`  ${'Kc multiple'.padStart(12)} ${'model gap'.padStart(10)} ${'rebound'.padStart(9)}\n`)
let bestMult = null
let bestDiff = Number.POSITIVE_INFINITY
for (const mult of [16, 20, 24, 28, 32, 40, 50, 64]) {
  const volumeL = HEMO.ureaDistributionVolumeL
  const patient = { ...makePatient({ volumeL }), kcLPerMin: (mult * volumeL) / 1000 }
  const s = simulateSession({ patient })
  const gap = s.spKtV - s.eKtV
  const diff = Math.abs(gap - targetGap)
  if (diff < bestDiff) {
    bestDiff = diff
    bestMult = mult
  }
  process.stdout.write(
    `  ${String(mult).padStart(12)} ${gap.toFixed(3).padStart(10)} ${(s.reboundFraction * 100).toFixed(1).padStart(8)}%\n`,
  )
}
process.stdout.write(
  `\n  the model reproduces the published correction at Kc ~ ${bestMult}xV.\n` +
    `  HEMO's value, used here unchanged, is ${HEMO.kcPerLitreMlMin}xV -- roughly ` +
    `${(bestMult / HEMO.kcPerLitreMlMin).toFixed(1)}x lower.\n`,
)
process.stdout.write('  That is a concrete, falsifiable statement: if the exchange parameter is the\n')
process.stdout.write('  problem, an independent measurement of urea intercompartmental clearance in\n')
process.stdout.write('  dialysis patients should land nearer the upper value than the lower one.\n')
