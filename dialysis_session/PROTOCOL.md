# PROTOCOL — Equilibrated Kt/V from four blood draws

**Status: draft for site adoption. NOT reviewed by any ethics committee, NOT run.**
Version 0.1 · prepared by an autonomous modelling agent · no institutional sponsor

This document exists because every parameter in stages 1–5 is a population mean
from published literature. The model has never been confronted with a real
patient's measured BUN trajectory. This is the study that would do it, and it is
the only artefact in this project that can change what is knowable.

---

## 1. Objective and hypothesis

Measure the **equilibrated** dialysis dose and quantify the error made by the
current standard of care, which estimates it from an immediate post-dialysis
sample.

**Primary hypothesis (H1).** Single-pool Kt/V corrected by the Daugirdas rate
equation still misestimates equilibrated Kt/V by more than 0.05 Kt/V units in a
substantial fraction of sessions.

**Secondary hypothesis (H2).** That residual error is predicted by the patient's
urea intercompartmental clearance: slow-exchange patients show larger residuals.

H2 is the mechanism claim and the reason the study is worth running.

## 2. Design

Prospective, single-arm, paired **within-session** observational study. Each
session contributes both the standard-of-care estimate and the reference estimate,
so the primary comparison is paired and needs far fewer sessions than a
between-patient design.

## 3. Population

**Inclusion.** Adults (≥18 y) on maintenance intermittent haemodialysis, ≥3
sessions/week for ≥3 months, with a functioning arteriovenous access.

**Exclusion.** Single-needle or catheter-only access; known access recirculation;
session shortened below 3 h or extended beyond 5 h; active hospitalisation; planned
dialyzer change during the study window.

**Target:** ≥20 sessions from ≥20 patients (see §7), at ≥2 sites if available.

## 4. Sampling protocol

Four blood draws per session. The **pre-dialysis draw is free** — the needle is
already in — so only three are additional.

| Draw | Time | Purpose |
| --- | --- | --- |
| 1 | immediately before dialysis (from the access) | baseline |
| 2 | 120 min into the session | constrains the intradialytic profile |
| 3 | immediately at end of session (standard method) | gives single-pool Kt/V |
| 4 | **30 min after end of session** | **the rebound sample — the one that matters** |

Draw 4 is the whole point: without it the rebound is invisible, and the model
predicts the standard-of-care error is then ~0.28 Kt/V units.

**Also record per session:** dialyzer model and surface area; blood flow Qb;
dialysate flow Qd; session length; ultrafiltration volume; pre- and post-session
weight; access type; whether the 30 min sample was drawn from the access or a
peripheral vein.

Sampling times must be recorded to the nearest minute, not to the protocol
nominal, because the analysis uses the actual times.

## 5. Assays

BUN by the site's routine clinical analyser. No additional assay development is
required. Assay CV should be recorded; the design assumes 1–4%.

## 6. Analysis plan (pre-specified)

1. **Primary estimand:** the difference
   `Δ = eKt/V(from the rate equation) − eKt/V(from the four draws)`,
   computed per session, analysed as a paired difference.
2. **Reference estimate:** fit the two-pool model (`patient_dialyzer.mjs`) to the
   four measured BUN values with the intercompartmental clearance Kc as the only
   free parameter, holding V from anthropometry and the dialyzer clearance from
   `dialyzer_model.mjs`; read off eKt/V. This is exactly the estimator validated in
   stage 5, and it is already implemented and reproducible.
3. **Primary test:** one-sample test of the mean Δ against 0, with a two-sided 95%
   CI. Report the fraction of sessions with |Δ| > 0.05.
4. **H2 test:** regress Δ on the fitted Kc. Report the slope and its CI.
5. **Reported for the record:** the fitted Kc distribution, expressed as a multiple
   of V, against the currently used urea value of **16×V**.

Nothing here is chosen after seeing the data.

## 7. Sample size

Computed from the model; both components are reported so the assumption is visible.

| Quantity | Value | Source |
| --- | --- | --- |
| Between-patient SD of Δ | **0.109 Kt/V** | model, at an assumed 35% CV in Kc |
| Model-predicted mean \|Δ\| | 0.067–0.130 | across Kc CV 0–50% |
| Model-predicted P(\|Δ\|>0.05) | 58–75% | across the same range |
| **n for mean Δ to ±0.05** | **≈ 19 sessions** | `n = (1.96·SD/0.05)²` |
| **n for the paired protocol-vs-rate-equation comparison** | **≈ 9 sessions** (expected effect) | 80% power, α=0.05 |

**The honest caveat:** that SD is *itself* a model output. The true between-patient
SD is one of the things the study measures. If it is 0.20 rather than 0.11, n rises
from 19 to 62. The protocol therefore **targets 20 sessions and treats the SD as a
primary descriptive result**, with a pre-specified option to extend to 60 if the
observed SD exceeds 0.18.

## 8. Falsifiable predictions

The study is worth running only if it can fail. It can, on all four:

- **P1.** P(\|Δ\| > 0.05) ≥ 40%. *Falsified if the residual is near zero.*
- **P2.** Δ increases with the fitted equilibration time constant (slower exchange →
  larger residual). *Falsified if Δ is unrelated to Kc.*
- **P3.** The four-draw estimate is within 0.05 of a 60 min equilibrated reference in
  ≥95% of sessions. *Falsified if the 30 min draw is insufficient.*
- **P4.** Fitted urea Kc sits nearer **24×V** than the **16×V** currently used.
  *This is the sharpest claim in the project and the one that settles the open
  discrepancy. Falsified if Kc lands at 16×V or below.*

P4 is the reason to run this rather than more modelling.

## 9. Resources required

| Item | Estimate | Notes |
| --- | --- | --- |
| Sessions | 20 (extendable to 60) | ~1 week at one busy unit, if eligible patients consent |
| Additional blood draws | 2 per session (draws 2 and 4) | ~1–2 mL each; draw 4 requires the patient to remain 30 min |
| Assays | 4 per session = 80 | routine analyser, marginal cost |
| Nursing time | ~40 min extra per session | the 30 min wait is the dominant cost |
| Coordinator | ~0.1 FTE for 4–8 weeks | consent, data entry, protocol compliance |
| Statistical effort | days | the analysis code is already written and reproducible |
| Equipment | none | uses the site's existing machines, dialyzers and analyser |
| Funding | not costed here | assay + coordinator time; no new hardware |

## 10. Approvals and governance

**This is human-subjects research and cannot proceed without approvals.** Draw 4
is genuinely additional to routine care at most units, so it requires consent even
though the risk is a single extra venepuncture.

Required, in order:

1. **Institutional review board / research ethics committee** at each site.
   Expect an observational minimal-risk category, likely expedited, but the
   requirement is real and site-specific.
2. **Informed consent** from each participant, including for the 30 min wait.
3. **Local research governance** — R&D approval, data protection (GDPR Art. 9
   health data in the EU/UK; HIPAA and IRB in the US), Caldicott principles in
   the UK.
4. **A named principal investigator** with a clinical contract at each site. This
   is the binding constraint: no PI, no study.
5. **Data management plan.** Only de-identified session-level numbers are needed —
   no patient identifiers, no images, no genetic data. Pseudonymised site codes
   suffice.
6. **Registration** — clinicaltrials.gov or equivalent, even for observational work,
   plus a pre-specified statistical analysis plan deposited before unblinding.

**Estimated path to first patient:** 3–6 months, dominated by ethics review and
identifying a PI.

## 11. Is this protocol complete as a transferable output?

Direct answer: **it is complete enough to hand to a clinical collaborator and have
them run it, and it is not complete enough to run without one.** The modelling and
statistical work is done; the human and regulatory work cannot be done by me.

**Done, and reproducible from this repository:**

- pre-specified estimand, analysis plan and falsifiable predictions
- the estimator, validated against a clinical measurement to 0.8%
- the sampling design, chosen by the same method and benchmarked against three
  alternatives
- sample-size calculation with its assumption exposed and a pre-specified
  extension rule
- the data-collection specification
- the exact code that would analyse the data

**Not done, and not doable by an autonomous agent:**

| Missing | Who must supply it |
| --- | --- |
| Ethics/IRB approval | the site and a PI |
| Informed consent materials | the site, from a template |
| A principal investigator | a clinician with a contract at the site |
| Funding for coordinator time and assays | the site or a funder |
| Data protection sign-off | the site's governance office |
| Clinicaltrials.gov registration | the PI |
| Assurance that the 30 min draw is acceptable to patients | a pilot, or site judgement |

**Therefore:** the transferable output is a *reviewable protocol plus a validated
analysis pipeline*, not a runnable study. That is the honest boundary, and it is a
boundary of authority rather than of knowledge.

## 12. Known limitations, to be carried into any write-up

1. The model **over-predicts rebound** when compared with the published empirical
   correction. Ultrafiltration was added and made this *worse*, eliminating the
   missing-physics explanation; the discrepancy localises to the exchange
   parameter. The study is designed to test exactly that.
2. No access or cardiopulmonary recirculation is modelled, so effective clearance
   is optimistic.
3. The two-pool structure holds V fixed between sessions; a single session is
   analysed at a time, so this is not exercised.
4. Urea only. No middle molecules, so nothing here speaks to β2-microglobulin or
   dialysis-related amyloidosis.
