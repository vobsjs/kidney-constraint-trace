#!/usr/bin/env node
/** Publish the finished session into the repository as the candidate's data and estimate. */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = process.env.BENCHMARK_REPO ?? resolve(here, '..', '..')
const session = JSON.parse(readFileSync(new URL('./sessions/llm-session.json', import.meta.url), 'utf8'))

const rows = session.observations.map(
  (o) => `${o.crclMlMin},${o.timeH},${o.concentrationMgL.toFixed(6)}`,
)
const csv = ['crcl_ml_min,time_h,concentration_mg_l', ...rows].join('\n') + '\n'
writeFileSync(`${REPO}/data/session_observations.csv`, csv, 'utf8')

const params = {
  _comment:
    'MUTABLE CANDIDATE FILE. Estimate produced by the active loop from the 12 observations in data/session_observations.csv. Units: L/h, per mL/min, L.',
  clearanceAtCrcl92LPerH: Number(session.final.parameters[0].toPrecision(8)),
  crclSlopePerMlMin: Number(session.final.parameters[1].toPrecision(8)),
  volumeOfDistributionL: Number(session.final.parameters[2].toPrecision(8)),
}
writeFileSync(`${REPO}/model/params.json`, JSON.stringify(params, null, 2) + '\n', 'utf8')

process.stdout.write(`wrote ${session.observations.length} observations to ${REPO}/data/session_observations.csv\n`)
process.stdout.write(`wrote estimate to ${REPO}/model/params.json\n`)

// Round-by-round record. Contains only the chooser's own decisions and the
// observations it collected -- no truth, no seal.
const record = {
  benchmark: 'kidney-constraint-trace active-experiment loop',
  chooser: 'language model, deciding sequentially from the observations it has seen',
  // The seed is deliberately NOT published here. With the seed and the published
  // error model the entire noise field -- and the noise-free curve -- could be
  // reconstructed, which would turn the active loop back into a static fit.
  seed: 'held in the Host-side holdout provenance.json',
  budget: session.budget,
  observationsUsed: session.spent,
  finalEstimate: {
    clearanceAtCrcl92LPerH: session.final.parameters[0],
    crclSlopePerMlMin: session.final.parameters[1],
    volumeOfDistributionL: session.final.parameters[2],
  },
  rounds: session.log.map((entry, i) => ({
    round: i + 1,
    crclMlMin: entry.crclMlMin,
    timeH: entry.timeH,
    observedMgL: entry.observed,
    rationale: entry.rationale,
  })),
}
writeFileSync(`${REPO}/results/active_session.json`, JSON.stringify(record, null, 2) + '\n', 'utf8')
process.stdout.write(`wrote ${record.rounds.length} rounds to ${REPO}/results/active_session.json\n`)
