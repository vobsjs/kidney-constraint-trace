#!/usr/bin/env node
/**
 * ============================================================================
 *  MONTE CARLO STUDY -- HOST-SIDE. Reads the truth; must stay outside the repo.
 * ============================================================================
 *
 * WHY THIS EXISTS
 *   A single noisy fit tells you nothing about whether its deviation from the
 *   truth is acceptable: with 32 % CV residual error, some deviation is
 *   inevitable and its size is a property of the estimator, not of the seed.
 *   This script characterises that distribution by repeating the ENTIRE
 *   generate-then-fit pipeline over many independent seeds, using the very same
 *   fitting routine (`fitParameters`) that produced the committed fit.
 *
 *   It answers acceptance criterion 2 directly: is the committed fit's deviation
 *   from the true values consistent with the estimator's own sampling
 *   distribution under the published noise model?
 *
 * It also reports the "expected RMSE at the true parameters", which is the
 * noise floor the fitted RMSE should be compared against -- a noisy fit whose
 * RMSE approaches zero would indicate a broken generator, not a good fit.
 *
 * Run:  node monte_carlo.mjs [replicates]
 */

import { writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { TRUTH, DESIGN, NOISE, SEED, generate } from './generate_reference_data.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = process.env.BENCHMARK_REPO ?? resolve(here, '..', '..')

const optimizer = await import(pathToFileURL(join(REPO, 'tools', 'reference_optimizer.mjs')).href)
const { fitParameters, PARAMETER_NAMES, BASELINE, loadReferencePoints, loadRegimen, makeObjective } =
  optimizer

const TRUTH_VECTOR = [
  TRUTH.clearanceAtCrcl92LPerH,
  TRUTH.crclSlopePerMlMin,
  TRUTH.volumeOfDistributionL,
]

const regimen = { doseMg: DESIGN.doseMgPerKg * DESIGN.bodyWeightKg, infusionHours: DESIGN.infusionHours }

/** Two restarts is ample: the committed study showed all six reach the same point. */
const MC_STARTS = [ [...BASELINE], [3.0, 0.005, 25.0] ]

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const sd = (xs) => {
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}

function main() {
  const replicates = Number(process.argv[2] ?? 200)
  process.stdout.write(`Monte Carlo: ${replicates} replicates, seeds 1..${replicates}\n`)
  process.stdout.write(`noise model: proportional ${NOISE.proportional}, additive ${NOISE.additiveMgL} mg/L\n`)
  process.stdout.write(`estimator  : fitParameters, ${MC_STARTS.length} restarts, unweighted RMSE\n\n`)

  // The noise floor: RMSE of the TRUE curve against its own noisy realisations.
  const truthRows = generate(1)
  const expectedNoiseRmse = Math.sqrt(mean(truthRows.map((r) => r.sd ** 2)))
  process.stdout.write(`expected RMSE at the TRUE parameters (noise floor): ${expectedNoiseRmse.toFixed(6)} mg/L\n\n`)

  const started = Date.now()
  const estimates = []
  const rmseAtTruth = []
  for (let i = 1; i <= replicates; i += 1) {
    const rows = generate(i).map((r) => ({
      crclMlMin: r.crclMlMin,
      timeH: r.timeH,
      observedMgL: r.noisyMgL,
    }))
    const { best, objective } = fitParameters(rows, regimen, MC_STARTS)
    estimates.push(best.parameters)
    rmseAtTruth.push(objective([...TRUTH_VECTOR]))
  }
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  process.stdout.write(`fitted ${replicates} replicates in ${elapsed}s\n\n`)

  const summary = {}
  process.stdout.write('sampling distribution of the estimator (unweighted least squares):\n')
  process.stdout.write(
    `  ${'parameter'.padEnd(24)} ${'truth'.padStart(10)} ${'MC mean'.padStart(10)} ` +
      `${'MC SD'.padStart(11)} ${'bias'.padStart(10)} ${'bias %'.padStart(9)}\n`,
  )
  PARAMETER_NAMES.forEach((name, j) => {
    const column = estimates.map((e) => e[j])
    const m = mean(column)
    const s = sd(column)
    const bias = m - TRUTH_VECTOR[j]
    summary[name] = {
      truth: TRUTH_VECTOR[j],
      mcMean: m,
      mcSd: s,
      bias,
      biasPercent: (bias / TRUTH_VECTOR[j]) * 100,
    }
    process.stdout.write(
      `  ${name.padEnd(24)} ${TRUTH_VECTOR[j].toFixed(6).padStart(10)} ${m.toFixed(6).padStart(10)} ` +
        `${s.toExponential(4).padStart(11)} ${bias.toExponential(3).padStart(10)} ` +
        `${((bias / TRUTH_VECTOR[j]) * 100).toFixed(3).padStart(8)}%\n`,
    )
  })

  // Where does the COMMITTED dataset's fit sit inside that distribution?
  const committed = fitParameters(loadReferencePoints(), loadRegimen(), MC_STARTS).best.parameters
  process.stdout.write('\ncommitted (seed ' + SEED + ') fit, standardised against the sampling distribution:\n')
  const zScores = {}
  PARAMETER_NAMES.forEach((name, j) => {
    const s = summary[name].mcSd
    const deviation = committed[j] - TRUTH_VECTOR[j]
    const z = deviation / s
    zScores[name] = { fitted: committed[j], deviation, zScore: z, withinTwoSd: Math.abs(z) <= 2 }
    process.stdout.write(
      `  ${name.padEnd(24)} fitted ${committed[j].toFixed(8).padStart(13)}  ` +
        `deviation ${(deviation >= 0 ? '+' : '') + deviation.toExponential(3)}  ` +
        `z = ${z >= 0 ? '+' : ''}${z.toFixed(3)}  ${Math.abs(z) <= 2 ? 'within +/-2 SD' : 'OUTSIDE +/-2 SD'}\n`,
    )
  })

  // Coverage: how often does a replicate land within +/-1.96 SD of the truth?
  process.stdout.write('\ncoverage of the nominal 95% interval (truth +/- 1.96 * MC SD):\n')
  const coverage = {}
  PARAMETER_NAMES.forEach((name, j) => {
    const s = summary[name].mcSd
    const hits = estimates.filter((e) => Math.abs(e[j] - TRUTH_VECTOR[j]) <= 1.96 * s).length
    coverage[name] = hits / replicates
    process.stdout.write(`  ${name.padEnd(24)} ${(coverage[name] * 100).toFixed(1)}%\n`)
  })

  process.stdout.write(
    `\nRMSE against the noisy data, at the true parameters: ` +
      `${mean(rmseAtTruth).toFixed(6)} mg/L (SD ${sd(rmseAtTruth).toFixed(6)})\n`,
  )

  const artifact = {
    generatedBy: 'benchmark/pk/monte_carlo.mjs',
    replicates,
    seeds: '1..N (independent of the committed seed)',
    estimator: `fitParameters with ${MC_STARTS.length} restarts, unweighted RMSE`,
    noiseModel: NOISE,
    expectedNoiseRmseMgL: expectedNoiseRmse,
    meanRmseAtTruthMgL: mean(rmseAtTruth),
    sdRmseAtTruthMgL: sd(rmseAtTruth),
    samplingDistribution: summary,
    committedSeed: SEED,
    committedFit: Object.fromEntries(PARAMETER_NAMES.map((n, j) => [n, committed[j]])),
    committedZScores: zScores,
    coverage,
    // NOTE: no wall-clock timing is written into this artifact. It is committed and
    // tools/verify_all.mjs re-runs this script, so a timing field would make every
    // verification run dirty the working tree -- and would make `git status`
    // useless as a check that a clone is unmodified. Timing is printed to stdout
    // instead, where it belongs.
  }
  writeFileSync(join(here, 'monte_carlo.json'), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
  process.stdout.write('wrote monte_carlo.json\n')
}

main()
