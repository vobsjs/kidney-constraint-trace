#!/usr/bin/env node
/**
 * VERIFY ALL — one command that checks every published result in this repository.
 *
 * Each check runs a tool, extracts its headline number, and compares it against
 * the value recorded in the documentation. If a check fails, either a result has
 * drifted or a documented number is wrong; both matter.
 *
 * Requirements: Node.js (ESM). No dependencies, no build step. Developed on v24.10.0.
 *
 * Run:  node tools/verify_all.mjs
 */

import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..')

const results = []

function check({ name, command, args, expect, extract }) {
  let output
  try {
    output = execFileSync(command, args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    results.push({ name, ok: false, detail: `FAILED TO RUN: ${error.message.split('\n')[0]}` })
    return
  }
  const actual = extract(output)
  const ok = actual === expect
  results.push({ name, ok, detail: `expected ${expect}  got ${actual}` })
}

const grab = (re) => (text) => {
  const m = text.match(re)
  if (m === null) return '(not found)'
  return (m[1] ?? m[0]).trim()
}

// ---------------------------------------------------------------- stage 1-3
check({
  name: 'PK benchmark: evaluator metric on the session observations',
  command: process.execPath,
  args: ['evaluator/judge.mjs'],
  expect: '{"rmse_mg_l":2.658522510029544}',
  extract: grab(/\{"rmse_mg_l":[^}]+\}/),
})
check({
  name: 'PK benchmark: multi-start optimum',
  command: process.execPath,
  args: ['tools/reference_optimizer.mjs'],
  expect: '2.544927',
  extract: grab(/optimised RMSE \(mg\/L\)\s+: ([\d.]+)/),
})

// ------------------------------------------- stage 1-3 benchmark internals, from a clone
check({
  name: 'PK ledger §5: stage-2 baseline RMSE reproduces from the benchmark field',
  command: process.execPath,
  args: ['benchmark/pk/reproduce_stage2_fit.mjs'],
  expect: '6.434202',
  extract: grab(/baseline RMSE \(mg\/L\)\s+([\d.]+)/),
})
check({
  name: 'PK ledger §5: stage-2 optimum RMSE reproduces',
  command: process.execPath,
  args: ['benchmark/pk/reproduce_stage2_fit.mjs'],
  expect: '3.392378',
  extract: grab(/optimum  RMSE \(mg\/L\)\s+([\d.]+)/),
})
check({
  name: 'PK ledger §4: Monte Carlo sampling mean reproduces',
  command: process.execPath,
  args: ['benchmark/pk/monte_carlo.mjs', '200'],
  expect: '3.514335',
  extract: grab(/clearanceAtCrcl92LPerH\s+3\.440000\s+([\d.]+)/),
})
check({
  name: 'PK ledger §5: external check on the noise-free curve reproduces',
  command: process.execPath,
  args: ['benchmark/pk/external_check.mjs'],
  expect: '8.5460e-1',
  extract: grab(/recovered  ([\d.eE+-]+)/),
})

// ---------------------------------------------------------------- stage 4
check({
  name: 'dialyzer: forward check against real manufacturer data',
  command: process.execPath,
  args: ['dialyzer/tools/validate_against_manufacturers.mjs'],
  expect: '0.89%',
  extract: grab(/worst \|diff\| = ([\d.]+%)/),
})
check({
  name: 'dialyzer: elasticity span across the operating grid',
  command: process.execPath,
  args: ['dialyzer/tools/validate_against_manufacturers.mjs'],
  expect: '33x',
  extract: grab(/-- a (\d+x) range/),
})

// ---------------------------------------------------------------- stage 5
check({
  name: 'patient: device model reproduces the HEMO clinical clearance',
  command: process.execPath,
  args: ['dialysis_session/tools/validate_session_model.mjs'],
  expect: '230.3',
  extract: grab(/closest: [^\n]*-> ([\d.]+) mL\/min/),
})
check({
  name: 'patient: pre-dialysis BUN reaches a physiological steady state',
  command: process.execPath,
  args: ['dialysis_session/tools/validate_session_model.mjs'],
  expect: '57.1',
  extract: grab(/pre-dialysis BUN\s+([\d.]+) mg\/dL/),
})
check({
  name: 'patient: post-dialysis rebound',
  command: process.execPath,
  args: ['dialysis_session/tools/validate_session_model.mjs'],
  expect: '29.9%',
  extract: grab(/rebound at 60 min\s+([\d.]+%)/),
})
check({
  name: 'ultrafiltration: uf=0 reproduces stage 5 exactly',
  command: process.execPath,
  args: ['dialysis_session/tools/ultrafiltration_test.mjs'],
  expect: '29.9%',
  extract: grab(/rebound\s+([\d.]+%)\s+\(stage 5/),
})
check({
  name: 'ultrafiltration: does NOT close the rebound gap (negative result)',
  command: process.execPath,
  args: ['dialysis_session/tools/ultrafiltration_test.mjs'],
  expect: '24xV',
  extract: grab(/reproduces the published correction at Kc ~ (\d+xV)/),
})
check({
  name: 'estimator: reproduces the HEMO manual worked example',
  command: process.execPath,
  args: ['dialysis_session/estimator.mjs'],
  expect: '0.21',
  extract: grab(/this implementation:\s+gap ([\d.]+)/),
})
check({
  name: 'rate equation: protocol schedule recovers eKt/V (16xV case error)',
  command: process.execPath,
  args: ['dialysis_session/estimator.mjs'],
  expect: '0.0030',
  extract: grab(/true Kc 16xV[\s\S]*?error ([\d.]+)/),
})
check({
  name: 'study design: sample size at the model SD estimate',
  command: process.execPath,
  args: ['dialysis_session/tools/study_design.mjs'],
  expect: '19',
  extract: grab(/That implies n ~ (\d+) for/),
})

// ---------------------------------------------------------------- report
process.stdout.write('kidney-constraint-trace — verification of every published result\n')
process.stdout.write('='.repeat(78) + '\n')
process.stdout.write(`Node ${process.version}\n\n`)
let failed = 0
for (const r of results) {
  if (!r.ok) failed += 1
  process.stdout.write(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}\n`)
  if (!r.ok) process.stdout.write(`        ${r.detail}\n`)
}
process.stdout.write('\n' + '='.repeat(78) + '\n')
process.stdout.write(`${results.length - failed}/${results.length} checks passed\n`)
if (failed > 0) {
  process.stdout.write(
    '\nA failure means either a result drifted or a documented number is wrong.\n' +
      'Both matter: the documentation is part of the deliverable.\n',
  )
  process.exit(1)
}
process.stdout.write('\nAll documented results reproduce.\n')
