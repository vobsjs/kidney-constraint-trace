# kidney-constraint-trace — from a drug PK benchmark to a dialysis study protocol

> ## To a stranger arriving here
>
> **What this is.** A ten-stage modelling project that traces the binding constraint
> on an artificial kidney — from **mass** (how much sorbent a cartridge holds) to
> **power** (how many watts the chemistry needs). It starts with a small
> pharmacokinetic fitting benchmark and ends with two quantified, measurable
> requirements for a wearable device.
>
> **What this is not.**
> - **Not a clinical tool.** No regulatory clearance, not validated in patients, not
>   for individual patient care.
> - **Not a complete device.** Nothing here has been built or measured on hardware.
>   Every result is computed from published data plus validated sub-models.
> - **Not reviewed.** No ethics committee or clinician has seen it.
> - **Not finished.** Two quantities the conclusion rests on are **measurements, not
>   computations**, and neither has been made:
>   1. **Faradaic efficiency** of electrochemical urea removal — must be **≥ 40 %**.
>      No real cell has been measured.
>   2. **Activated-charcoal creatinine capacity** — must be **≥ 14.8 mg/g**. The value
>      currently used is **an assumption I invented**; no citable figure was found.
>
> **Where to start, by who you are.**
>
> | you are… | read | why |
> | --- | --- | --- |
> | a clinician / PI | [`HANDOVER.md`](./HANDOVER.md) → [`dialysis_session/PROTOCOL.md`](./dialysis_session/PROTOCOL.md) | an executable four-draw study protocol, and exactly what is missing before it can run |
> | a bench / lab team | [`EXPERIMENT_HANDOVER.md`](./EXPERIMENT_HANDOVER.md) | the three testable specifications, what to measure, and what a failure would change |
> | auditing the numbers | [`PROVENANCE.md`](./PROVENANCE.md) | every constant, its source, and whether it was verified, derived, assumed or never sourced |
>
> **How to check it yourself.** One command, no dependencies — see
> [What you can do with this](#what-you-can-do-with-this) immediately below.
>
> **The point of the project, in one line.** Across ten stages the artificial
> kidney's binding constraint moved from *disposable sorbent mass* to *electrical
> power* — and power is the kind of limit a real kidney also operates under, since it
> spends ~7 W on active transport and has no cartridge to replace. That is the
> closest this model gets to biology, and it is not biology: the chemistry is abiotic
> and has no molecular selectivity.
>
> **License: MIT.** See [`LICENSE`](./LICENSE).

## What you can do with this

### 1. Verify it — no kidney knowledge required

```sh
node tools/verify_all.mjs
```

**33 checks, about a minute, pure Node.js — no dependencies, no build step.** Every
published number is re-derived from the code and compared against the value recorded
in the documentation. A failure means either a result drifted or a documented number
is wrong; both matter.

**You do not need to understand haemodialysis to run this or to read the result.**

### 2. Audit it — every constant carries its provenance

[`PROVENANCE.md`](./PROVENANCE.md) tags **every constant in the project**:

| tag | meaning |
| --- | --- |
| **✔ read** | retrieved from the primary source and read out of it |
| **✔ derived** / **✔ repro** | produced by code here, or reproduced against independent data |
| **~ via** | taken from a secondary transcription of a source I never opened |
| **⚠ assume** | a modelling choice, not a sourced value — exposed and sensitivity-tested |
| **✖ unverified** | stated but not checked, listed so it is not mistaken for verified |

**If you think a number is wrong, change it and re-run the suite.** The tags tell you
which numbers are load-bearing and which are placeholders. Two are flagged as weak:
the **charcoal capacity is an assumption I invented**, and the **electrochemical
energy figure was never sourced at all**.

### 3. Continue it — three genuinely different routes

**(a) Measure the two unknown quantities.** Both are bench work, not modelling.
[`EXPERIMENT_HANDOVER.md`](./EXPERIMENT_HANDOVER.md) gives what to measure, the
threshold, and what a failure would change:

- **faradaic efficiency ≥ 40 %** for electrochemical urea removal
- **activated-charcoal creatinine capacity ≥ 14.8 mg/g**

**(b) Run the clinical protocol.** [`dialysis_session/PROTOCOL.md`](./dialysis_session/PROTOCOL.md)
is a four-draw study that can settle whether the standard estimate of dialysis dose
misses by a clinically meaningful amount. It needs a **PI and ethics approval** —
[`HANDOVER.md`](./HANDOVER.md) lists exactly what is missing and who must supply it.

**(c) Take the method elsewhere.** The transferable part is not the kidney model — it
is the **constraint trace**: decompose a system by function, enumerate its finite
resources, and find which one actually binds. It was applied four times here
(*mass → capacity competition → patient variability → power*), and it applies to any
system limited by a consumable.

## What this package cannot do

| it cannot… | because |
| --- | --- |
| **measure anything** | no hardware was ever built. Every result is computed from published data plus validated sub-models. The two quantities the whole conclusion rests on are **measurements**, and neither has been made. |
| **obtain ethics approval** | that needs a named PI, a site and a committee. It is **authority, not knowledge** — and nothing in this repository substitutes for it. |
| **be a device** | no regulatory clearance, no patient validation, no manufacturing. This is a model, a protocol and a set of specifications. |

*For the model's own technical limitations — no selectivity, no reabsorption, no
endocrine function — see [What this package is NOT](#what-this-package-is-not).*


Ten stages of work on creatinine clearance, haemodialysis and dialysis dosing. It
began as a small parameter-fitting benchmark and ended by tracing the artificial
kidney's binding constraint from **sorbent mass** to **electrical power**, with a
reviewable clinical study protocol and a validated analysis pipeline along the way.

---

## What each stage is

| Stage | Directory | What it does | Clinical relevance |
| --- | --- | --- | --- |
| 1–3 | repo root (`data/`, `evaluator/`, `model/`, `tools/`) | A gentamicin creatinine-clearance PK benchmark: deterministic fit → stochastic → active experiment loop | **None.** Methodological development on one drug in one population. |
| 4 | [`dialyzer/`](./dialyzer/README.md) | A haemodialyzer as a counter-current mass-transfer device; KoA identified from bench clearance measurements | The device itself. Validated against 120 real EN ISO 8637-1:2020 measurements. |
| 5 | [`dialysis_session/`](./dialysis_session/README.md) | That device coupled to a two-pool human urea model; post-dialysis rebound and the sampling design | The clinical quantity: **equilibrated Kt/V**, the dose actually delivered. |
| 6 | [`artificial_kidney/`](./artificial_kidney/README.md) | The system, decomposed by function: filtration + regeneration + compartment, closing the dialysate loop | **Continuity** — the functional difference between dialysis and a kidney. |
| 7 | [`artificial_kidney/`](./artificial_kidney/LEDGER_STAGE7.md) | The cartridge as **parallel capacity pools**; urea turns out not to be the binding one | Cartridge life and consumable demand become real quantities. |
| 8 | [`artificial_kidney/`](./artificial_kidney/LEDGER_STAGE8.md) | The charcoal assumption, and **patient variability** as a distribution rather than a range | A device sized for the median fails for 25% of patients. |
| 9 | [`artificial_kidney/`](./artificial_kidney/LEDGER_STAGE9.md) | **Regenerable sorbent**: the limit changes kind, from mass to power | The right *kind* of limit — the one biology also operates under. |
| 10 | [`artificial_kidney/`](./artificial_kidney/LEDGER_STAGE10.md) | The power specification **converted into a measurable faradaic efficiency** (FE ≥ 40%), tested against the one relevant experiment | Turns an untestable device requirement into a bench measurement. |

**Stages 1–3 are not needed to understand or run the study.** They are kept
because the estimator and design machinery were developed there and are reused
unchanged, and because their negative results are part of the record.

## Start here

| You want to… | Go to |
| --- | --- |
| Review or run the clinical study | [`dialysis_session/PROTOCOL.md`](./dialysis_session/PROTOCOL.md), then [`HANDOVER.md`](./HANDOVER.md) |
| Take the artificial-kidney work to a bench | **[`EXPERIMENT_HANDOVER.md`](./EXPERIMENT_HANDOVER.md)** |
| Check where every number comes from | [`PROVENANCE.md`](./PROVENANCE.md) |
| Know what is validated vs assumed vs unverified | [`PROVENANCE.md`](./PROVENANCE.md) §4 |
| Reproduce every result in the repository | `node tools/verify_all.mjs` |
| Understand the device physics | [`dialyzer/README.md`](./dialyzer/README.md) |
| Understand the patient model | [`dialysis_session/README.md`](./dialysis_session/README.md) |
| Understand the original PK benchmark | [`PK_BENCHMARK.md`](./PK_BENCHMARK.md) |
| Understand what limits a wearable artificial kidney | [`artificial_kidney/README.md`](./artificial_kidney/README.md) |

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
HANDOVER.md                what a CLINICAL collaborator needs, and what is missing
EXPERIMENT_HANDOVER.md     what a BENCH team needs: the three testable specifications
PROVENANCE.md              every constant, its value, its source, its verification status
PK_BENCHMARK.md            the stage 1-3 benchmark specification (retired as an evaluation)
PK_LEDGER.md               the stages 1-3 decision record
LEDGER.md files            stage decision records, one per stage directory

tools/verify_all.mjs       one command that checks every result reproduces

data/ evaluator/ model/ tools/   stage 1-3 PK benchmark (the active-loop interface)
dialyzer/                        stage 4 device model + real manufacturer data + LEDGER.md
dialysis_session/                stage 5 patient model + PROTOCOL.md + LEDGER.md + estimator
artificial_kidney/               stage 6 functional modules + closed-loop system
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
