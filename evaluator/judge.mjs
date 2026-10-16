#!/usr/bin/env node
/**
 * HOST-OWNED EVALUATOR for the gentamicin creatinine-clearance PK benchmark.
 *
 * FROZEN. This path is declared in the Host evaluator registration's
 * `evaluatorFiles`, so the autoresearch boundary protects it: a candidate run
 * cannot edit it, and its SHA-256 is captured in the attempt provenance.
 *
 * It reads the candidate parameters from the isolated worktree, simulates the
 * published structural model, and reports ONE scalar: the root-mean-square error
 * between the simulated curve and the frozen literature-derived reference points.
 *
 * Contract required by the Host (metricParserVersion: final-line-json-v1):
 *   - exit 0
 *   - the LAST line of stdout is a JSON object with exactly one key, the
 *     registered metric name, holding a finite number
 *   - no earlier stdout line may be a JSON object carrying that same key
 *
 * Run:  node evaluator/judge.mjs
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { simulateCurve, validateParameters, TUNABLE_PARAMETERS } from './pk_model.mjs'

const METRIC_NAME = 'rmse_mg_l'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')

/** Read and validate the mutable candidate parameters. */
function loadParameters() {
  const path = join(repoRoot, 'model', 'params.json')
  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`could not read model/params.json as JSON: ${error.message}`)
  }
  const problems = validateParameters(parsed)
  if (problems.length > 0) fail(`invalid model/params.json: ${problems.join('; ')}`)
  return parsed
}

/** Read the observations collected during the active session. */
function loadReferencePoints() {
  const path = join(repoRoot, 'data', 'session_observations.csv')
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    fail(`could not read data/session_observations.csv: ${error.message}`)
  }
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
  if (lines.length < 2) fail('data/session_observations.csv has no data rows')
  const header = lines[0].split(',').map((cell) => cell.trim())
  const index = {
    crcl: header.indexOf('crcl_ml_min'),
    time: header.indexOf('time_h'),
    concentration: header.indexOf('concentration_mg_l'),
  }
  for (const [key, position] of Object.entries(index)) {
    if (position < 0) fail(`data/session_observations.csv is missing the ${key} column`)
  }
  return lines.slice(1).map((line) => {
    const cells = line.split(',')
    const crclMlMin = Number(cells[index.crcl])
    const timeH = Number(cells[index.time])
    const observedMgL = Number(cells[index.concentration])
    if (!Number.isFinite(crclMlMin) || !Number.isFinite(timeH) || !Number.isFinite(observedMgL)) {
      fail(`malformed observation row: ${line}`)
    }
    return { crclMlMin, timeH, observedMgL }
  })
}

/** Read the frozen regimen used to tabulate the reference curve. */
function loadRegimen() {
  const path = join(repoRoot, 'data', 'dataset.json')
  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`could not read data/dataset.json as JSON: ${error.message}`)
  }
  const doseMg = parsed?.regimen?.dose_mg
  const infusionHours = parsed?.regimen?.infusion_hours
  if (!Number.isFinite(doseMg) || !Number.isFinite(infusionHours) || infusionHours <= 0) {
    fail('data/dataset.json must define regimen.dose_mg and regimen.infusion_hours')
  }
  return { doseMg, infusionHours }
}

function fail(message) {
  process.stderr.write(`judge: ${message}\n`)
  process.exit(1)
}

function main() {
  const params = loadParameters()
  const reference = loadReferencePoints()
  const regimen = loadRegimen()

  const simulated = simulateCurve(params, regimen, reference)

  let sumSquaredError = 0
  let worstAbsoluteError = 0
  let worstPoint = null
  const byClearance = new Map()

  for (let i = 0; i < reference.length; i += 1) {
    const observed = reference[i].observedMgL
    const predicted = simulated[i].predictedMgL
    if (!Number.isFinite(predicted)) {
      fail(`simulation produced a non-finite concentration at CrCl ${reference[i].crclMlMin} mL/min, t=${reference[i].timeH} h`)
    }
    const residual = predicted - observed
    sumSquaredError += residual * residual
    const absoluteError = Math.abs(residual)
    if (absoluteError > worstAbsoluteError) {
      worstAbsoluteError = absoluteError
      worstPoint = { ...reference[i], predicted }
    }
    const bucket = byClearance.get(reference[i].crclMlMin) ?? { sumSquared: 0, count: 0 }
    bucket.sumSquared += residual * residual
    bucket.count += 1
    byClearance.set(reference[i].crclMlMin, bucket)
  }

  const rmse = Math.sqrt(sumSquaredError / reference.length)

  // Human-readable diagnostics. None of these lines is a JSON object, so the
  // final-line metric parser cannot mistake them for the result.
  process.stdout.write(`reference points evaluated: ${reference.length}\n`)
  process.stdout.write('candidate parameters:\n')
  for (const name of TUNABLE_PARAMETERS) {
    process.stdout.write(`  ${name} = ${params[name]}\n`)
  }
  process.stdout.write('per-clearance RMSE (mg/L):\n')
  for (const crcl of [...byClearance.keys()].sort((a, b) => a - b)) {
    const bucket = byClearance.get(crcl)
    const value = Math.sqrt(bucket.sumSquared / bucket.count)
    process.stdout.write(`  CrCl ${String(crcl).padStart(3)} mL/min -> ${value.toFixed(5)}\n`)
  }
  if (worstPoint !== null) {
    process.stdout.write(
      `worst point: CrCl ${worstPoint.crclMlMin} mL/min t=${worstPoint.timeH} h ` +
        `observed ${worstPoint.observedMgL} predicted ${worstPoint.predicted.toFixed(5)} mg/L\n`,
    )
  }

  // The single scalar the Host records.
  process.stdout.write(`${JSON.stringify({ [METRIC_NAME]: rmse })}\n`)
}

main()
