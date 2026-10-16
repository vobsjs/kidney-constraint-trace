# kidney-constraint-trace — from a drug PK benchmark to a dialysis study protocol

Five stages of work on creatinine clearance, haemodialysis and dialysis dosing.
It began as a small parameter-fitting benchmark and ended as a **reviewable
clinical study protocol with a validated analysis pipeline**.

> **If you are a clinician or clinical researcher, this is a protocol, not a
> clinical tool.** Start at [`dialysis_session/PROTOCOL.md`](./dialysis_session/PROTOCOL.md).
> See [`HANDOVER.md`](./HANDOVER.md) for what you would need to run it and what is
> still missing.

---

## What each stage is

| Stage | Directory | What it does | Clinical relevance |
| --- | --- | --- | --- |
| 1–3 | repo root (`data/`, `evaluator/`, `model/`, `tools/`) | A gentamicin creatinine-clearance PK benchmark: deterministic fit → stochastic → active experiment loop | **None.** Methodological development on one drug in one population. |
| 4 | [`dialyzer/`](./dialyzer/README.md) | A haemodialyzer as a counter-current mass-transfer device; KoA identified from bench clearance measurements | The device itself. Validated against 120 real EN ISO 8637-1:2020 measurements. |
| 5 | [`dialysis_session/`](./dialysis_session/README.md) | That device coupled to a two-pool human urea model; post-dialysis rebound and the sampling design | The clinical quantity: **equilibrated Kt/V**, the dose actually delivered. |

**Stages 1–3 are not needed to understand or run the study.** They are kept
because the estimator and design machinery were developed there and are reused
unchanged, and because their negative results are part of the record.

## Start here

| You want to… | Go to |
| --- | --- |
| Review or run the clinical study | [`dialysis_session/PROTOCOL.md`](./dialysis_session/PROTOCOL.md), then [`HANDOVER.md`](./HANDOVER.md) |
| Check where every number comes from | [`PROVENANCE.md`](./PROVENANCE.md) |
| Know what is validated vs assumed vs unverified | [`PROVENANCE.md`](./PROVENANCE.md) §4 |
| Reproduce every result in the repository | `node tools/verify_all.mjs` |
| Understand the device physics | [`dialyzer/README.md`](./dialyzer/README.md) |
| Understand the patient model | [`dialysis_session/README.md`](./dialysis_session/README.md) |
| Understand the original PK benchmark | [`PK_BENCHMARK.md`](./PK_BENCHMARK.md) |

## The headline clinical result

Post-dialysis urea rebound means the sample taken at the end of a session
understates the patient's true equilibrated concentration, so single-pool Kt/V
**overstates the dose delivered**. In this model the overstatement is
**0.26–0.28 Kt/V units** — larger than the entire margin at which dose targets are
set.

| Protocol | Error in equilibrated Kt/V |
| --- | --- |
| immediate post sample, no correction | 0.281 |
| Daugirdas–Schneditz rate equation (**no extra sample**) | 0.085 |
| **one extra draw 30 min after the session** | **0.012** |
| plus optimal choice of draw times | 0.006 |

**The first-order win is taking the delayed sample at all, not choosing its timing
well.** The protocol is built around that: four draws per session, the fourth at
+30 min.

## What this package is NOT

- **Not a clinical tool.** No regulatory clearance, no validation in patients, not
  for individual patient care.
- **Not validated against patients.** Every physiological parameter is a
  population mean from published literature. The model has never been confronted
  with a real patient's measured BUN trajectory. This is the central limitation
  and it is stated in every stage's documentation.
- **Not reviewed.** The protocol has not been seen by any ethics committee or
  clinician.
- **Not a device model of everything.** No access recirculation, no cardiopulmonary
  recirculation, no middle-molecule removal.

## Requirements

Pure Node.js ESM. **No dependencies, no build step, no package manager.**
Developed and verified on **Node v24.10.0**.

Verify the whole repository reproduces:

```sh
node tools/verify_all.mjs
```

## Layout

```
README.md                  this file
HANDOVER.md                what a clinical collaborator needs, and what is missing
PROVENANCE.md              every constant, its value, its source, its verification status
PK_BENCHMARK.md            the stage 1-3 benchmark specification (retired as an evaluation)
PK_LEDGER.md               the stages 1-3 decision record
LEDGER.md files            stage decision records, one per stage directory

tools/verify_all.mjs       one command that checks every result reproduces

data/ evaluator/ model/ tools/   stage 1-3 PK benchmark (the active-loop interface)
dialyzer/                        stage 4 device model + real manufacturer data + LEDGER.md
dialysis_session/                stage 5 patient model + PROTOCOL.md + LEDGER.md + estimator
benchmark/                       the retired benchmark internals: generators, noise
                                 simulators, sampling strategies, comparison experiments
                                 and their recorded outputs, for all three benchmarks
```

## Decision records

Every stage's design decisions, rationale, failures and assumptions are recorded in
a ledger inside this package: [`PK_LEDGER.md`](./PK_LEDGER.md),
[`dialyzer/LEDGER.md`](./dialyzer/LEDGER.md),
[`dialysis_session/LEDGER.md`](./dialysis_session/LEDGER.md).

The benchmark internals that produced them — generators, noise simulators, sampling
strategies, comparison experiments and their recorded outputs — are in
[`benchmark/`](./benchmark/), so **every benchmark number in every ledger reproduces
from a clone.**

Both were originally held outside the repository under a seal, because the
repository was also a benchmark against an autonomous agent that must not be able to
read the answers. That evaluation phase is over, the seal is retired, and the
material is now part of the deliverable.

**Consequence, stated plainly:** the stages 1–3 true values, seed and noise-free
curve are now published, so **stages 1–3 are retired as a sealed evaluation.** They
remain a methodological record. Nothing clinical depends on that seal.
