
---

# STAGE 8 — ADDENDUM: the charcoal pool, and patient variability

## 0. The transfer question, answered BEFORE the work

> *Is this moving toward a real biological system and toward replacing renal
> function, or spinning in pool-parameter details? If it only makes the lifetime
> number more precise without changing the nature of the constraint, say so.*

**Bounding the charcoal pool is parameter refinement.** It makes the number more
precise without changing what constrains the device. If that were the whole step,
this would be spinning, and I would have said so and stopped.

**Modelling patient variability does change the nature of the claim** — from a
deterministic device specification to a population design requirement. That is a
real change, but it is a change in the *statistical form* of the claim, not in the
constraint.

**And here is the honest limit, stated plainly.** Every step since stage 6 has
refined one constraint: *a finite consumable sets the therapy duration.* **That
constraint is not biological. It is a property of the technology we chose.** A
kidney has no consumable; it regenerates itself continuously. We have a consumable
because we chose a disposable chemical sorbent.

**What would genuinely change the nature of the constraint is replacing the
disposable sorbent with a regenerable one** — electrochemical urea oxidation, or
immobilised urease with electrochemical ammonium recovery — which converts a
**mass** limit into a **power** limit. That is the next step that is not
refinement, and it is where I would go next.

## D39 — The charcoal gap: an assumption, AND a way to avoid one

**Decision.** Close the gap two ways at once.

1. **Invert the question.** Instead of "how long does charcoal last" (which needs a
   made-up capacity), ask **"what capacity would charcoal need to stop being the
   binding pool?"** That is derivable from the other pools and needs **no
   assumption at all**: charcoal must provide **≥ 12.5 mg/g** to outlast 2.22 days,
   and **≥ 14.8 mg/g** to outlast 2.64 days. It becomes a **specification**.
2. **Then state the assumption explicitly**, flagged in code, in output and in
   documentation: creatinine generation 1400 mg/day (from 20 mg/kg/day × 70 kg),
   adsorption capacity 10–50 mg/g. **Neither is a source value.** The accessible
   literature yielded no citable mg/g figure for creatinine on activated carbon;
   ScienceDirect returned 403 and the OA reviews carried no usable capacity table.

**Result:** at the assumed low end (10 mg/g) charcoal lives 1.78 days and **binds
first**. At 30 and 50 mg/g it does not bind.

## D40 — The lifetime is a DISTRIBUTION, not a range

**Decision.** Draw each patient's urea generation from the **measured HEMO spread**
(4.85 ± 1.95 mg N/min, CV 40%) rather than using a daily average, and report
median, IQR and the failure fraction.

**This is real biology, not an assumption** — it is a measured between-patient SD
in a dialysis population, already verified in stage 5.

| | charcoal excluded | charcoal assumed |
| --- | --- | --- |
| **median** | **2.54 d** | **2.54 d** |
| mean | 3.39 d | 2.88 d |
| CV | 94% | 41% |
| p05 / p95 | 1.51 / 7.51 | 1.51 / 5.34 |
| maximum | 25.7 d | 5.3 d |
| cartridges/week (median) | 2.8 | 2.8 |
| cartridges/week (worst 5%) | 4.6 | 4.6 |

**25.3% of patients exhaust a cartridge inside 2.0 days.**

## D41 — Patient variability dominates; stage 7's prediction confirmed

| source of spread | widens lifetime by |
| --- | --- |
| parameter uncertainty (HZO range) | 17% |
| **patient variability (urea generation)** | **41%** |
| **ratio** | **2.3×** |

Stage 7 asserted this without quantifying it. It holds. **A range over parameters
was the wrong shape of answer**, and the clinical consequence is concrete: **a
device sized for the median (2.54 days) fails for a quarter of patients.**

## D42 — What bounding charcoal actually changed (reported as instructed)

**It did not move the typical patient. It capped the tail.**

| | charcoal excluded | charcoal assumed |
| --- | --- | --- |
| median | 2.54 d | **2.54 d (unchanged)** |
| mean | 3.39 d | 2.88 d |
| p95 | 7.51 d | 5.34 d |
| maximum | 25.7 d | 5.3 d |

Charcoal binds in **9.8%** of patients — precisely the low-generation tail, where
every other load had been scaled with urea generation.

**Honest caveat, and it matters: the upper tail therefore rests on an ASSUMPTION,
not a measured capacity.** The median does not depend on it. The p95 and the mean
do. Anyone quoting the p95 is quoting my assumption.

## D43 — What is scaled with generation, and what is not

**Scaled:** ZP and HZO loads — urea, K⁺ and phosphate all track protein intake.
**Not scaled:** the charcoal load — **creatinine tracks muscle mass**, which is
independent of urea generation.

This is a modelling choice, not a sourced relationship. Scaling creatinine with
urea would have been wrong in the opposite direction.

## B3 — A units error caught by a guard, not by a test

The first version converted generation with `(mg N/min × 1440 / 28) × 2`. Dividing
mg N by 28 **already** yields mmol of urea, because 28 is the molar mass of N₂ and
each urea carries two nitrogens. The extra `× 2` **doubled generation and halved
every lifetime** — the median came out 1.27 days instead of 2.54.

It was caught by a **regression guard** asserting that the distribution's mean
patient reproduces `LOADS.ureaMmolPerDay` (ratio 0.9987, the residual being
rounding in the 15.0 g/day figure). The guard now runs in the output. **No unit
test would have caught this**, because both versions ran cleanly and produced
plausible-looking numbers.

## The corrected numbers across three stages

| | stage 6 | stage 7 | stage 8 |
| --- | --- | --- | --- |
| form of answer | point | range | **distribution** |
| cartridge life | 2.91 d | 2.22–2.64 d | **median 2.54 d, p05 1.51, p95 5.34** |
| cartridges/week | 2.4 | 2.7–3.1 | **median 2.8, worst 5% 4.6** |
| patients failing < 2 d | not asked | not asked | **25.3%** |
| 14× membrane result | — | — | **UNCHANGED** |

**The 14× is still unchanged.** It remains a clearance-and-flow result that does not
touch cartridge capacity.

## What is still not done

1. **The charcoal capacity remains an assumption.** The tail of the distribution
   inherits it. An experiment — a creatinine adsorption isotherm on the actual
   cartridge charcoal — would replace it with a measurement, and that is a
   bench-scale task, not a modelling one.
2. **No correlation structure between loads.** Urea and phosphate are drawn as
   perfectly correlated (both scale with protein intake); K⁺ likewise. In reality
   the correlations are partial, which would widen or narrow the tails depending on
   sign.
3. **No patient-level covariates.** Age, sex, muscle mass and residual renal
   function all shift generation and would stratify the distribution.
4. **Nothing measured on hardware.** Unchanged from stages 6–7.

## Decisions needed

| # | Decision | If you do nothing |
| --- | --- | --- |
| 1 | **Do we replace the disposable sorbent with a regenerable one?** This is the only step identified so far that changes the *nature* of the constraint — mass limit → power limit. | We keep refining a consumable-exhaustion model. Every further step in this direction is parameter detail, and I would be spinning. |
| 2 | **Measure the charcoal isotherm, or keep the assumption?** Bench work, not modelling. | The p95 and mean keep resting on a number I invented. |
| 3 | **Continue, or stop?** | Six stages plus three corrections: validated device, validated patient model, executable protocol, functional system architecture, and the consumable constraint quantified as a population distribution. |
| 4 | Unchanged: **a PI.** | The protocol stays unexecuted. |
