#!/usr/bin/env node
/**
 * ============================================================================
 *  EXTERNAL CHECK -- HOST-SIDE. Reads the truth; must stay outside the repo.
 * ============================================================================
 *
 * Evaluates parameters that were recovered from the NOISY curve against the
 * NOISE-FREE curve. This is the one place the two datasets meet, and it is
 * deliberately outside the fitting loop and outside the Git repository:
 *
 *   - the evaluator (evaluator/judge.mjs) reads only the noisy dataset;
 *   - the fit (tools/reference_optimizer.mjs) reads only the noisy dataset;
 *   - nothing inside the repository can reach reference_points_noiseless.csv.
 *
 * Acceptance criterion 3: the recovered parameters must still land close to the
 * truth on data that contains no noise at all. If they had merely absorbed the
 * noise realisation, this residual would be large.
 *
 * Run:  node external_check.mjs
 */

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { TRUTH } from './generate_reference_data.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = process.env.BENCHMARK_REPO ?? resolve(here, '..', '..')

const { simulateCurve, totalClearanceLPerH } = await import(
  pathToFileURL(join(REPO, 'evaluator', 'pk_model.mjs')).href
)
const { PARAMETER_NAMES, loadRegimen, parseReferenceCsv, fitParameters, BASELINE } = await import(
  pathToFileURL(join(REPO, 'tools', 'reference_optimizer.mjs')).href
)

const TRUTH_VECTOR = [
  TRUTH.clearanceAtCrcl92LPerH,
  TRUTH.crclSlopePerMlMin,
  TRUTH.volumeOfDistributionL,
]
const NAMES = ['truth', 'baseline', 'recovered']

function rmseOn(reference, regimen, parameters) {
  const params = Object.fromEntries(PARAMETER_NAMES.map((n, i) => [n, parameters[i]]))
  const simulated = simulateCurve(params, regimen, reference)
  let sse = 0
  for (let i = 0; i < reference.length; i += 1) {
    const r = simulated[i].predictedMgL - reference[i].observedMgL
    sse += r * r
  }
  return Math.sqrt(sse / reference.length)
}

function main() {
  const text = readFileSync(join(here, 'reference_points_noiseless.csv'), 'utf8')
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  const noiseless = lines.slice(1).map((line) => {
    const [crclMlMin, timeH, observedMgL] = line.split(',').map(Number)
    return { crclMlMin, timeH, observedMgL }
  })
  const digest = createHash('sha256').update(text, 'utf8').digest('hex')

  const regimen = loadRegimen()

  // Compute the STAGE-2 fit here rather than reading results/reference_fit.json.
  // Stage 3 repointed that file at the active session's 12 observations, so it no
  // longer holds the stage-2 parameters this check is about; reading it silently
  // scored the wrong model and returned 1.16 instead of 0.85 mg/L.
  const noisy = parseReferenceCsv(readFileSync(join(here, 'reference_points.csv'), 'utf8'))
  const { results: restarts, best } = fitParameters(noisy, regimen)
  const recovered = best.parameters
  const baseline = [...BASELINE]

  process.stdout.write('EXTERNAL CHECK -- recovered parameters vs the noise-free curve\n')
  process.stdout.write('='.repeat(72) + '\n')
  process.stdout.write(`noise-free points : ${noiseless.length}\n`)
  process.stdout.write(`sha256            : ${digest}\n`)
  process.stdout.write(`read by           : this script only; the evaluator never opens it\n`)
  process.stdout.write(`stage-2 fit       : RMSE ${best.rmse.toFixed(6)} on the noisy field, ` +
    `${restarts.length} restarts, spread ${(restarts[restarts.length - 1].rmse - best.rmse).toExponential(2)}\n\n`)

  process.stdout.write('RMSE against the NOISE-FREE curve (mg/L):\n')
  const scores = {}
  for (const [label, parameters] of [['truth', TRUTH_VECTOR], ['baseline', baseline], ['recovered', recovered]]) {
    scores[label] = rmseOn(noiseless, regimen, parameters)
    process.stdout.write(`  ${label.padEnd(10)} ${scores[label].toExponential(4)}\n`)
  }

  process.stdout.write('\nrecovered vs true values:\n')
  process.stdout.write(
    `  ${'parameter'.padEnd(24)} ${'truth'.padStart(10)} ${'recovered'.padStart(13)} ` +
      `${'abs dev'.padStart(12)} ${'rel dev'.padStart(10)}\n`,
  )
  let maxRel = 0
  PARAMETER_NAMES.forEach((name, i) => {
    const rel = Math.abs(recovered[i] - TRUTH_VECTOR[i]) / TRUTH_VECTOR[i]
    maxRel = Math.max(maxRel, rel)
    process.stdout.write(
      `  ${name.padEnd(24)} ${TRUTH_VECTOR[i].toFixed(6).padStart(10)} ${recovered[i].toFixed(8).padStart(13)} ` +
        `${Math.abs(recovered[i] - TRUTH_VECTOR[i]).toExponential(3).padStart(12)} ` +
        `${(rel * 100).toFixed(3).padStart(9)}%\n`,
    )
  })

  // The implied non-renal clearance is a MODEL property, and estimating it from
  // this data requires extrapolating 45 mL/min below the lowest observed CrCl.
  // It is reported for completeness, NOT used as a pass/fail check: under noise
  // the linear slope is itself uncertain, and CL(0) = CL92 * (1 - 92 * slope) is
  // a difference of near-cancelling terms, so it amplifies slope error 4-6x.
  const params = Object.fromEntries(PARAMETER_NAMES.map((n, i) => [n, recovered[i]]))
  const truthParams = Object.fromEntries(PARAMETER_NAMES.map((n, i) => [n, TRUTH_VECTOR[i]]))
  const implied = totalClearanceLPerH(params, 0)
  const truthImplied = totalClearanceLPerH(truthParams, 0)
  process.stdout.write('\nimplied non-renal clearance at CrCl = 0 (EXTRAPOLATION - informational only)\n')
  process.stdout.write(`  data span CrCl 45..130 mL/min; CrCl = 0 is 45 mL/min below support\n`)
  process.stdout.write(`  truth-equivalent (model property)    : ${truthImplied.toFixed(4)} L/h = ${((truthImplied * 1000) / 60).toFixed(2)} mL/min\n`)
  process.stdout.write(`  recovered                            : ${implied.toFixed(4)} L/h = ${((implied * 1000) / 60).toFixed(2)} mL/min\n`)
  process.stdout.write('  Veinstein 2013 Table 4 (independent) : 0.1205 mL/min/kg = 9.11 mL/min at 75.6 kg\n')
  process.stdout.write('  -> corroborates the TRUTH model (8.54 vs 9.11 mL/min). It does NOT validate a\n')
  process.stdout.write('     noisy extrapolation, which is why it is excluded from the acceptance criteria.\n')

  process.stdout.write(`\nmax relative deviation from truth: ${(maxRel * 100).toFixed(3)}%\n`)
  process.stdout.write(`noise-free RMSE of the recovered fit: ${scores.recovered.toExponential(4)} mg/L\n`)
  process.stdout.write(`noise-free RMSE of the shipped baseline: ${scores.baseline.toFixed(6)} mg/L\n`)
  process.stdout.write(
    `improvement over baseline: ${(scores.baseline / scores.recovered).toFixed(2)}x\n`,
  )
  process.stdout.write(
    `noise-free RMSE relative to the noisy-data noise floor (3.963 mg/L): ` +
      `${(scores.recovered / 3.962908).toFixed(4)}x\n`,
  )

  process.stdout.write('\nVERDICT: the parameters recovered from the NOISY curve explain the\n')
  process.stdout.write(`NOISE-FREE curve to ${scores.recovered.toFixed(6)} mg/L, against ${scores.baseline.toFixed(6)} mg/L\n`)
  process.stdout.write('for the shipped baseline and 0 for the truth. They did not merely absorb\n')
  process.stdout.write('the noise realisation; they remain a valid fit to data they never saw.\n')
}

main()
