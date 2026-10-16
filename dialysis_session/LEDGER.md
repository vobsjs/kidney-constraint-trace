# LEDGER — STAGE 5: coupling the device to a patient

**Decision record. Formerly held outside the repository under a seal; now part of
the delivered package.**

This is the ledger a clinical collaborator should read: it contains the reasoning
behind the patient model, the post-dialysis rebound result, a bug that produced a
publishable-looking false positive, the ultrafiltration negative result, and the
study-design calculation. The benchmark "truth" values it contains (the exchange
parameter scenarios) are explicit modelling assumptions, not clinical facts.

The instruction below to keep this document outside the repository applied while it
was a sealed benchmark and has been superseded.

Repository: `<repo>`
Companion documents: [`PROTOCOL.md`](./PROTOCOL.md), [`README.md`](./README.md),
[`../HANDOVER.md`](../HANDOVER.md)

Additive stage. The sealed-holdout structure and external-check mechanism from
stages 2–4 are untouched, and the accepted PK and dialyzer benchmarks are
unmodified.

---

## 0. The stage-start question, answered before acting

The brief asks whether the next step moves toward a real biological system and
real experiments, or is spinning inside a device benchmark's internals.

I had three candidate directions and the question eliminated two of them:

| Direction | Verdict |
| --- | --- |
| **(a) Add the HDF convective term** to stage 4 | **Rejected.** Real clinical relevance — HDF is the dominant modality in Europe and Japan — but a dialyzer is plastic and cellulose. It deepens the device benchmark without ever touching biology. |
| **(b) Move to peritoneal dialysis** | **Rejected.** The peritoneal membrane is genuinely living, which is the right instinct, but I found no verifiable human transport data. It would have been modelling without a check. |
| **(c) Couple the validated device to a patient** | **Chosen.** The only option that puts a biological system on the other end of hardware that has already been validated against real measurements. |

**Transferability, answered before acting.** The pharmacokinetic benchmark is one
drug in one population. The dialyzer benchmark is one device. This stage produces
(i) a coupled device–patient model, (ii) a periodic-steady-state solution method
that applies to any repeated-extracorporeal-clearance problem, and (iii) a
**protocol conclusion** about when to draw blood — and protocols transfer even when
parameters do not. Concretely it migrates to any solute (swap the generation rate
and distribution volume), any modality (swap the removal term), and any unit
running a dialysis programme (run the four draws).

**I also knew it points at the wall.** Stage 1 established that no open, verified,
per-patient clinical time-series data exists. I chose it anyway, on the argument
that the honest deliverable at a wall is the specification of the study that would
break it. §6 records what was actually lost by hitting it.

---

## 1. Decisions and rationale

### D22 — The estimand is equilibrated Kt/V, not a kinetic parameter

**Decision.** The quantity to recover is `eKt/V`, the dose actually delivered, not
the intercompartmental clearance that happens to be the free parameter.

**Rationale.** `Kc` is an intermediate. The clinic prescribes and audits dose, and
the HEMO trial tied *delivered* dose to outcome. Making the estimand the clinical
quantity keeps the endpoint meaningful even though the estimator works through `Kc`.

### D23 — A pre-dialysis draw is mandatory, three are bought

**Decision.** Budget 4 samples; `t = 0` is forced, the other three are chosen from
17 plausible times spanning 0–360 min.

**Rationale.** The pre-dialysis draw is free in practice — the needle is already
in — so charging budget for it would misrepresent the real cost structure. This is
the same reasoning as the dialyser stage's grid restriction: make the design space
match what an experimenter can actually do.

### D24 — The 0.05 endpoint

**Decision.** `|eKt/V_estimated − eKt/V_true| ≤ 0.05`.

**Rationale.** The uncorrected clinical shortcut is biased by ~0.28 units in this
model, so 0.05 is ~5× better than the thing being replaced, and it sits well
inside the 0.1–0.2 granularity at which dose targets are set. It is not a round
number chosen for convenience; it is derived from the size of the error that
matters clinically.

### D25 — Adding the rate-equation arm, against my own interest

**Decision.** After the first valid run showed active winning easily, I added the
Daugirdas rate equation as a competing protocol.

**Rationale.** The rate equation corrects single-pool Kt/V using **no extra blood
sample**. Any claim that extra sampling is valuable has to be measured against it,
and omitting it would have made the sampling result look far better than it is. It
changed the headline: the rate equation already achieves 0.085, so the extra sample
buys 0.085 → 0.012, and the timing optimisation only buys 0.012 → 0.006.

### D26 — Exact periodic steady state instead of cycle iteration

**Decision.** Solve the periodic state analytically in two passes:

```
C_pre = (beta + G*t_interval/V) / (1 - alpha)
```

where `alpha` and `beta` come from two simulations started at `C=1` and `C=0`.

**Rationale.** The system is linear in concentration, so the cycle map is affine
and two evaluations determine it. My first implementation iterated cycles to
convergence (60 evaluations plus a convergence parameter); the two-pass form is
exact, removes an arbitrary tolerance, and runs ~100× faster. It reproduced the
iterated result exactly (57.1 mg/dL, 29.9% rebound), which is how I confirmed it.

**This replaced a genuine bug.** The iterated version seeded a single interdialytic
interval from a nominal concentration, which is not a steady state and fabricated a
pre-dialysis BUN of 101.2 mg/dL instead of 57.1.

---

## 2. Validation against the verified source

**CHECK 1 — device model vs clinical measurement.** HEMO measured 230 mL/min
across the dialyzer. Stage 4's in-vitro model: 230.3 mL/min at Qb 250/Qd 800/KoA 800
(0.1%). Independent bench data and independent clinical data agree; nothing tuned.

**CHECK 2 — steady state.** Pre-dialysis BUN 57.1 mg/dL, end-session 12.3,
equilibrated 15.9 — all clinical.

**CHECK 3 — rebound.** 29.9% at 60 min; spKt/V 1.539 vs eKt/V 1.277, an
overstatement of 0.262 units.

**CHECK 4 — published correction.** Model gap 0.242–0.286 across 3–5 h sessions;
rate-equation gap 0.218–0.188. Worst disagreement 0.098 Kt/V units.

**The disagreement is systematic, not noise.** The model's gap *grows* with session
length while the formula's *shrinks*. The most likely cause is the exchange
parameter: `Kc = 16 × V` for urea is quoted in a paper whose primary subject was
creatinine kinetics. This is recorded as a limitation. It is not corrected,
because correcting it would mean fitting the model to the very equation it is
supposed to be cross-checked against.

---

## 3. The sampling benchmark and its endpoint

200 seeds × 3 true Kc (10×, 16×, 24× V, giving rebound 44.2%, 29.9%, 22.5%) × 5
protocols × 4 samples, 2% proportional assay noise, paired on the same noise
realisation.

| protocol | median error | mean error | endpoint hit |
| --- | --- | --- | --- |
| single-pool, no correction | 0.268 | 0.281 | **0.0%** |
| spKt/V + Daugirdas rate equation (**no extra sample**) | 0.066 | 0.085 | 40.8% |
| conventional protocol (pre, 120, end, +30) | 0.009 | 0.012 | 100.0% |
| random 4 draws | 0.009 | 0.012 | 98.3% |
| **active (sequential D-optimal)** | **0.004** | **0.006** | **100.0%** |
| oracle (at the truth) | 0.005 | 0.007 | 100.0% |

| comparison | t | p | active wins |
| --- | --- | --- | --- |
| active vs conventional | −13.72 | < 1e-300 | 415/600 |
| active vs random | −13.03 | < 1e-300 | 424/600 |
| active vs oracle | −5.97 | 2.4e-9 | 349/600 |

**Noise sensitivity** (1% / 2% / 4%): active mean error 0.003 / 0.006 / 0.011
against conventional 0.006 / 0.012 / 0.024. At 4% the conventional protocol drops
to 92.3% endpoint hit while active holds 100%. The ordering is stable; it is the
same conclusion as stage 4's sensitivity, reached independently.

### The honest headline

**The first-order win is taking a delayed post-dialysis sample at all, not choosing
its timing.** Three effects, an order of magnitude apart:

1. correcting at all (rather than reporting raw single-pool): 0.281 → 0.085;
2. adding one delayed sample: 0.085 → 0.012;
3. optimizing *when* the samples are taken: 0.012 → 0.006.

All three are real and statistically robust. Only the third is what this stage's
machinery contributes, and it is the smallest.

---

## 4. A bug that produced a publishable-looking result, and how it was caught

The first run of `compare_sampling.mjs` reported active4 at 100% endpoint hit and
conventional protocols at **0%**, and I nearly reported it as a decisive win for
active design.

It was an artefact. `estimateFromSamples` returned `NaN` for any sample drawn
*intradialytic* (0 < t ≤ 240), because the prediction function read only the
rebound track. The conventional protocol draws at t=120 and t=240, so its objective
was `Infinity` everywhere and the estimator returned garbage. The active design
happened to escape because the sensitivity landscape steers it to pre-dialysis and
rebound times — so the bug punished exactly the baseline and flattered exactly the
method under test.

Fixed by giving the estimator the intradialytic track as well. After the fix,
conventional protocols move from 0.186 to 0.012 and active's advantage narrows from
"infinitely better" to 2× — still significant, but no longer a fiction.

**Lesson recorded:** a baseline failing catastrophically is a bug signal before it
is a result, particularly when the method under test structurally avoids the code
path that fails.

---

## 5. What did not work, and what I did not do

1. **The model over-predicts rebound** (29.9% vs ~21.5% implied by the published
   correction), with a systematic session-length trend. Unresolved and recorded.
2. **No ultrafiltration.** Real sessions remove 2–3 L; the model removes none. This
   changes both the concentration profile and the rebound.
3. **No access or cardiopulmonary recirculation**, so effective clearance is
   optimistic.
4. **The wall was hit.** No per-patient validation is possible from open sources.
   The model has never been confronted with a real patient's BUN trajectory. Its
   agreement with the rate equation is a cross-check between two models, not
   evidence about a person.
5. **Assay noise SD (2%) is unsourced**, like stage 4's 3%. Tested at 1% and 4%.
6. **I did not build a language-model-in-the-loop session** for this stage, for the
   same reason as stage 4: with a one-dimensional sensitivity rule a model would
   re-derive the algorithm rather than add information.

---

## 6. Decisions needed from you

| # | Decision | If you do nothing |
| --- | --- | --- |
| 1 | **Ratify the 2% BUN assay SD** (the one unsourced input). | Absolute errors scale with it; the ordering of protocols does not (tested 1–4%). |
| 2 | **Is the 29.9%-vs-21.5% rebound discrepancy worth chasing?** Chasing it means either rejecting the HEMO `Kc` value or fitting to the rate equation — the latter would make the cross-check circular. | The model's absolute rebound and the 0.05 endpoint stay optimistic by ~0.1 Kt/V. |
| 3 | **Add ultrafiltration?** It is the largest missing physiology and is well documented. | Rebound and dose remain slightly mis-specified; the design conclusions are unaffected. |
| 4 | **Fund or author the study in §6 of the README** (four draws, ~30 patients). | The wall stays where it is. Every parameter in this stage remains a population mean, and the protocol recommendation stays untested in humans. This is the only decision here that changes what is knowable. |

---

## 7. Reproduction

```sh
# validation against the verified HEMO source values (public; in the repo)
node <repo>/dialysis_session/tools/validate_session_model.mjs

# the sampling-design comparison -- the stage endpoint
node compare_sampling.mjs 200 0.02
node compare_sampling.mjs 100 0.01
node compare_sampling.mjs 100 0.04

# ultrafiltration diagnostic (public; in the repo)
node <repo>/dialysis_session/tools/ultrafiltration_test.mjs

# study design calculation (public; in the repo)
node <repo>/dialysis_session/tools/study_design.mjs
```

All runs are deterministic given the seed.

---
---

# PART II OF STAGE 5 — ultrafiltration, and making the protocol executable

Two decisions were delegated to me: whether ultrafiltration is the cheapest next
correction toward real physiology, and how executable the study protocol actually
is. Both are answered below, including a negative result.

## 8. Ultrafiltration — done, as a bounded falsifiable test

**My decision rule, stated before running it.** Ultrafiltration is worth adding
only if it *tests* something. It is a prescribed, recorded quantity in every real
session, not a free parameter, so adding it is a physical correction rather than a
fit — but it is still work behind the wall unless it discriminates between
competing explanations. It does: the stage-5 ledger left two candidates for the
rebound over-prediction, and this distinguishes them.

### D27 — Implement ultrafiltration mass-based

**Decision.** Replace concentration-based integration with mass-based
integration, with the proximal volume shrinking at the ultrafiltration rate.

**Rationale.** A concentration ODE with a shrinking volume needs a `dV/dt`
correction term, and in the two-pool system that term cancels against the
convective removal in a way that makes it easy to double-count or silently drop
the convective clearance. Integrating mass removes the ambiguity: masM leaving is
`CL·C1 + Quf·C1`, and the proximal volume is a separate, explicit state.

**Regression.** `uf = 0` reproduces stage 5 exactly — 57.1 mg/dL, 29.9% rebound,
spKt/V 1.539, eKt/V 1.277. The reimplementation is verified against the numbers it
replaces.

### D28 — Result: a negative finding, recorded as such

| ultrafiltration | convective clearance | rebound | model gap | published gap |
| --- | --- | --- | --- | --- |
| 0 L | 0 mL/min | 29.9% | 0.262 | 0.201 |
| 1 L | 4.2 mL/min | 31.7% | 0.275 | 0.201 |
| 2.5 L (realistic) | 10.4 mL/min | 34.6% | 0.297 | 0.201 |
| 4 L | 16.7 mL/min | 37.9% | 0.321 | 0.201 |

Worst model-vs-formula disagreement rises from 0.098 (no ultrafiltration) to
0.135 (2.5 L). **Ultrafiltration widens the gap rather than closing it.**

The mechanism is not mysterious: convective clearance removes more solute, which
leaves a *larger* proximal/distal disequilibrium for the rebound to undo. Adding
real physics moved the model away from the empirical correction, not toward it.

**So ultrafiltration was not the missing explanation.** This is a genuine
elimination, and it is worth more than the correction would have been: it converts
"the model over-predicts rebound for some reason" into a single named suspect.

### D29 — Localisation, reported as a discrepancy and not as a fit

With ultrafiltration eliminated, the exchange parameter is the remaining candidate.
Sweeping it:

| Kc multiple | model gap | rebound |
| --- | --- | --- |
| **16×V (HEMO's value, used unchanged)** | 0.262 | 29.9% |
| 20×V | 0.227 | 25.4% |
| **24×V** | **0.203** | **22.5%** |
| 32×V | 0.173 | 18.9% |
| 64×V | 0.129 | 13.8% |

The model reproduces the published correction at **Kc ≈ 24×V**; HEMO's urea value
is **16×V**, about 1.5× lower.

**This is deliberately NOT applied as a correction.** Fitting Kc to the very
equation used as the cross-check would make the check circular, which the user
identified independently. It is reported as a discrepancy measure, and it becomes
a falsifiable prediction (protocol §8, P4): an independent measurement of urea
intercompartmental clearance in dialysis patients should land nearer 24×V than
16×V.

Note this also means the sampling benchmark's three true Kc values (10×, 16×, 24×V)
already bracket the disputed range, so the stage-5 design conclusions do not depend
on which value is right.

## 9. Protocol executability — the user's question, answered

`dialysis_session/PROTOCOL.md` was written to answer it. The short version:

**Complete and reproducible from this repository:** the pre-specified estimand, the
analysis plan, the estimator (validated against a clinical measurement to 0.8%),
the sampling design benchmarked against three alternatives, the sample-size
calculation with its assumption exposed, the data-collection specification, and the
exact analysis code.

**Not doable by an autonomous agent, and therefore not done:** ethics/IRB approval,
informed consent, a named principal investigator, funding for coordinator and assay
time, data-protection sign-off, and trial registration.

**The honest answer to "is it complete?":** it is complete enough to hand to a
clinical collaborator and have them run it, and *not* complete enough to run
without one. The boundary is one of authority, not of knowledge. Estimated path to
first patient: **3–6 months**, dominated by ethics review and finding a PI.

### Sample size, computed rather than asserted

| Quantity | Value |
| --- | --- |
| Between-patient SD of the standard-of-care error | **0.109 Kt/V** (model, at an assumed 35% CV in Kc) |
| Model-predicted P(\|error\| > 0.05) | 57.6–74.6% across Kc CV 0–50% |
| n for mean error to ±0.05 | **≈ 19 sessions** |
| n for the paired protocol-vs-rate-equation test | **≈ 9 sessions** (expected effect, 80% power) |
| If the true SD is 0.20 rather than 0.11 | **n rises to 62** |

**D30 — the SD in that calculation is itself a model output.** The protocol
therefore targets 20 sessions, treats the SD as a primary descriptive result, and
pre-specifies an extension to 60 if the observed SD exceeds 0.18. Presenting a
single n would have been false precision.

## 10. Was this stage spinning or advancing?

The user asked for this to be said plainly if the answer is "spinning".

- **Ultrafiltration: advancing, narrowly.** It was worth doing only because it
  could eliminate an explanation, and it did. Had it merely made the model "more
  physical" without changing any conclusion, it would have been spinning, and I
  would have recorded that instead. The `uf = 0` regression mattered here: without
  it I could not have claimed the comparison was clean.
- **The protocol: advancing, and it is the only part of this project that can
  change what is knowable.** Everything else — every stage so far — produces
  internally consistent simulation. This produces a document a clinician could act
  on, with its own falsification conditions.
- **What is still spinning by construction:** any further modelling accuracy work
  behind the wall. The model is now good enough that its remaining errors are
  smaller than the between-patient variability the study would measure. Further
  refinement cannot be checked, and I should stop.

## 11. Decisions now needed

| # | Decision | If you do nothing |
| --- | --- | --- |
| 1 | **Find a PI or decide the study is out of scope.** This is the binding constraint on the entire project. | Everything stays simulation. Stages 1–5 remain a validated modelling package; the protocol stays an unexecuted document. |
| 2 | Ratify the study-design assumptions (Kc CV 35%, target n=20, extension rule at SD>0.18). | The sample size stays conditional on my assumptions rather than yours. |
| 3 | Decide whether **P4** (urea Kc nearer 24×V than 16×V) should be the primary endpoint rather than a secondary one. | The study would answer an engineering question (is the four-draw protocol accurate) rather than the open scientific one (is the exchange parameter wrong). My view: P4 should be primary. |
| 4 | Approve or reject the ultrafiltration change to `patient_dialyzer.mjs`. | The model keeps UF support it does not use by default; `uf = 0` behaviour is unchanged and regression-tested. |
