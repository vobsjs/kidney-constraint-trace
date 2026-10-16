#!/usr/bin/env node
/**
 * STUDY DESIGN CALCULATION for the four-draw protocol.
 *
 * WHAT THIS CAN AND CANNOT SETTLE
 *   It can compute, from the verified HEMO parameters, (a) the within-session
 *   precision of the four-draw protocol, and (b) the between-patient spread of the
 *   error made by the clinical standard of care. Both feed a sample-size
 *   calculation.
 *
 *   It CANNOT know the true between-patient SD of the quantity being estimated --
 *   that is what the study would measure. So the sample size is reported as a
 *   function of that unknown, not as a single number. Presenting one would be
 *   false precision.
 *
 * Run:  node dialysis_session/tools/study_design.mjs
 */

import { simulateSession, makePatient, HEMO, toBunMgDl } from '../patient_dialyzer.mjs'

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const sd = (xs) => {
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}

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

const rateEquation = (spKtV, hours) => spKtV - (0.6 * spKtV) / hours + 0.03

process.stdout.write('STUDY DESIGN -- four-draw protocol for equilibrated Kt/V\n')
process.stdout.write('='.repeat(78) + '\n\n')

// ---------------------------------------------------------------- virtual cohort
// Distribution volumes and generation rates use the PUBLISHED means and SDs.
// The exchange parameter has no published between-patient SD: HEMO fixes
// Kc = 16 x V for urea. It is therefore swept, because it is one of the things
// the study would measure.
const N = 4000
const rand = mulberry32(20221427)
function truncatedNormal(m, s, lo, hi) {
  for (let i = 0; i < 1000; i += 1) {
    const x = m + s * normalFrom(rand)
    if (x >= lo && x <= hi) return x
  }
  return m
}

process.stdout.write('1. BETWEEN-PATIENT SPREAD of the error made by the standard of care\n')
process.stdout.write('   (published SDs for V and G; Kc variability swept, since none is published)\n')
process.stdout.write('-'.repeat(78) + '\n')
process.stdout.write(
  `  ${'Kc CV'.padStart(7)} ${'mean |err|'.padStart(12)} ${'SD of err'.padStart(12)} ${'P(err>0.05)'.padStart(12)} ${'P(err>0.10)'.padStart(12)}\n`,
)
const cohorts = {}
for (const kcCv of [0, 0.2, 0.35, 0.5]) {
  const errs = []
  for (let i = 0; i < N; i += 1) {
    const volumeL = truncatedNormal(HEMO.ureaDistributionVolumeL, HEMO.ureaDistributionVolumeSdL, 15, 55)
    const generationMgNPerMin = truncatedNormal(HEMO.ureaGenerationMgNPerMin, 1.95, 1, 12)
    const kcMult = Math.max(4, 16 * (1 + kcCv * normalFrom(rand)))
    const patient = { ...makePatient({ volumeL, generationMgNPerMin }), kcLPerMin: (kcMult * volumeL) / 1000 }
    const s = simulateSession({ patient })
    errs.push(rateEquation(s.spKtV, 4) - s.eKtV)
  }
  cohorts[kcCv] = errs
  const ae = errs.map(Math.abs)
  process.stdout.write(
    `  ${(kcCv * 100).toFixed(0).padStart(6)}% ${mean(ae).toFixed(3).padStart(12)} ${sd(errs).toFixed(3).padStart(12)} ` +
      `${((ae.filter((e) => e > 0.05).length / N) * 100).toFixed(1).padStart(11)}% ${((ae.filter((e) => e > 0.1).length / N) * 100).toFixed(1).padStart(11)}%\n`,
  )
}

// ---------------------------------------------------------------- precision
process.stdout.write('\n2. WITHIN-SESSION PRECISION of the four-draw protocol\n')
process.stdout.write('   (assay noise only; this part IS computable from the model)\n')
process.stdout.write('-'.repeat(78) + '\n')
process.stdout.write('   From compare_sampling.mjs, pooled over 200 seeds and 3 true Kc:\n')
process.stdout.write('     active sampling        mean |eKt/V error| 0.006\n')
process.stdout.write('     conventional protocol  mean |eKt/V error| 0.012\n')
process.stdout.write('     spKt/V + rate equation mean |eKt/V error| 0.085\n')

// ---------------------------------------------------------------- sample size
process.stdout.write('\n3. SAMPLE SIZE to estimate the mean discrepancy to a stated precision\n')
process.stdout.write('-'.repeat(78) + '\n')
process.stdout.write('   n = (1.96 * SD / margin)^2, two-sided 95%. SD is the UNKNOWN the study measures.\n\n')
process.stdout.write(`  ${'assumed SD'.padStart(11)} ${'n for +/-0.05'.padStart(15)} ${'n for +/-0.02'.padStart(15)}\n`)
for (const assumedSd of [0.05, 0.1, 0.15, 0.2, 0.3]) {
  const n05 = Math.ceil(((1.96 * assumedSd) / 0.05) ** 2)
  const n02 = Math.ceil(((1.96 * assumedSd) / 0.02) ** 2)
  process.stdout.write(`  ${assumedSd.toFixed(2).padStart(11)} ${String(n05).padStart(15)} ${String(n02).padStart(15)}\n`)
}
process.stdout.write(
  `\n  The best available estimate of that SD comes from the model itself: ` +
    `${sd(cohorts[0.35]).toFixed(3)} Kt/V units\n  at an assumed 35% between-patient CV in Kc. ` +
    `That implies n ~ ${Math.ceil(((1.96 * sd(cohorts[0.35])) / 0.05) ** 2)} for +/-0.05.\n`,
)

// ---------------------------------------------------------------- detection
process.stdout.write('\n4. HOW MANY SESSIONS TO SHOW THE FOUR-DRAW PROTOCOL BEATS THE RATE EQUATION\n')
process.stdout.write('-'.repeat(78) + '\n')
process.stdout.write('   Paired within patient: each session contributes both estimates, so the\n')
process.stdout.write('   relevant SD is that of the WITHIN-patient difference, not the between-patient\n')
process.stdout.write('   spread. From the model the within-patient difference is ~0.08 Kt/V, dominated\n')
process.stdout.write('   by the rate equation side.\n\n')
for (const [label, d] of [['modest (0.05)', 0.05], ['expected (0.08)', 0.08], ['large (0.15)', 0.15]]) {
  const n = Math.ceil(((1.96 + 0.84) * 0.085 / d) ** 2) // 80% power, alpha 0.05
  process.stdout.write(`  effect size ${label.padEnd(16)} -> n ~ ${String(n).padStart(4)} paired sessions (80% power)\n`)
}

process.stdout.write('\n5. WHAT THE STUDY WOULD FALSIFY\n')
process.stdout.write('-'.repeat(78) + '\n')
process.stdout.write('  P1. The rate equation leaves a residual error > 0.05 Kt/V in a substantial\n')
process.stdout.write('      fraction of sessions. The model predicts 40.8% at an assumed Kc CV of 0.\n')
process.stdout.write('  P2. That residual is predicted by the exchange parameter: sessions with slow\n')
process.stdout.write('      exchange show a larger residual. This is the mechanism claim.\n')
process.stdout.write('  P3. The four-draw protocol reduces the error to <= 0.05 in >= 95% of sessions.\n')
process.stdout.write('  P4. Urea intercompartmental clearance in dialysis patients sits nearer 24xV\n')
process.stdout.write('      than the 16xV currently used for urea. This is the localisation from the\n')
process.stdout.write('      ultrafiltration test, and it is the sharpest falsifiable claim here.\n')
process.stdout.write('\n  P4 is the one that settles the open discrepancy. P1-P3 are engineering.\n')
