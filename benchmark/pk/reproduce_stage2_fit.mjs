#!/usr/bin/env node
/**
 * Reproduce the STAGE 2 numbers in PK_LEDGER.md from a clone.
 *
 * The repository's tools/reference_optimizer.mjs was repointed in stage 3 to fit
 * the active session's 12 observations, so it no longer reproduces the stage-2 fit
 * of the full 36-point noisy field. This script closes that gap: it fits the
 * benchmark's own regenerated field with the same unweighted-RMSE objective and
 * the same multi-start Nelder-Mead, and reports the two numbers the ledger quotes.
 *
 * Expected (PK_LEDGER.md section 5):
 *   baseline RMSE  6.434202
 *   optimum  RMSE  3.392378
 *   fitted         3.58154650, 0.00445260, 21.87564911
 *
 * Run:  node benchmark/pk/reproduce_stage2_fit.mjs
 *       (run benchmark/pk/generate_reference_data.mjs --write first if the field
 *        is not already present; it is deterministic and committed)
 */

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = process.env.BENCHMARK_REPO ?? resolve(here, '..', '..')

const { parseReferenceCsv, fitParameters, BASELINE, PARAMETER_NAMES } = await import(
  pathToFileURL(join(REPO, 'tools', 'reference_optimizer.mjs')).href
)

const reference = parseReferenceCsv(readFileSync(join(here, 'reference_points.csv'), 'utf8'))
const regimen = JSON.parse(readFileSync(join(REPO, 'data', 'dataset.json'), 'utf8')).regimen
const { dose_mg: doseMg, infusion_hours: infusionHours } = regimen

const { objective, results, best } = fitParameters(reference, { doseMg, infusionHours })
const spread = results[results.length - 1].rmse - best.rmse

process.stdout.write('STAGE 2 reproduction -- unweighted-RMSE fit of the 36-point noisy field\n')
process.stdout.write('='.repeat(74) + '\n')
process.stdout.write(`  reference points          ${reference.length}\n`)
process.stdout.write(`  baseline RMSE (mg/L)      ${objective([...BASELINE]).toFixed(6)}\n`)
process.stdout.write(`  optimum  RMSE (mg/L)      ${best.rmse.toFixed(6)}\n`)
process.stdout.write(`  fitted parameters         ${best.parameters.map((v) => v.toFixed(8)).join(', ')}\n`)
process.stdout.write(`  worst-minus-best restart  ${spread.toExponential(2)}\n`)
