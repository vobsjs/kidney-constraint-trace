# HANDOVER

For a clinical collaborator, research coordinator, or PI considering this package.

## The direct answer

**The package is complete as a *reviewable protocol plus a validated analysis
pipeline*. It is not complete as a *runnable study*, and the missing parts are not
things an autonomous agent can supply.**

Concretely: everything that can be computed or written has been. What is missing is
authority and access — a named principal investigator, ethics approval, consent,
funding for coordinator and assay time, data-protection sign-off, and trial
registration. **Nothing in the missing list is a knowledge gap.** It is not
"we need more modelling"; it is "we need a clinician and a committee".

## 1. Your first 30 minutes

Run these three commands. They take under a minute in total and check the two
claims the whole package rests on.

```sh
# 1. Does the device model reproduce real manufacturer bench data?
node dialyzer/tools/validate_against_manufacturers.mjs
#    expect: worst |diff| = 0.89%

# 2. Does that same in-vitro model reproduce a clinical measurement?
node dialysis_session/tools/validate_session_model.mjs
#    expect: CHECK 1 closest 230.3 mL/min vs HEMO's measured 230 (0.1%)

# 3. Does the whole repository reproduce?
node tools/verify_all.mjs
```

If those pass, the model is doing what is claimed. If any fail, stop and tell me —
everything downstream depends on them.

## 2. What you are being asked to consider running

A prospective, single-arm, **paired within-session** observational study:

- **Population:** maintenance haemodialysis patients, ≥3 months on treatment.
- **Intervention:** none. **Four blood draws** per session instead of the usual
  two.
- **Sessions needed:** ~20 (see `PROTOCOL.md` §7; extendable to 60).
- **The point:** whether the current standard-of-care estimate of dialysis dose
  misses by a clinically meaningful amount, and whether the miss is explained by
  the patient's urea equilibration rate.
- **Cost:** assays and roughly 40 minutes of nursing time per session. No hardware,
  no drug, no change to treatment.

Full detail: [`dialysis_session/PROTOCOL.md`](./dialysis_session/PROTOCOL.md).

## 3. What is missing, and who must supply it

| Missing | Who | Why it blocks |
| --- | --- | --- |
| **A principal investigator** | a clinician with a contract at a site | **The binding constraint.** No PI, no submission, no study. |
| Ethics / IRB approval | the site and the PI | Draw 4 is additional to routine care, so this is human-subjects research even though the risk is one extra venepuncture. |
| Informed consent | the site | Required for the extra draw and the 30 min wait. |
| Funding | the site or a funder | Coordinator time (est. 0.1 FTE for 4–8 weeks) plus 80 assays. |
| Data-protection sign-off | the site's governance office | Only de-identified session-level numbers are needed — no identifiers, no images. |
| Trial registration | the PI | Even observational work should be registered with a pre-specified analysis plan. |
| Assurance patients will accept a 30 min wait | a pilot, or site judgement | The single biggest practical risk to accrual. |

**Estimated path to first patient: 3–6 months**, dominated by ethics review and
identifying a PI.

## 4. The decision records — please read

Each stage has a detailed ledger recording every design decision, its rationale,
what failed, and what was assumed. **All three are in this package.**

| Ledger | Covers |
| --- | --- |
| [`dialysis_session/LEDGER.md`](./dialysis_session/LEDGER.md) | **stage 5 — the clinical stage.** The patient model, the post-dialysis rebound result, a bug that produced a publishable-looking false positive and how it was caught, the ultrafiltration negative result, the study-design calculation, and every assumption. **Start here if you read only one.** |
| [`dialyzer/LEDGER.md`](./dialyzer/LEDGER.md) | stage 4 — the device model, its validation against 120 manufacturer measurements, and the elasticity landscape that makes operating-point choice matter |
| [`PK_LEDGER.md`](./PK_LEDGER.md) | stages 1–3 — the original pharmacokinetic benchmark, including the negative result that active design cannot beat a good fixed lattice for that problem |

These were originally held **outside** the repository, because the repository was
also a sealed benchmark against an autonomous agent that must not be able to read
the answers. **That seal has been retired and the records moved in**, on the
grounds that the evaluation phase is over and a decision record belongs with the
work it documents.

One consequence is stated plainly rather than buried: publishing `PK_LEDGER.md`
discloses the stages 1–3 benchmark's true parameter values and noise seed, so
**those stages are retired as a sealed evaluation.** They remain valid as a
methodological record, and nothing in the clinical chain (stages 4–5) depends on
that seal — the device and patient stages never had one, because their parameters
come from public data and explicit assumptions.

## 5. What is validated, and what is not

Read [`PROVENANCE.md`](./PROVENANCE.md) §4 for the full list. The short version:

**Validated against independent real measurement**

- the device model, against 120 published EN ISO 8637-1:2020 clearances;
- the same model against a clinical cross-dialyzer clearance (230 mL/min, to 0.1%);
- the comparator rate equation, against the HEMO manual's own worked example.

**Not validated**

- **The model has never seen a real patient.** Every physiological parameter is a
  population mean from one published paper. This is the central limitation and it
  is why the study exists.
- No dialyzer has been measured by us; all device validation is against published
  data.
- One known discrepancy is unresolved: the model over-predicts rebound versus the
  published correction, ultrafiltration was tested as the explanation and
  **eliminated**, and the residual localises to the exchange parameter
  (`Kc ≈ 24×V` versus HEMO's `16×V`). The protocol is designed to settle it.

## 6. What this package is not

- **not a clinical tool** — no regulatory clearance, no validation in patients;
- **not for individual patient care** — it is a research protocol and a model;
- **not reviewed** — no ethics committee or clinician has seen it;
- **not dependency-free of judgement** — the two noise SDs and the sample-size
  assumptions are modelling choices, exposed and sensitivity-tested, not facts.

## 7. If you disagree with the model

That is the expected and useful response. The package is built so that disagreement
is checkable:

- every constant is listed with its source and verification status
  ([`PROVENANCE.md`](./PROVENANCE.md));
- every tool prints its own checks and can be run independently;
- the analysis estimator is in the repository
  ([`dialysis_session/estimator.mjs`](./dialysis_session/estimator.mjs)) and
  self-tests;
- the study's four falsifiable predictions are pre-specified
  ([`PROTOCOL.md`](./PROTOCOL.md) §8).

If you think a parameter is wrong, the fastest way to show it is to change it and
re-run `node tools/verify_all.mjs`.
