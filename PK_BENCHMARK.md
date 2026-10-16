# Gentamicin creatinine-clearance PK benchmark — active experiment loop

> ## ⚠ RETIRED as a sealed evaluation
>
> This benchmark was built to be run against an autonomous agent that must not be
> able to read the answer. That seal has been retired — see
> [`PK_LEDGER.md`](./PK_LEDGER.md), which is now published inside this package and
> **contains the true parameter values and the noise seed**.
>
> **The specification below is still accurate and the code still runs**, but a
> candidate that reads this repository can look up the answer directly. Do not use
> stages 1–3 as an evaluation without re-sealing.
>
> It remains valid as a methodological record, and as the origin of the estimator
> and the sampling-design machinery that stages 4 and 5 reuse unchanged.

A **sequential experiment-design benchmark**. A chooser is given a budget of
**12 noisy observations** and must decide, one at a time, which creatinine-clearance
stratum and which sampling time to measure next, in order to estimate three
pharmacokinetic parameters of a one-compartment model whose clearance is a linear
function of creatinine clearance.

The benchmark is the successor to two earlier stages of the same problem: a
deterministic fit (exact parameter recovery) and a stochastic fit (robust
estimation from a fixed noisy dataset). Here the dataset is not given — it has to
be bought, one observation at a time.

---

## 1. The model

Structural form, as published by Duong et al. 2022 (Bos et al. 2019 structural
model, re-estimated):

```
CL(CrCl) = CL92 * (1 + SLOPE * (CrCl - 92))        [L/h;  CrCl in mL/min]
k        = CL(CrCl) / V                            [1/h]
```

For a single constant-rate intravenous infusion of dose `D` over `T` hours:

```
t <= T :   C(t) = (R / CL) * (1 - exp(-k * t))
t >  T :   C(t) = (R / CL) * (1 - exp(-k * T)) * exp(-k * (t - T))
```

Regimen: 400 mg (5 mg/kg × 80 kg) infused over 0.5 h.

**Parameters to estimate:**

| Parameter | Meaning | Unit |
| --- | --- | --- |
| `clearanceAtCrcl92LPerH` | Total clearance at CrCl = 92 mL/min | L/h |
| `crclSlopePerMlMin` | Fractional increase in clearance per mL/min of CrCl | 1/(mL/min) |
| `volumeOfDistributionL` | Apparent volume of distribution | L |

## 2. The candidate grid

A query is a pair `(CrCl, t)` drawn from a **6 × 6 grid** = 36 candidate points:

```
CrCl (mL/min): 45, 60, 75, 92, 110, 130
t (h):         0.5, 1, 2, 4, 8, 12
```

`CrCl = 92` is the model's published centring value. Each query returns exactly
one noisy concentration. Re-querying a point already measured returns the cached
value and costs no budget.

## 3. The noise

Every observation carries residual error from the model's **published** combined
error model:

```
y_obs = y_pred + SD * z,      SD = sqrt((0.32 * y_pred)^2 + 0.056^2),   z ~ N(0, 1)
```

| Component | Value | Source |
| --- | --- | --- |
| Proportional | 0.32 (32 % CV) | Bos 2019, Table S1 — carried forward by Duong 2022 |
| Additive | 0.056 mg/L | Bos 2019, Table S1 — carried forward by Duong 2022 |

The error model is not invented. Duong 2022 states the error model for the Bos
structural row as "Mixed" but does not re-report magnitudes, so the original Bos
2019 values apply. The noise realisation is fixed by a seed, so a session is
byte-for-byte reproducible. **The seed is now published in
[`PK_LEDGER.md`](./PK_LEDGER.md)**; it was withheld while this benchmark was an
active evaluation, and that seal is retired (§ title banner).

## 4. The protocol

This is what makes the loop *active* rather than a fit to a supplied table:

1. The full noisy dataset is **never exposed**. It is materialised inside the
   simulator's session closure and is reachable only one point at a time.
2. One query returns **one observation**: one CrCl stratum, one time point.
3. The budget is **12 observations**. A 13th query throws.
4. The chooser sees only its own collected observations and may compute anything
   from them. It cannot read ahead.

The Host-side simulator enforces all four; see below.

## 5. The holdout — seal retired

**This section described a seal that no longer exists.** While stages 1–3 were an
active evaluation, three things were kept outside the repository so that a
candidate agent could not read the answer:

- the **noise-free curve**, used only for the external check;
- the **true parameter values**;
- the **seed and generator**.

**All three are now inside the repository.** The true parameter values and the seed
are published in [`PK_LEDGER.md`](./PK_LEDGER.md), and the noise-free curve — 
previously identified only by hash — is in `benchmark/pk/`. That is why this
benchmark is retired as an evaluation (§ title banner).

The noise-free curve is still accompanied by its hash, so a regenerated copy can be
checked against the one the published results were computed from:

```
noise-free curve SHA-256: ef9b1c438267cc6ad66c96ef6f0a9b6f8c8b4c7b93b614f498ce78e610d25358
```

The remaining benchmark material — the strategy implementations, the noise
simulator, the comparison experiments and the data generator — is in
[`benchmark/pk/`](./benchmark/pk/). **Every number in `PK_LEDGER.md` therefore
reproduces from a clone**, with no Host-side material required:

```sh
node benchmark/pk/generate_reference_data.mjs --write   # regenerate both fields
node benchmark/pk/reproduce_stage2_fit.mjs              # ledger §5: 6.434202 -> 3.392378
node benchmark/pk/monte_carlo.mjs 200                   # ledger §4 sampling distribution
node benchmark/pk/external_check.mjs                    # ledger §5 external check
```

**Honest limitation.** A Git worktree does not confine filesystem access — the
plugin says so itself. The boundary was always protocol-level, not a sandbox.

## 6. The metric

`evaluator/judge.mjs` scores `model/params.json` against the observations actually
collected in the session:

```
rmse_mg_l = sqrt( mean( (C_predicted - C_observed)^2 ) )
```

over `data/session_observations.csv`, in mg/L, to be **minimised**. It opens
exactly three files — `model/params.json`, `data/session_observations.csv` and
`data/dataset.json` (regimen only) — and never the holdout.

This is an in-session diagnostic. The authoritative endpoint is the **external
check against the noise-free curve**, which only the Host can run.

## 7. Write boundary

| Path | Status |
| --- | --- |
| `model/params.json` | **mutable** — the chooser's only writable path |
| `evaluator/*` | frozen (`evaluatorFiles`) |
| `data/*` | frozen (declared dataset) |
| `tools/*`, `README.md` | outside the mutable globs |

## 8. Running it

```
node evaluator/judge.mjs              # score model/params.json on the session data
node tools/reference_optimizer.mjs    # multi-start fit of the session data
```

Host-side, outside the repository (these read the truth; run from the holdout
directory, whose location is not recorded here by design):

```
node generate_reference_data.mjs --write   # regenerate both datasets (deterministic)
node compare_strategies.mjs 200            # uniform12 vs random12 vs active vs oracle
node compare_estimators.mjs 200            # ML vs unweighted LS in the active setting
node external_check.mjs                    # static-stage external check
node check_active_session.mjs              # score the finished session, both gates
```

The holdout scripts locate this repository through `BENCHMARK_REPO`, defaulting
to `<repo>`.

### Platform blocker: `dsh-autoresearch` cannot run on Windows

The plugin's `StateLayout` rejects any state directory where
`(mode & 0o077) !== 0`. On win32 Node reports **every** directory as `0o666` and
`chmod()` is a no-op, so that condition is unsatisfiable. This is a property of
the plugin, not of this repository. To run the real loop, use WSL/Linux; the
benchmark is pure Node and ports as-is.

## 9. Result of the reference session

A language model ran the loop directly, deciding each of the 12 points from the
observations it had already seen. Its reasoning for every round is recorded in
`results/active_session.json`.

| | |
| --- | --- |
| Observations used | 12 / 12 |
| Mean absolute relative error vs truth | **20.1 %** (86th percentile of the active strategy's distribution) |
| External check on the noise-free curve | **1.845 mg/L**, versus 5.592 mg/L for the uninformative baseline — **3.03×** better |

Two of the three parameters lie within ±2 SD of the active estimator's sampling
distribution; `clearanceAtCrcl92LPerH` sits marginally outside at +2.17 SD. The
cause is the seed, not the design: on the same seed the *algorithmic* active
strategy scored 20.65 %, slightly worse than the model's 20.09 %, while the fixed
lattices scored 11.1–11.6 %. Full analysis in `LEDGER.md`.

## 10. Does active selection actually help?

Measured over 200 seeds, 12 observations each, identical estimator, identical
noise field per seed (paired):

| strategy | mean absolute relative error |
| --- | --- |
| random12 (uniform random points) | 20.27 % |
| uniform12 (fixed regular lattice) | 13.12 % |
| **active (sequential D-optimal)** | **12.58 %** |
| oracleStatic (D-optimal computed *with the truth*) | 12.74 % |

The active strategy is **significantly better than random sampling**
(37.9 % lower, paired t = −6.73, p = 1.7e-11) and **statistically
indistinguishable from a well-chosen uniform lattice** (4.1 % lower, p = 0.34).

The oracle explains why: the active rule reaches the D-optimal efficiency bound
without knowing the truth — it actually matched the oracle (p = 0.67) — and the
uniform lattice already captures 95 % of the total headroom available over random
sampling. **When the model is correct and the grid small enough to reason about,
sequential active learning buys robustness against uninformed designs, not an
advantage over a competently chosen fixed design.** Details in `LEDGER.md`.

## 11. Sources

1. Duong A, Simard C, Williamson D, Marsot A. *Model Re-Estimation: An
   Alternative for Poor Predictive Performance during External Evaluations?
   Example of Gentamicin in Critically Ill Patients.*
   Pharmaceutics 2022;14(7):1426. [doi:10.3390/pharmaceutics14071426](https://doi.org/10.3390/pharmaceutics14071426)
   — structural model, cohort descriptors, parameter values (held in the holdout).
2. Bos JC, Prins JM, Misticio MC, Nunguiane G, Lang CN, Beirao JC, Mathot RAA,
   van Hest RM. *Population pharmacokinetics with Monte Carlo simulations of
   gentamicin in a population of severely ill adult patients from sub-Saharan
   Africa.* Antimicrob Agents Chemother 2019;63(4):e02328-18.
   [doi:10.1128/AAC.02328-18](https://doi.org/10.1128/AAC.02328-18)
   — residual error magnitudes (Table S1).

### Why this source, and what was ruled out

A search for an open, digitised **per-patient** concentration-time dataset
carrying creatinine clearance did not find one. Sources examined and rejected:

| Source | Why not used |
| --- | --- |
| Veinstein 2013, *AAC* 57(2):977-982, [doi:10.1128/AAC.01762-12](https://doi.org/10.1128/AAC.01762-12) | Real, openly tabulated per-patient data, and it was retrieved and verified. Rejected as the fit target because the cohort is anuric/near-anuric on haemodialysis, so renal clearance is ~0 and the CrCl *proportionality* is unidentifiable. Retained as `data/external_validation_veinstein2013.csv` for an independent check of the model's non-renal clearance. |
| Storgaard 2026, *Kidney Int Rep*, [doi:10.1016/j.ekir.2026.107020](https://doi.org/10.1016/j.ekir.2026.107020) | Wide renal-function spread, but individual points appear **only in a figure**. |
| Staatz 2005; Rodvold 1988; Zaske 1982; Sawchuk & Zaske 1976 | Population-level clearance summaries or ranges only. |

Veinstein's per-patient values were transcription-verified by recomputing the
paper's own summary row: eight of nine columns reproduce it exactly. `CL_HD` does
not (per-patient 74.72 ± 23.57 against a printed 76.5 ± 23.1 — an inconsistency in
the source, confirmed in the raw HTML). `CL_HD` is used by no check.
