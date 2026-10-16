# Stage 5 — coupling the device to a patient

Stage 4 modelled the artificial kidney on a bench. This stage puts a **human body
on the other end of it**, and asks the clinical question the hardware exists to
answer: *how much dialysis did the patient actually receive?*

## 1. Why this is a real biological system, not more device detail

A dialyzer is plastic and cellulose. The previous stage could be extended forever
— convection terms, sieving coefficients, fibre geometry — without ever touching
biology. This stage instead adds:

- a **two-pool human urea distribution** (proximal/extracellular and
  distal/intracellular volumes with a finite intercompartmental exchange), and
- a **real clinical endpoint**: the equilibrated dose actually delivered,
  `eKt/V = ln(C_pre / C_equilibrated)`.

The device is not re-fitted. `dialyzer_model.mjs` — the same function validated
against 120 manufacturer measurements to 0.89% — supplies the intradialytic
removal term. The two stages are genuinely coupled.

## 2. The patient, verified from source

All patient parameters are taken from, and were read directly from:

> Daugirdas JT, Depner TA. *Creatinine generation from kinetic modeling with or
> without postdialysis serum creatinine measurement: results from the HEMO study.*
> Nephrol Dial Transplant 2017;32(11):1926–1933. PMC5837547.

| Quantity | Value |
| --- | --- |
| Model structure | two-pool (proximal/distal) |
| Urea distribution volume | **31.1 (SD 7.0) L** |
| proximal : distal volume ratio | **1 : 2** |
| Intercompartmental clearance | **Kc = 16 × V(L) mL/min** |
| Urea generation (as nitrogen) | **4.85 (SD 1.95) mg/min** |
| Measured cross-dialyzer urea clearance | **230 (SD 37) mL/min** at 1 h |

## 3. What the coupling produces

`tools/validate_session_model.mjs`:

**CHECK 1 — the device model reproduces a clinical measurement.** The HEMO study
*measured* 230 mL/min across the dialyzer in patients. Stage 4's in-vitro model,
built from manufacturer bench data, gives **230.3 mL/min** at Qb 250 / Qd 800 /
KoA 800 (0.1%), and 231.9 at Qb 250 / Qd 500 / KoA 1000 (0.8%). Nothing was
tuned: two independent laboratories, two independent measurement traditions,
agreeing.

**CHECK 2 — the cycle reaches a physiological steady state.** A dialysis patient is
at a *periodic* steady state, not a static one. Because a 44 h interdialytic
interval spans ~60 exchange time constants (V₂/Kc ≈ 42 min), the pools are fully
equilibrated at the start of each session, so the periodic state is solvable
exactly in two passes rather than by iterating cycles:

```
C_pre = (beta + G*t_interval/V) / (1 - alpha)
```

Result: pre-dialysis BUN **57.1 mg/dL**, end-session **12.3**, equilibrated
**15.9 mg/dL** — all within the clinical range.

**CHECK 3 — rebound.** 29.9% at 60 min, so single-pool Kt/V reports **1.539** where
the delivered dose is **1.277**: an overstatement of **0.262 Kt/V units**.

**CHECK 4 — cross-check against the published correction.** The Daugirdas rate
equation `eKt/V = spKt/V − 0.6·spKt/V/t_h + 0.03` is an empirical fit to exactly
this physiology, so agreement is a real test. The model's spKt/V→eKt/V gap and the
formula's agree to within **0.098 Kt/V units** over 3–5 h sessions — the right
magnitude, with a systematic residual (§5).

## 4. The sampling design question

The rebound is invisible to the immediate end-of-session sample. Recovering the
true dose normally means keeping the patient 30–60 minutes for another draw, which
in practice often does not happen.

**Protocol:** 4 blood samples — a pre-dialysis draw is mandatory (the needle is
already in), so **three** are bought. Grid of 17 plausible times from 0 to 360 min.
**Endpoint: recover eKt/V to within ±0.05 Kt/V units.**

Why 0.05: the uncorrected shortcut is biased by ~0.28 units, so a protocol within
0.05 is ~5× more accurate than the shortcut it replaces, and well inside the
0.1–0.2 granularity at which dose targets are set.

200 seeds × 3 true Kc (10×, 16×, 24× V) × 5 protocols × 2% assay noise:

| protocol | median error | mean error | endpoint hit |
| --- | --- | --- | --- |
| single-pool, no correction | 0.268 | 0.281 | **0.0%** |
| spKt/V + Daugirdas rate equation (**no extra sample**) | 0.066 | 0.085 | 40.8% |
| conventional protocol (pre, 120, end, +30) | 0.009 | 0.012 | 100.0% |
| random 4 draws | 0.009 | 0.012 | 98.3% |
| **active (sequential D-optimal)** | **0.004** | **0.006** | **100.0%** |
| oracle (design computed at the truth) | 0.005 | 0.007 | 100.0% |

Paired: active vs conventional **t = −13.7, p < 1e-300** (wins 415/600); active vs
random **t = −13.0, p < 1e-300**; active vs oracle t = −6.0, p = 2.4e-9.

**Robust to assay noise** (1% / 2% / 4%): active is consistently ~2× better than
the conventional protocol, and at 4% the conventional protocol drops to 92.3%
while active holds 100%.

### The finding, stated honestly

**The first-order win is taking a delayed post-dialysis sample at all — not which
times you choose.** The rate equation recovers most of the dose for free; the extra
sample takes the residual from 0.085 to 0.012; optimizing *when* halves it again to
0.006. Each step is real and statistically robust, but they are an order of
magnitude apart in size, and the timing optimisation is the smallest of the three.

## 5. Where the model is wrong

1. **The model over-predicts rebound, and ultrafiltration is not the reason.**
   It predicts 29.9% at a 4 h reference session against ~21.5% implied by the
   published rate equation, with a systematic session-length trend.

   Two explanations were on the table: missing fluid removal, or a wrong exchange
   parameter. `tools/ultrafiltration_test.mjs` discriminates between them.
   Ultrafiltration was implemented mass-based (the proximal volume shrinks, and
   the ultrafiltrate carries solute at the proximal concentration, so the
   convective term is `Quf·C1` and no separate clearance is added on top).
   `uf = 0` reproduces stage 5 exactly, confirming the reimplementation.

   **It makes the discrepancy worse, not better:**

   | ultrafiltration | rebound | model gap | vs published gap |
   | --- | --- | --- | --- |
   | 0 L | 29.9% | 0.262 | 0.201 |
   | 2.5 L (realistic) | 34.6% | 0.297 | 0.201 |

   Convective clearance removes more and leaves a *larger* proximal/distal
   disequilibrium for the rebound to undo. **One candidate explanation is
   eliminated.**

   The discrepancy therefore localises to the exchange parameter. The model
   reproduces the published correction at **Kc ≈ 24×V**, while HEMO's urea value —
   used here unchanged — is **16×V**, about 1.5× lower. Reported as a discrepancy
   measure, not a fit: fitting Kc to the equation used as the cross-check would
   make it circular. It is, however, a concrete falsifiable claim (protocol §8, P4).
2. **No access or cardiopulmonary recirculation**, so the effective clearance the
   patient experiences is lower than the model's.
3. **The assay noise SD (2%) is a modelling choice**, like the 3% in stage 4. Tested
   at 1% and 4%; the ordering of protocols holds at all three.

## 6. The wall, and what survives hitting it

This stage was chosen knowing it points at the wall found in stage 1: **there is no
open, verified, per-patient dialysis time-series data** with which to validate a
patient model against individual outcomes. I hit it. What that means concretely:

- **Not done:** the model has never been confronted with a real patient's measured
  pre/post/rebound BUN trajectory. Its parameters are population means from a
  published kinetic model, and its agreement with the rate equation is a
  cross-check between two models, not a validation against a person.
- **What survives, and is transferable anyway:**
  - the coupled device–patient model, and the demonstration that an in-vitro bench
    parameter reproduces a clinical clearance measurement to 0.8%;
  - the exact periodic-steady-state solution, which removes the need to iterate
    cycles (60→2 evaluations, a ~100× speed-up and no convergence parameter);
  - the finding that **a delayed sample dominates the timing optimisation** — this
    is a protocol conclusion, and protocols transfer even when parameters do not;
  - a precisely specified study that would break the wall: 4 BUN draws at
    {pre, 120, end, end+30}, recorded with session length, Qb, Qd, ultrafiltration
    volume and dialyzer model, on ~30 patients spanning a range of Kc. The design
    in `compare_sampling.mjs` is already the analysis plan for that study.

## 7. Files

| Path | Role |
| --- | --- |
| `patient_dialyzer.mjs` | two-pool patient + coupled dialyzer, mass-based, exact periodic solve |
| `estimator.mjs` | **the protocol's analysis estimator** -- recovers eKt/V from the four draws; self-tests |
| `tools/validate_session_model.mjs` | checks 1–4 against the verified source values |
| `tools/ultrafiltration_test.mjs` | tests whether ultrafiltration explains the rebound gap (it does not) |
| `tools/study_design.mjs` | between-patient spread, within-session precision, sample size |
| **[`PROTOCOL.md`](./PROTOCOL.md)** | **the four-draw study: design, analysis plan, sample size, resources, approvals, and an honest audit of what is still missing** |

The sealed sampling benchmark (true Kc, noise seeds, designs, comparison) lives in
the Host-side holdout outside this repository, alongside `LEDGER.md`.
