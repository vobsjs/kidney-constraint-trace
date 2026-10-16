# Gentamicin creatinine-clearance PK benchmark — stochastic

A bounded, metric-driven parameter-fitting benchmark for a **simple
one-compartment pharmacokinetic model whose total clearance is a linear function
of creatinine clearance**. The reference curve carries residual noise drawn from
the model's **published** error model, so the objective is a robust estimate
under noise rather than exact parameter recovery.

This repository is the search space for a `dsh-autoresearch` run: the Host
measures a scalar, a candidate may edit exactly one file, and only strict
improvements are kept.

---

## 1. The model

Structural form, as published by Duong et al. 2022 (Bos et al. 2019 structural
model, re-estimated):

```
CL(CrCl) = CL92 * (1 + SLOPE * (CrCl - 92))        [L/h;  CrCl in mL/min]
k        = CL(CrCl) / V                            [1/h]
```

For a single constant-rate intravenous infusion of dose `D` over `T` hours
(rate `R = D / T`):

```
t <= T :   C(t) = (R / CL) * (1 - exp(-k * t))
t >  T :   C(t) = (R / CL) * (1 - exp(-k * T)) * exp(-k * (t - T))
```

**Tunable parameters** (`model/params.json`, the only mutable path):

| Parameter | Meaning | Unit |
| --- | --- | --- |
| `clearanceAtCrcl92LPerH` | Total clearance at CrCl = 92 mL/min | L/h |
| `crclSlopePerMlMin` | Fractional increase in clearance per mL/min of CrCl | 1/(mL/min) |
| `volumeOfDistributionL` | Apparent volume of distribution | L |

`CrCl = 92 mL/min` is the model's published centring value: the combined-cohort
mean creatinine clearance of the development data set.

## 2. The reference data — and its noise

`data/reference_points.csv` holds **36 concentration-time reference points**:
six creatinine-clearance strata (45, 60, 75, 92, 110, 130 mL/min) spanning the
development cohort's renal-function range, each sampled at 0.5, 1, 2, 4, 8 and
12 h after a 400 mg (5 mg/kg × 80 kg) intravenous infusion over 0.5 h.

Each point is the model prediction **plus residual error drawn from the
publication's own combined error model**:

```
y_obs = y_pred + SD * z,      SD = sqrt((0.32 * y_pred)^2 + 0.056^2),   z ~ N(0, 1)
```

| Component | Value | Source |
| --- | --- | --- |
| Proportional | 0.32 (32 % CV) | Bos 2019, Table S1 — carried forward by Duong 2022 |
| Additive | 0.056 mg/L | Bos 2019, Table S1 — carried forward by Duong 2022 |

The error model is **not invented**: Duong 2022 states the error model for the
Bos structural row as "Mixed" but does not re-report magnitudes, so the original
Bos 2019 values apply and are the ones used here.

The noise realisation is fixed by a seed, so the committed CSV is byte-for-byte
reproducible. **The seed is deliberately not stored in this repository**: given
the seed and the error model above, the noise-free curve could be reconstructed
exactly, which would defeat the benchmark.

Because the target now carries realistic residual noise, the optimum is a
statistical estimate, not an exact recovery, and the reference CSV's rounding
floor is no longer the limiting factor.

### Provenance

The reference points are **model-derived**, not raw patient observations. They
are predictions of a published model at published cohort descriptors, plus
published-magnitude noise. `data/dataset.json` records the provenance in
machine-readable form, including the SHA-256 of both the noisy file committed
here and the noise-free file held outside the repository.

## 3. The sealed holdout

The **noise-free** curve is retained as an independent external check and is kept
**outside this Git repository**, therefore outside the `dsh-autoresearch`
worktree, in a Host-side directory whose location is deliberately not recorded
here. Its SHA-256 is published so the exact file can be identified without being
disclosed:

```
noise-free curve SHA-256: ef9b1c438267cc6ad66c96ef6f0a9b6f8c8b4c7b93b614f498ce78e610d25358
```

It is not read by the evaluator, not read by the fit, and not part of the metric.
Only the Host-side external check opens it. The same directory holds the generator
(seed, error model, true values), `provenance.json`, and `LEDGER.md` — the full
decision record with every result and reproduction command.

**Honest limitation.** A Git worktree does not confine filesystem access — the
plugin states this itself. Locating the holdout outside the repository and not
naming it here makes it unreachable through any declared input and undiscoverable
from the benchmark's own documentation, but this is a *protocol-level* boundary,
not a sandbox: a candidate that deliberately searched the filesystem could still
find it.

## 4. The metric

`evaluator/judge.mjs` computes a single scalar:

```
rmse_mg_l = sqrt( mean( (C_predicted(t) - C_reference(t))^2 ) )
```

over all 36 points, in mg/L, to be **minimised**. The evaluator opens exactly
three files — `model/params.json`, `data/reference_points.csv` and
`data/dataset.json` (regimen only) — and never the holdout.

## 5. Write boundary

| Path | Status |
| --- | --- |
| `model/params.json` | **mutable** — the candidate's only writable path |
| `evaluator/*` | frozen (`evaluatorFiles`) |
| `data/*` | frozen (declared dataset) |
| `tools/*`, `README.md` | outside the mutable globs |

The autoresearch boundary rejects any candidate that touches a path outside
`mutable_globs`, so the model implementation, the reference data and the metric
cannot be moved.

## 6. Running it

```
node evaluator/judge.mjs              # diagnostics plus the final-line metric
node tools/reference_optimizer.mjs    # multi-start fit; writes results/reference_fit.json
```

Host-side, outside the repository (these read the truth; run them from the holdout
directory — its location is not recorded here by design):

```
node generate_reference_data.mjs --write      # regenerate BOTH datasets (deterministic)
node monte_carlo.mjs 200                      # estimator sampling distribution
node external_check.mjs                       # recovered params vs the noise-free curve
node compare_objectives.mjs 200               # objective-function comparison
```

The holdout scripts locate this repository through `BENCHMARK_REPO`, which
defaults to `<repo>`.

### Platform blocker: `dsh-autoresearch` cannot run on Windows

The plugin's `StateLayout` rejects any state directory where
`(mode & 0o077) !== 0`. On win32 Node reports **every** directory as `0o666` and
`chmod()` is a no-op, so that condition is unsatisfiable — `StateLayout.open()`
throws even for a freshly created empty temp directory. This is a property of the
plugin, not of this repository, and it is not fixable from the benchmark side. To
run the real loop, use WSL/Linux; this repository is pure Node and ports as-is.

## 7. Results

Metric on the noisy data (see `results/reference_fit.json`):

| | RMSE (mg/L) |
| --- | --- |
| Shipped baseline | 6.434202 |
| Optimum (multi-start fit) | 3.392378 |
| Expected RMSE at the true parameters (noise floor) | 3.963 |

Six widely separated restarts converge to the same point (worst − best RMSE
= 9.8e-15), so the optimum is unique.

Parameter recovery, estimator sampling distribution, and the external check
against the noise-free curve are reported in the Host-side `LEDGER.md`, not here,
because reporting them would disclose the true values.

## 8. Sources

1. Duong A, Simard C, Williamson D, Marsot A. *Model Re-Estimation: An
   Alternative for Poor Predictive Performance during External Evaluations?
   Example of Gentamicin in Critically Ill Patients.*
   Pharmaceutics 2022;14(7):1426. [doi:10.3390/pharmaceutics14071426](https://doi.org/10.3390/pharmaceutics14071426)
   — structural model, cohort descriptors, and the parameter values held in the
   Host-side holdout.
2. Bos JC, Prins JM, Misticio MC, Nunguiane G, Lang CN, Beirao JC, Mathot RAA,
   van Hest RM. *Population pharmacokinetics with Monte Carlo simulations of
   gentamicin in a population of severely ill adult patients from sub-Saharan
   Africa.* Antimicrob Agents Chemother 2019;63(4):e02328-18.
   [doi:10.1128/AAC.02328-18](https://doi.org/10.1128/AAC.02328-18)
   — residual error magnitudes (Table S1).

### Why this source, and what was ruled out

A search for an open, digitised **per-patient** concentration-time dataset
carrying creatinine clearance did not find one. The candidate repositories
(`nlmixr2data`, `nlmixr2lib`) hold published parameter sets and simulated
cohorts, not raw observations. The sources examined and rejected:

| Source | Why not used |
| --- | --- |
| Veinstein 2013, *AAC* 57(2):977-982, [doi:10.1128/AAC.01762-12](https://doi.org/10.1128/AAC.01762-12) | Real, openly tabulated per-patient data (Table 3), and it **was** retrieved and verified. Rejected as the *fit* target because the cohort is anuric/near-anuric on haemodialysis, so renal clearance is ~0 and the CrCl *proportionality* is unidentifiable. Retained as `data/external_validation_veinstein2013.csv` for an independent check of the model's non-renal clearance. Note this file provides only a weak, indirect constraint on the two clearance parameters and does not determine them. |
| Storgaard 2026, *Kidney Int Rep*, [doi:10.1016/j.ekir.2026.107020](https://doi.org/10.1016/j.ekir.2026.107020) | Genuine wide renal-function spread, but individual concentration-time points appear **only in a figure**. Not digitised here: reading values off a semilog plot with overlapping colour groups would inject unquantified error. |
| Staatz 2005; Rodvold 1988; Zaske 1982; Sawchuk & Zaske 1976 | Population-level clearance summaries or ranges only; no per-patient concentration-time numbers retrievable from open sources. |

The Veinstein per-patient values were transcription-verified by recomputing the
paper's own summary row: eight of nine columns reproduce it exactly. `CL_HD` does
not (per-patient 74.72 ± 23.57 against a printed 76.5 ± 23.1 — an inconsistency in
the source, confirmed in the raw HTML). `CL_HD` is used by no check.
