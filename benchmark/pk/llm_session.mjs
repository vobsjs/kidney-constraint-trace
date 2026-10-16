#!/usr/bin/env node
/**
 * ============================================================================
 *  INTERACTIVE ACTIVE-LOOP SESSION -- HOST-SIDE
 * ============================================================================
 *
 * Drives ONE experiment session in which the chooser is the language model
 * itself, not an algorithm: each call asks the simulator for a single
 * observation, then the model decides where to look next. State persists
 * between calls so the loop is genuinely sequential.
 *
 * What the chooser is shown after each round: the observations collected so
 * far, the current ML estimate, and the LOCAL uncertainty of each parameter
 * derived from the accumulated Fisher information. It is NOT shown the sealed
 * field, the truth, or the D-optimal recommendation -- the decision has to be
 * reasoned, not delegated.
 *
 * Usage:
 *   node llm_session.mjs start  [--seed 20221426]
 *   node llm_session.mjs query  --points "45,0.5;130,12" --reason "..."
 *   node llm_session.mjs status
 *   node llm_session.mjs finish
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { openSession, BUDGET, STRATA_ML_MIN, TIMES_H } from './simulator.mjs'
import { fitMl, pointInformation, addMatrices, determinant3, zeroInformation, PARAMETER_NAMES } from './estimator.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const SESSION_DIR = join(here, 'sessions')
const SESSION_FILE = join(SESSION_DIR, 'llm-session.json')
const DEFAULT_SEED = 20221426

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function load() {
  if (!existsSync(SESSION_FILE)) throw new Error('no session; run `start` first')
  return JSON.parse(readFileSync(SESSION_FILE, 'utf8'))
}

function save(state) {
  mkdirSync(SESSION_DIR, { recursive: true })
  writeFileSync(SESSION_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

/** Local relative uncertainty of each parameter, from the accumulated information. */
function localUncertainty(observations) {
  if (observations.length < 3) return null
  let fit
  try {
    fit = fitMl(observations)
  } catch {
    return null
  }
  let M = zeroInformation()
  for (const o of observations) M = addMatrices(M, pointInformation(fit.parameters, o.crclMlMin, o.timeH))
  const det = determinant3(M)
  if (!(det > 0)) return null
  // Inverse of a 3x3 by adjugate / determinant.
  const inv = [
    [M[1][1] * M[2][2] - M[1][2] * M[2][1], M[0][2] * M[2][1] - M[0][1] * M[2][2], M[0][1] * M[1][2] - M[0][2] * M[1][1]],
    [M[1][2] * M[2][0] - M[1][0] * M[2][2], M[0][0] * M[2][2] - M[0][2] * M[2][0], M[0][2] * M[1][0] - M[0][0] * M[1][2]],
    [M[1][0] * M[2][1] - M[1][1] * M[2][0], M[0][1] * M[2][0] - M[0][0] * M[2][1], M[0][0] * M[1][1] - M[0][1] * M[1][0]],
  ].map((row) => row.map((v) => v / det))
  // Diagonals are in log-parameter space, so sqrt gives a relative SD directly.
  return {
    parameters: fit.parameters,
    relativeSd: Object.fromEntries(
      PARAMETER_NAMES.map((n, k) => [n, Math.sqrt(Math.max(inv[k][k], 0))]),
    ),
  }
}

function report(state) {
  process.stdout.write(`session seed ${state.seed} | budget ${state.budget} | spent ${state.spent} | remaining ${state.remaining}\n`)
  process.stdout.write('\nobservations so far (CrCl mL/min, t h, C mg/L):\n')
  if (state.observations.length === 0) process.stdout.write('  (none)\n')
  for (const o of state.observations) {
    process.stdout.write(`  CrCl ${String(o.crclMlMin).padStart(3)}  t ${String(o.timeH).padStart(4)}  ->  ${o.concentrationMgL.toFixed(4)}\n`)
  }
  const unc = localUncertainty(state.observations)
  if (unc !== null) {
    process.stdout.write('\ncurrent ML estimate (local information-based relative SD):\n')
    PARAMETER_NAMES.forEach((n, k) => {
      process.stdout.write(
        `  ${n.padEnd(24)} ${unc.parameters[k].toPrecision(5).padStart(12)}   +/- ${(unc.relativeSd[n] * 100).toFixed(1)}%\n`,
      )
    })
  } else {
    process.stdout.write('\n(not enough observations for a three-parameter fit yet)\n')
  }
  process.stdout.write(`\ngrid: CrCl in [${STRATA_ML_MIN.join(', ')}]; t in [${TIMES_H.join(', ')}]\n`)
}

function main() {
  const command = process.argv[2]

  if (command === 'start') {
    const seed = Number(arg('seed') ?? DEFAULT_SEED)
    const state = { seed, budget: BUDGET, spent: 0, remaining: BUDGET, observations: [], log: [] }
    save(state)
    process.stdout.write(`started session, seed ${seed}, budget ${BUDGET}\n`)
    report(state)
    return
  }

  const state = load()

  if (command === 'query') {
    const spec = arg('points')
    const reason = arg('reason') ?? ''
    if (!spec) throw new Error('--points "crcl,time;crcl,time" is required')
    // Rebuild a live session from the persisted decisions so the sealed field
    // stays inside the simulator.
    const session = openSession({ seed: state.seed, budget: state.budget })
    for (const prior of state.log) session.query(prior.crclMlMin, prior.timeH, prior.rationale)
    for (const piece of spec.split(';').filter((s) => s.trim() !== '')) {
      const [crcl, time] = piece.split(',').map(Number)
      const obs = session.query(crcl, time, reason)
      process.stdout.write(
        `  QUERY CrCl ${crcl} / t ${time}  ->  ${obs.concentrationMgL.toFixed(4)} mg/L` +
          `${obs.duplicate ? '  (already seen; no budget spent)' : ''}\n`,
      )
      if (!obs.duplicate) {
        state.log.push({ crclMlMin: crcl, timeH: time, rationale: reason })
      }
    }
    state.observations = session.observations
    state.spent = session.spent
    state.remaining = session.remaining
    if (reason) state.log[state.log.length - 1].rationale = reason
    // Attach each rationale to the matching observation for the record.
    state.log = state.log.map((entry) => {
      const obs = state.observations.find((o) => o.crclMlMin === entry.crclMlMin && o.timeH === entry.timeH)
      return { ...entry, observed: obs ? obs.concentrationMgL : null }
    })
    save(state)
    process.stdout.write('\n')
    report(state)
    return
  }

  if (command === 'status') {
    report(state)
    return
  }

  if (command === 'finish') {
    const fit = fitMl(state.observations)
    const unc = localUncertainty(state.observations)
    process.stdout.write('FINAL ESTIMATE from the 12 collected observations\n')
    process.stdout.write('='.repeat(64) + '\n')
    PARAMETER_NAMES.forEach((n, k) => {
      process.stdout.write(
        `  ${n.padEnd(24)} ${fit.parameters[k].toPrecision(8).padStart(14)}` +
          (unc ? `   +/- ${(unc.relativeSd[n] * 100).toFixed(1)}%` : '') + '\n',
      )
    })
    state.final = { parameters: fit.parameters, value: fit.value }
    save(state)
    process.stdout.write('\nwrote the estimate into the session record\n')
    return
  }

  throw new Error(`unknown command: ${command}`)
}

main()
