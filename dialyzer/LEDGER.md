# LEDGER — STAGE 4: the artificial kidney

**Decision record. Formerly held outside the repository under a seal; now part of
the delivered package.**

The benchmark "truth" values in this document are either derived from public
manufacturer data (the `KoA` scenarios) or are explicit modelling assumptions, so
publishing them compromises nothing beyond the benchmark's own secrecy — which is
itself retired along with the rest of the sealed material. The instruction below to
keep this document outside the repository applied while it was a sealed benchmark
and has been superseded.

Repository: `<repo>`
Companion specification: [`README.md`](./README.md)

This stage is additive. The sealed-holdout structure and external-check mechanism
established in stages 2–3 are untouched, and the accepted pharmacokinetic benchmark
is unmodified. Stage 4 mirrors that structure for a new physical system.

---

## 0. The stage-start question, answered first

**Is this output specific to the existing PK benchmark, or transferable?**

**Transferable, and the previous stages were not.** The pharmacokinetic benchmark
is about one drug (gentamicin) in one population (critically ill adults) with a
CrCl-linear clearance model. Its parameters mean nothing outside that drug. This
stage models the **device**, whose entire diffusive behaviour is one parameter,
`KoA`, and whose governing equation contains no drug at all.

Where it transfers:

- **solute**: demonstrated below across 60 Da to 16 700 Da, with only `KoA` moving.
- **device**: demonstrated across 9 dialyzers from 2 independent manufacturers.
- **modality**: HDF adds a convective term with a sieving coefficient (the sieving
  coefficients are in the same source tables); peritoneal dialysis replaces `KoA`
  with a peritoneal mass-transfer-area coefficient in the same three-pore
  formalism; continuous RRT is the same equation at different flows.
- **clinical dose**: `Kt/V = CL·t/V`, so `KoA` error propagates directly into
  prescribed dialysis dose — the quantity that the HEMO trial tied to mortality.

How to migrate: nothing about the estimator or the design rule refers to a
membrane, a solute or a flow range. Swapping `KoA` for any other single
mass-transfer coefficient and the grid for that modality's operating envelope
carries the whole stage across unchanged. That is why this direction was chosen
over another round of PK refinement.

---

## 1. Decisions and rationale

### D16 — Direction: model the device, not the patient

**Decision.** The next stage models a haemodialyzer as a counter-current
mass-transfer device, rather than extending the drug-disposition model.

**Rationale.** The brief asks for each step to move toward a real biological
system and toward real experiments. A dialyzer is a *physical object* whose
performance is measured on a bench under a published standard; the PK model's
parameters are population statistics that cannot be measured on any single
apparatus. Moving from "a parameter of a population" to "a parameter of a device"
is the step that makes real bench work possible at all.

**Rejected alternative.** Extending to urea kinetics in a dialysis patient
(the clinical `Kt/V` model). Rejected for this stage because it needs per-patient
urea-time data that I could not verify openly — the same wall that stopped stage 1
— whereas dialyzer clearance data is published, standardised and abundant. The
patient link is retained as the *downstream propagation* (§4) rather than the
estimand.

### D17 — The observable is clearance, not concentration

**Decision.** The measurement an experiment buys is a clearance in mL/min, not a
concentration.

**Rationale.** Clearance is what EN ISO 8637-1:2020 specifies and what
manufacturers publish, so the benchmark's observable is exactly the number a real
bench produces. It also removes time from the problem entirely: a dialyzer
characterisation has no sampling schedule, only operating points. That is a real
simplification relative to the PK stage, not a cosmetic one.

### D18 — Grounding in real data, from two manufacturers

**Decision.** Transcribe and use 120 published in-vitro clearance values from
Asahi Kasei APS-HE and Nipro ELISIO HX.

**Rationale.** A model validated only against its own source is not validated.
Two independent manufacturers, nine devices and six solutes give a genuine test —
including the possibility that the model *fails*, which it partly does (§3, Q2).

### D19 — Measurement noise: proportional, SD 3%, and flagged

**Decision.** Measurement error is proportional with SD 3%.

**Rationale.** Clearance is computed from a concentration ratio, so the dominant
errors (assay precision, flow accuracy) scale with the clearance. 3% is bounded by
the ISO 8637-1 acceptance band of ±10% and by the 0.06–0.89% round-trip
disagreement between the manufacturer's own published `KoA` and its own labelled
clearance.

**This is the one input I could not source as a published figure, so it is treated
as a decision needing ratification, not a fact.** The conclusion is tested at
1.5%, 3% and 6% (§5) and holds at all three.

### D20 — Budget of 8

**Decision.** 8 measurements.

**Rationale.** The reference manufacturer tables report 2–3 blood flows per
device. Eight is a realistic bench session: enough to be useful, few enough that
where the budget goes visibly matters. It is also small enough that a naive design
cannot simply cover the grid (24 points).

---

## 2. Validation against real data — Q1 forward

Does the published `KoA` reproduce the published urea clearance?

| device | Qb | labelled | model | diff |
| --- | --- | --- | --- | --- |
| APS-18HE | 200 | 198 | 197.86 | −0.07% |
| APS-18HE | 300 | 278 | 277.78 | −0.08% |
| APS-22HE | 200 | 199 | 198.88 | −0.06% |
| APS-22HE | 300 | 284 | 283.77 | −0.08% |
| APS-26HE | 200 | 200 | 199.72 | −0.14% |
| APS-26HE | 300 | 289 | 291.56 | **+0.89%** |

Worst error 0.89%, typically below 0.15%. The physics is right, and the published
`KoA` values are the correct model truth for those devices.

## 3. Where the model is imperfect — Q2 inverse

`KoA` derived independently from each blood flow should agree. Over 43
device-solute pairs with at least two usable flows, the **median cross-flow spread
is 4.48%**, and 19 pairs exceed 5%.

**My first explanation was wrong.** I hypothesised that the disagreement is
ill-conditioning, i.e. measurements taken where clearance is already at the flow
ceiling carry no `KoA` information. Testing it: low-saturation pairs give a median
spread of 4.16% and near-ceiling pairs 5.09%. That is the right direction but far
too weak to be the explanation — and almost every pair sits above 85% saturation,
so the comparison has little contrast.

**What the data actually shows** is a *systematic* drift: derived `KoA` rises with
blood flow (ELISIO urea: 873 → 888 → 901; 1065 → 1064 → 1084; 1233 → 1265 → 1279;
1367 → 1450 → 1475). This is consistent with the published HEMO finding that
apparent urea `KoA` is not constant but increases with flow. **So the constant-KoA
model carries a real few-percent systematic error across blood flows, and this
benchmark inherits it.** It is recorded as a limitation, not smoothed over.

## 4. Transfer — Q3, 60 Da to 16 700 Da

| solute | MW (Da) | devices | mean KoA (mL/min) |
| --- | --- | --- | --- |
| urea | 60 | 8 | 1394.6 |
| phosphate | 96 | 9 | 845.6 |
| creatinine | 113 | 8 | 1089.4 |
| vitamin B12 | 1355 | 9 | 388.3 |
| inulin | 5000 | 3 | 199.5 |
| myoglobin | 16700 | 6 | 151.1 |

`KoA` falls monotonically with molecular size, as membrane sieving requires. One
model, one parameter, a 280-fold range of molecular weight, no change to the
estimator or the design rule.

## 5. The endpoint

**Endpoint: recover the dialyzer's `KoA` to within ±10% from 8 bench clearance
measurements.**

**Why this number is worth pursuing, argued rather than asserted.**

1. `KoA` is the entire diffusive characterisation of the device. There is no
   second parameter to fall back on.
2. It is the quantity manufacturers publish and regulators accept (ISO 8637-1),
   so ±10% is not an arbitrary target — it is the same order as the standard's own
   acceptance band for labelled clearance.
3. It propagates to the clinic without attenuation: `Kt/V = CL·t/V`, and the HEMO
   trial established that delivered dose, not prescription, drives outcome. A
   device whose `KoA` is mischaracterised by 10% is a device whose dose is
   mischaracterised by a comparable amount at the flows where it matters.
4. It is achievable but not free: random sampling reaches it only 91.7% of the
   time, so the 8-measurement budget genuinely binds.

**Result — 200 seeds × 5 true `KoA` (real device-solute values, a ~7.7-fold span)
× 4 designs × 8 measurements, paired on the same noise realisation:**

| design | median error | mean error | within 10% | within 5% |
| --- | --- | --- | --- | --- |
| random8 | 2.78% | 4.03% | 91.2% | 70.9% |
| uniform8 | 2.36% | 3.28% | 95.4% | 78.3% |
| **active8** | **1.81%** | **2.71%** | **96.9%** | **85.1%** |
| oracle8 (at the truth) | 1.82% | 2.71% | 96.7% | 84.9% |

| comparison | difference | t | p |
| --- | --- | --- | --- |
| active8 vs uniform8 | **17.4% lower** | −6.49 | **8.7e-11** |
| active8 vs random8 | **32.9% lower** | −11.1 | < 1e-300 |
| active8 vs oracle8 | 0.3% lower | −0.61 | 0.55 |

**The active rule matches the oracle.** Verified, not assumed:
`verify_active_is_adaptive.mjs` shows it opens at 400/800 where the oracle would
open at 400/500 — a different path — yet converges on the same eight points, in
every scenario, starting from a prior of `KoA = 1000` that is wrong by 30–560%.

**This reverses the stage-3 finding.** There, greedy D-optimality saturated and
could not beat a uniform lattice. Here it beats one significantly (17%, p=4e-10),
because the elasticity landscape spans 33× instead of saturating after three
points. The difference is a property of the problem, and it is why the stage-3
negative result was worth recording rather than generalising.

## 6. Noise sensitivity — the one unsourced parameter

| σ | active mean error | uniform mean error | advantage | endpoint active / uniform |
| --- | --- | --- | --- | --- |
| 1.5% | 1.32% | 1.72% | 23.3% lower | 100.0% / 99.8% |
| **3.0%** | **2.71%** | **3.28%** | **17.4% lower** | **96.9% / 95.4%** |
| 6.0% | 5.42% | 6.91% | 21.6% lower | 84.8% / 76.4% |

The active advantage is 17–23% across the whole plausible range, and the endpoint
advantage *grows* with noise (+8.4 points at 6%). The conclusion does not rest on
the unsourced 3%.

### D21 — Relocating the truth scenarios off the published population means

**Decision.** Three of the five true `KoA` values were moved to different real
device-solute values after an audit found they exactly equalled population means
printed in `dialyzer/README.md` (phosphate 846, vitamin B12 388, myoglobin 151).

**Rationale.** Printing the population mean and then using it as the sealed truth
is a self-inflicted leak. The replacement values (971, 457, 185) are the derived
`KoA` of ELISIO 19HX for the same solutes — equally real, not printed.

**Honest scope of this seal.** It remains weak by design: any of these values can
be re-derived from the public manufacturer tables, and a real experimenter would
indeed know a dialyzer's `KoA` to within a factor. What is actually sealed is the
noise realisation and which scenario is active. This is recorded rather than
presented as a strong secrecy claim.

---

## 7. What did not work, and what I did not do

1. **My first explanation of the inverse-problem spread was wrong.** I predicted
   ill-conditioning at the flow ceiling would explain it; the measured effect was
   4.16% vs 5.09%, far too weak. The real cause is a systematic flow-dependent
   drift in apparent `KoA`, consistent with the published HEMO result. The
   constant-`KoA` model has a few-percent systematic error that this benchmark
   inherits and does not fix.
2. **No Qd variation in the reference data.** Every manufacturer table I could
   retrieve is at Qd = 500 mL/min. The model is therefore *validated* at one
   dialysate flow and *used* at four. The grid's Qd = 200/300/800 points rest on
   the physics, not on measurements I verified. This is the largest gap in the
   stage.
3. **The clinical link is a propagation, not a validation.** I can show `KoA`
   error flows into `Kt/V` arithmetic; I have not shown it against measured
   delivered dose in patients, which would need per-patient data I could not
   verify.
4. **I did not build the interactive language-model session** that stage 3 had.
   The design rule here is a one-line rule (maximise the elasticity), so a model
   choosing points by reasoning would be re-deriving it; the honest demonstration
   is the algorithmic comparison, which is stronger statistically.
5. **No real bench run.** Everything here is validated against published bench
   data, not against a dialyzer I measured.

## 8. Decisions needed from you

| # | Decision | If you do nothing |
| --- | --- | --- |
| 1 | **Ratify or replace the 3% measurement-noise SD.** It is the one input not grounded in a published figure. | The endpoint numbers (96.9% within 10%) rest on my estimate. The ordering of designs does not — it holds at 1.5%, 3% and 6% — but the absolute hit rate does. |
| 2 | **Accept Qd extrapolation, or fund an ISO 8637 Qd sweep.** All verified data is at Qd = 500. | Three of the four dialysate flows in the grid stay unvalidated. The grid could be restricted to Qd = 500, at the cost of losing the low-Qd blind region that makes the design problem interesting. |
| 3 | **Decide whether the constant-KoA systematic error is in scope.** It is measured (few percent, flow-dependent) but not modelled. | The benchmark's precision claims stay a few percent optimistic, and the HEMO-consistent drift is documented but unaddressed. |
| 4 | **Decide the next direction.** Options: (a) add the convective/HDF term with sieving coefficients, already in the source tables; (b) move to peritoneal dialysis, same formalism, different transport coefficients; (c) couple the device to a patient compartment model to close the loop to clinical dose. | Work stops at a validated device benchmark with a demonstrated design advantage and an open clinical link. |

## 9. Reproduction

```sh
# validation against real manufacturer data (public; in the repo)
node <repo>/dialyzer/tools/validate_against_manufacturers.mjs

# the design comparison -- the stage endpoint
node compare_designs.mjs 200 0.03
node compare_designs.mjs 200 0.015
node compare_designs.mjs 200 0.06

# proof the active design is adaptive and not the oracle
node verify_active_is_adaptive.mjs
```

All runs are deterministic given the seed.
