#!/usr/bin/env node
/**
 * ============================================================================
 *  SEALED GENERATOR -- HOST-SIDE. MUST NOT BE COPIED INTO THE BENCHMARK REPO.
 * ============================================================================
 *
 * This file is the only place that knows the true parameter values, the residual
 * error model, and the random seed. It emits two artifacts with different
 * audiences:
 *
 *   1. NOISY  -> benchmark/pk/reference_points.csv          (the fitting target)
 *   2. NOISELESS -> <holdout>/reference_points_noiseless.csv (external check only)
 *
 * The noiseless file lives outside the Git repository, therefore outside the
 * dsh-autoresearch worktree, therefore it is not reachable through the
 * benchmark's declared inputs. The evaluator never reads it (see
 * evaluator/judge.mjs, which opens only the session's own observations).
 *
 * ---------------------------------------------------------------------------
 * NOISE MODEL -- LITERATURE, NOT INVENTED
 * ---------------------------------------------------------------------------
 * Combined additive + proportional residual error, as reported for this model:
 *
 *     proportional = 0.32          (32 % CV)
 *     additive     = 0.056 mg/L
 *
 * Source: Bos JC et al., Antimicrob Agents Chemother 2019;63(4):e02328-18,
 * Table S1 ("Proportional 32%", "Additive 0.056 mg/L"). These magnitudes are the
 * ones carried forward by Duong A et al., Pharmaceutics 2022;14(7):1426, for the
 * Bos structural model used here -- Duong's Table S2 states the error model
 * ("Mixed") but not re-estimated magnitudes, so the original Bos values apply.
 *
 * Realisation, per the NONMEM combined-error convention:
 *
 *     y_obs = y_pred + SD * z,   SD = sqrt((0.32 * y_pred)^2 + 0.056^2),  z ~ N(0,1)
 *
 * ---------------------------------------------------------------------------
 * STRUCTURAL MODEL AND TRUE PARAMETERS
 * ---------------------------------------------------------------------------
 *   CL(CrCl) = CL92 * (1 + SLOPE * (CrCl - 92))      [L/h]
 *   k        = CL / V
 *   IV infusion of duration T at rate R = dose / T:
 *     t <= T :  C(t) = (R/CL) * (1 - exp(-k t))
 *     t >  T :  C(t) = (R/CL) * (1 - exp(-k T)) * exp(-k (t - T))
 *
 *   CL92 = 3.44 L/h, SLOPE = 0.00925 per mL/min, V = 22.4 L
 *   Source: Duong 2022, Table S2 (Bos row).
 *
 * Run:  node generate_reference_data.mjs --write
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------- configuration

/** True (published) parameter values. Retired from secrecy -- see PK_LEDGER.md. */
export const TRUTH = {
  clearanceAtCrcl92LPerH: 3.44,
  crclSlopePerMlMin: 0.00925,
  volumeOfDistributionL: 22.4,
  crclReferenceMlMin: 92,
}

/** Residual error, exactly as published. See header. */
export const NOISE = {
  proportional: 0.32,
  additiveMgL: 0.056,
  citation:
    'Bos JC et al. Antimicrob Agents Chemother 2019;63(4):e02328-18, Table S1, carried forward by Duong A et al. Pharmaceutics 2022;14(7):1426.',
}

/**
 * SEED. Chosen a priori, before any fitting, and NOT tuned to produce a
 * favourable fit: 20221426 is read directly off the primary citation
 * (2022, volume 14, article 1426). Changing it changes the committed dataset,
 * so it is frozen here and recorded in provenance.json.
 */
export const SEED = 20221426

/** Experiment design. Identical to the deterministic predecessor. */
export const DESIGN = {
  bodyWeightKg: 80.0,
  doseMgPerKg: 5.0,
  infusionHours: 0.5,
  crclStrataMlMin: [45, 60, 75, 92, 110, 130],
  sampleTimesH: [0.5, 1, 2, 4, 8, 12],
}

// ---------------------------------------------------------------- deterministic RNG

/** mulberry32: small, fast, fully specified 32-bit PRNG. Reproducible across platforms. */
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

/** Box-Muller standard normal. Consumes exactly two uniforms per deviate. */
function normalFrom(rand) {
  let u = 0
  let v = 0
  while (u === 0) u = rand()
  while (v === 0) v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// ---------------------------------------------------------------- model

function publishedClearance(crclMlMin) {
  const { clearanceAtCrcl92LPerH, crclSlopePerMlMin, crclReferenceMlMin } = TRUTH
  return clearanceAtCrcl92LPerH * (1 + crclSlopePerMlMin * (crclMlMin - crclReferenceMlMin))
}

function infusionConcentration({ doseMg, infusionHours, clearanceLPerH, volumeL, timeH }) {
  const rate = doseMg / infusionHours
  const k = clearanceLPerH / volumeL
  const plateau = rate / clearanceLPerH
  if (timeH <= infusionHours) return plateau * (1 - Math.exp(-k * timeH))
  const atEnd = plateau * (1 - Math.exp(-k * infusionHours))
  return atEnd * Math.exp(-k * (timeH - infusionHours))
}

// ---------------------------------------------------------------- generation

/** Generate one replicate: predictions plus the published residual error. */
export function generate(seed) {
  const rand = mulberry32(seed)
  const doseMg = DESIGN.doseMgPerKg * DESIGN.bodyWeightKg
  const rows = []
  for (const crclMlMin of DESIGN.crclStrataMlMin) {
    const clearanceLPerH = publishedClearance(crclMlMin)
    for (const timeH of DESIGN.sampleTimesH) {
      const predictedMgL = infusionConcentration({
        doseMg,
        infusionHours: DESIGN.infusionHours,
        clearanceLPerH,
        volumeL: TRUTH.volumeOfDistributionL,
        timeH,
      })
      const sd = Math.sqrt((NOISE.proportional * predictedMgL) ** 2 + NOISE.additiveMgL ** 2)
      const z = normalFrom(rand)
      const noisyMgL = predictedMgL + sd * z
      rows.push({ crclMlMin, timeH, predictedMgL, sd, z, noisyMgL })
    }
  }
  return rows
}

const fixed = (v, d) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d)
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex')

function noisyCsv(rows) {
  const header = 'crcl_ml_min,time_h,concentration_mg_l'
  const body = rows.map((r) => `${r.crclMlMin},${r.timeH},${fixed(r.noisyMgL, 6)}`)
  return `${[header, ...body].join('\n')}\n`
}

function noiselessCsv(rows) {
  const header = 'crcl_ml_min,time_h,concentration_mg_l'
  const body = rows.map((r) => `${r.crclMlMin},${r.timeH},${fixed(r.predictedMgL, 6)}`)
  return `${[header, ...body].join('\n')}\n`
}

function main() {
  const rows = generate(SEED)

  const nonPositive = rows.filter((r) => r.noisyMgL <= 0)
  if (nonPositive.length > 0) {
    process.stderr.write(
      `REFUSING: seed ${SEED} produced ${nonPositive.length} non-positive concentration(s), ` +
        `which is physically impossible for a measured assay:\n` +
        nonPositive.map((r) => `  CrCl ${r.crclMlMin} t=${r.timeH} -> ${r.noisyMgL.toFixed(4)}\n`).join('') +
        `Choose a different seed and record the reason in the ledger.\n`,
    )
    process.exit(2)
  }

  const noisyText = noisyCsv(rows)
  const noiselessText = noiselessCsv(rows)

  // Both artifacts are written INSIDE the benchmark directory, not into the
  // repository's data/.
  //
  // data/ deliberately holds only the 12 observations a session bought, because
  // the active-loop interface requires that the chooser cannot pre-read the full
  // field. Regenerating the whole 36-point table into data/ would silently undo
  // that design every time someone reproduced these numbers. The benchmark's raw
  // field belongs with the benchmark.
  mkdirSync(here, { recursive: true })
  writeFileSync(join(here, 'reference_points.csv'), noisyText, 'utf8')
  writeFileSync(join(here, 'reference_points_noiseless.csv'), noiselessText, 'utf8')

  const provenance = {
    generated_by: 'benchmark/pk/generate_reference_data.mjs',
    seed: SEED,
    seed_rationale:
      'Read a priori off the primary citation (2022, volume 14, article 1426). Not tuned against any fit.',
    rng: 'mulberry32 + Box-Muller, fully specified, platform independent',
    truth_parameters: TRUTH,
    noise_model: NOISE,
    design: DESIGN,
    n_points: rows.length,
    files: {
      noisy: { path: 'reference_points.csv (benchmark directory)', sha256: sha256(noisyText) },
      noiseless: {
        path: 'reference_points_noiseless.csv (benchmark directory)',
        sha256: sha256(noiselessText),
      },
    },
    generated_at_utc: new Date().toISOString(),
  }
  writeFileSync(join(here, 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`, 'utf8')

  process.stdout.write(`seed ${SEED}: wrote ${rows.length} points\n`)
  process.stdout.write(`  noisy     -> ${join(here, 'reference_points.csv')}\n`)
  process.stdout.write(`  noiseless -> ${join(here, 'reference_points_noiseless.csv')}\n`)
  process.stdout.write(`  sha256 noisy     ${provenance.files.noisy.sha256}\n`)
  process.stdout.write(`  sha256 noiseless ${provenance.files.noiseless.sha256}\n`)
  const obs = rows.map((r) => r.noisyMgL)
  process.stdout.write(
    `  observed range ${Math.min(...obs).toFixed(3)} .. ${Math.max(...obs).toFixed(3)} mg/L\n`,
  )
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href

if (invokedDirectly) main()

export { noisyCsv, noiselessCsv, infusionConcentration, publishedClearance }
