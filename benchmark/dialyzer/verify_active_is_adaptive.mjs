#!/usr/bin/env node
/** Verify the active design really is adaptive, and compare its picks to the oracle. */
import {
  openSession,
  estimateKoA,
  BUDGET,
  TRUTH_SCENARIOS,
  NOISE_PROPORTIONAL_SD,
} from './koa_benchmark.mjs'
import { makeStrategy, UNIFORM_DESIGN, computeOracleDesign } from './strategies.mjs'

for (const scenario of ['urea_mid', 'vitamin_b12', 'myoglobin']) {
  const koA = TRUTH_SCENARIOS[scenario]
  const session = openSession({ seed: 1, koA, sigma: NOISE_PROPORTIONAL_SD, budget: BUDGET })
  const strategy = makeStrategy('active8', 1, koA)
  const picks = []
  while (session.remaining > 0) {
    const c = strategy.next({ observations: session.measurements, step: picks.length, estimator: (m) => estimateKoA(m) })
    session.measure(c.Qb, c.Qd, c.rationale)
    picks.push(`${c.Qb}/${c.Qd}`)
  }
  const oracle = computeOracleDesign(koA).map((p) => `${p.Qb}/${p.Qd}`)
  const uniform = UNIFORM_DESIGN.map((p) => `${p.Qb}/${p.Qd}`)
  const setEq = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
  console.log(`truth KoA ${String(koA).padStart(4)} (${scenario})`)
  console.log(`  active picks : ${picks.join('  ')}`)
  console.log(`  oracle picks : ${oracle.join('  ')}`)
  console.log(`  uniform      : ${uniform.join('  ')}`)
  console.log(`  active == oracle (as a set) : ${setEq(picks, oracle)}`)
  console.log(`  active == uniform (as a set): ${setEq(picks, uniform)}`)
  console.log()
}
