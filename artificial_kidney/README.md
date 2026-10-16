# Stages 6–9 — from a device to a functional artificial kidney

> **This directory covers four stages**, not one. Stage 6 built the architecture;
> stages 7, 8 and 9 each corrected or advanced it — including two corrections to
> stage 6 itself. Sections §3b, §3c and §3d below are those stages.
>
> | Ledger | Stage |
> | --- | --- |
> | [`LEDGER.md`](./LEDGER.md) | 6 — the module decomposition |
> | [`LEDGER_STAGE7.md`](./LEDGER_STAGE7.md) | 7 — capacity competition; corrects a stage-6 error |
> | [`LEDGER_STAGE8.md`](./LEDGER_STAGE8.md) | 8 — the charcoal assumption and patient variability |
> | [`LEDGER_STAGE9.md`](./LEDGER_STAGE9.md) | 9 — mass → power; corrects stage 6's false analogy |
>
> For bench work, start at [`../EXPERIMENT_HANDOVER.md`](../EXPERIMENT_HANDOVER.md).

Stages 4–5 modelled **one device**: a dialyzer, then that dialyzer coupled to a
patient. This stage models the **system**, decomposed the way a kidney is
decomposed — by function, not by hardware.

## 1. Why this is not just relabelling

The dialyzer is an **open loop**: blood in, dialysate bought fresh and discarded,
about **360 L per week**. That open loop is *why* dialysis is intermittent, and
intermittency is the defining functional difference between dialysis and a kidney.

A kidney filters ~180 L/day and **reabsorbs ~99% of it**, returning the fluid and
the useful solute. The engineering analogue is **dialysate regeneration**, and it
is the module every wearable artificial kidney programme needs. Without it there
is no closed loop and no continuous therapy — only a better filter run three times
a week.

## 2. The module decomposition

| Module | Function | Renal analogue | Status |
| --- | --- | --- | --- |
| **Filtration** | move solute out of blood across a membrane | glomerular filtration | **validated** (stage 4, reused unchanged) |
| **Regeneration** | strip solute from the filtrate and **return the fluid** | **NONE — see §3d** | **new in this stage** |
| **Compartment** | distribute and generate solute | body fluid compartments | **validated** (stage 5, reused unchanged) |

Only regeneration is new. The other two are imported, not rewritten, so the
composition is a genuine composition rather than a reimplementation.

> **Correction (stage 9).** This table originally listed "tubular reabsorption" as
> regeneration's renal analogue. **That was a false analogy.** A tubule *reclaims*
> glucose, amino acids, bicarbonate and water through molecular recognition; a
> sorbent or an electrode *destroys* urea. They are opposite functions, and
> dialysate regeneration has **no renal counterpart**. See §3d.

## 3. The regeneration module, and its grounding

A sorbent cartridge removes urea in two steps: immobilised urease hydrolyses it to
ammonium and bicarbonate, and zirconium phosphate exchanges the ammonium for
sodium and hydrogen.

```
urea  --urease-->  NH4+ + HCO3-
```

Published values used, read from the REDY literature:

| Quantity | Value | Source |
| --- | --- | --- |
| REDY D3150 urea capacity | **43.7 g** | UNSW thesis on the REDY cartridge; stated to agree with the cartridge capacity table |
| Zirconium phosphate total cation exchange capacity | 3.80 ± 1.14 mEq/g | same |
| Commercial REDY recirculating dialysate volume | **5.5 L** | same |
| Urea generation | **15.0 g/day** | HEMO (already verified in stage 5): 4.85 mg N/min × 1440 × 60/28 |

**Nothing is fitted.** The capacity and the generation rate are both published
quantities, and their ratio is the cartridge lifetime.

**The rate law is a modelling choice**, stated plainly: the cartridge strips
everything from the dialysate it processes until its capacity is exhausted. What
the model really encodes is mass conservation against a published capacity; the
kinetic detail only governs how abrupt the failure is. A sharp front is the
observed behaviour of a packed ion-exchange bed, and the source describes exactly
that (removal constant through the run, then breakthrough).


## 3b. Stage 7 — capacity competition between species

Stage 6 modelled **one** capacity: 43.7 g of urea. It recorded that as the stage's
largest simplification, reasoning that a real cartridge must also bind potassium,
phosphate, sulphate and bicarbonate, so the true lifetime must be shorter.

**That reasoning was half wrong, and the truth is more useful.** The cartridge is
not one pool that urea shares: it is **several parallel pools**, one per sorbent
layer, and the device dies when the **first** of them is exhausted.

| Pool | Binds | Published capacity | Lifetime |
| --- | --- | --- | --- |
| ZP (cation) | NH4+ from urea, K+, Ca2+, Mg2+, HCO3- | 1881 mEq operative | **2.64 days** |
| HZO/alumina (anion) | phosphate, bicarbonate | 80–113 mEq | **2.68 days** (mid-range) |
| activated charcoal | creatinine, urate, middle molecules | not published | not modelled |

### The stoichiometry that closed a stage-6 open question

Stage 6 recorded an arithmetic inconsistency it could not explain: the source gives
**145.9 mEq** of ammonium for a 1/10-scale cartridge and calls that **43.7 g** of
urea at full scale, which does not scale by ten.

It does once the chemistry is right. Urease hydrolysis is
`(NH2)2CO + H2O -> 2 NH3 + CO2` — **one urea yields two ammonium ions.**

    43.7 g urea = 727.6 mmol = 1455 mEq NH4+  =  145.9 x 10

which closes the gap exactly. **Stage 6's arithmetic was right; the stoichiometry I
had assumed (1 mEq per mmol) was wrong.**

### The correction, reported honestly

| | stage 6 | stage 7 |
| --- | --- | --- |
| cartridge lifetime | 2.91 days | **2.22 – 2.64 days** |
| cartridges per week | 2.4 | **2.7 – 3.1** |
| required clearance vs intermittent | 14× lower | **14× lower — UNCHANGED** |

**Urea is not the binding pool.** Once the other layers are modelled the cation
pool binds at the mid-range HZO capacity, and the anion pool binds at the low end —
the binding pool *switches* across the published HZO range, so the honest statement
is a **range, not a point value**.

The two pools land within ~1.5 % of each other. That is what a deliberately balanced
multi-layer design should do — and it may also be coincidence. It is reported as an
observation, not as evidence.

**The 14× membrane result is untouched.** It is a clearance-and-flow result and
does not depend on cartridge capacity. What changed is only the consumable figure,
in the pessimistic direction.


## 3c. Stage 8 — the charcoal pool, and patient variability

Two gaps stage 7 left open, closed.

### The charcoal pool: an assumption, and a way to avoid one

The source gives the charcoal **mass** (24.9 g at 1/10 scale, scaled ×10 — the
scaling is the assumption) but **no creatinine capacity**, and no citable mg/g
figure was found in the accessible literature.

So the question is **inverted** into something that needs no assumption at all:

| To outlast | Charcoal must provide |
| --- | --- |
| 2.22 days | **≥ 12.5 mg/g** |
| 2.64 days | **≥ 14.8 mg/g** |

That is a **specification, not a measurement** — what charcoal must beat to stop
being the binding constraint.

Then, with the flagged assumption (`ASSUMPTIONS` in `patient_variability.mjs`,
marked as such in code, output and here):

| Assumed | Charcoal life | Verdict |
| --- | --- | --- |
| 10 mg/g | 1.78 days | **binds first** |
| 30 mg/g | 5.34 days | does not bind |
| 50 mg/g | 8.89 days | does not bind |

### Lifetime as a distribution

Stage 7's 2.22–2.64 days was **parameter uncertainty only**. Here each patient
draws their own urea generation from the **measured HEMO spread** (4.85 ± 1.95
mg N/min, CV 40% — real biology, not an assumption).

| | charcoal excluded | charcoal assumed |
| --- | --- | --- |
| **median** | **2.54 d** | **2.54 d** |
| mean | 3.39 d | 2.88 d |
| CV | 94% | 41% |
| p05 / p25 / p75 / p95 | 1.51 / 1.99 / 3.50 / 7.51 | 1.51 / 1.99 / 3.50 / 5.34 |
| maximum | 25.7 d | 5.3 d |
| cartridges/week (median) | 2.8 | 2.8 |
| cartridges/week (worst 5%) | 4.6 | 4.6 |

**25.3% of patients exhaust a cartridge inside 2.0 days.**

### Patient variability dominates parameter uncertainty — confirmed

| source of spread | widens lifetime by |
| --- | --- |
| parameter uncertainty (HZO range) | 17% |
| **patient variability (urea generation)** | **41%** |
| ratio | **2.3×** |

Stage 7 predicted this. **A range over parameters was the wrong shape of answer.**
The clinical consequence: a device sized for the median (2.54 days) **fails for a
quarter of patients.**

### What bounding charcoal actually changed

**It did not move the typical patient — it capped the tail.** Median unchanged at
2.54 days; mean 3.39 → 2.88; p95 7.51 → 5.34; maximum 25.7 → 5.3. Charcoal binds
in 9.8% of patients.

**Honest caveat: the upper tail therefore rests on an assumption, not a measured
capacity.** The median does not depend on it; the p95 and the mean do.

### What is and is not scaled with generation

- **scaled:** ZP and HZO loads — urea, K⁺ and phosphate all track protein intake
- **not scaled:** the charcoal load — creatinine tracks **muscle mass**, which is
  independent of urea generation

This is a modelling choice. Scaling creatinine with urea would have been wrong in
the opposite direction.


## 3d. Stage 9 — regenerable sorbent: from a mass limit to a power limit

### A correction to stage 6, first

Stage 6 described the regeneration module as **"the tubular reabsorption
analogue."** **That was a false analogy.** A tubule *reclaims* glucose, amino
acids, bicarbonate and water through molecular recognition. A sorbent — and an
electrode — *destroy* urea. They are opposite functions. **Dialysate regeneration
has no renal counterpart**, and is now labelled as such.

### What changes, and what does not

| | |
| --- | --- |
| **Kind of limit** | **mass → power** |
| **Clinical consequence** | no cartridge changes; a continuous power budget |
| **Failure mode** | was "consumable runs out"; now "budget exceeded" |
| selectivity | **unchanged** — no molecular recognition |
| reabsorption | **unchanged** — still destroys, never reclaims |
| endocrine / metabolic | **unchanged** — absent |
| regulation | **unchanged** — still a sink, not a setpoint controller |

**Why "mass → power" is a real structural gain rather than a lateral swap:** a
kidney has **no cartridge**, but it **cannot exceed a metabolic budget**. Moving the
limit onto power moves it onto the resource biology is *also* limited by. It is not
biology — the chemistry stays abiotic — but it is the right *kind* of limit.

### The anchor, and the specification

| | |
| --- | --- |
| resting whole-body VO₂ | 250 mL/min |
| renal share | 7–10% |
| oxidative energy | 20.1 kJ per litre O₂ |
| **renal power budget** | **5.9 – 8.4 W (mid 7.1 W)** |

No sourceable energy-per-gram for electrochemical urea oxidation was found (the NSF
PAR copy was unreachable; one open-access PDF was CID-glyph encoded). **So none is
claimed** — the question is inverted instead:

> **Electrochemical urea removal must achieve ≤ 11.4 kWh per kg of urea** to fit
> inside the budget a kidney itself operates under (~7 W).

**A requirement, not a measurement.**

### Sweep — the energy figure is swept, never claimed

| energy (kWh/kg) | power (W) | battery (kg) | fits kidney budget? |
| --- | --- | --- | --- |
| 5 | 3.1 | 0.30 | **yes** |
| 10 | 6.2 | 0.60 | **yes** |
| 16 | 10.0 | 0.96 | no |
| 20 | 12.5 | 1.20 | no |
| 50 | 31.2 | 2.99 | no |

### The two constraints side by side, over 30 days

| | disposable | regenerable |
| --- | --- | --- |
| carried mass | 1.66 kg | 0.68 kg |
| **resupplied over 30 d** | **19.6 kg** | **0.0 kg** |
| cartridge changes | 11.8 | 0 |
| continuous power | — | 7.1 W |
| consignment | replaced | recharged |

**The structural difference is not mass — the two are comparable. It is that sorbent
mass is *consumed* and must be resupplied, while battery mass is *carried* and
recharged.** The resupply column is the one that changes kind.

### Mass sanity check against a device that reached clinical trials

Gura's Wearable Artificial Kidney — **<5 kg, battery-driven, ~400 mL water,
sorbent-based regeneration, NCT02280005**. Our modelled cartridge alone is
**1.66 kg, 33%** of that budget, leaving 3.3 kg for pump, dialyzer, battery, water
and housing. A plausible total — which is the only claim made, since the WAK
carried a *disposable* sorbent. This checks the **mass scale**, not the regenerable
path.

## 4. Results

`tools/run_analysis.mjs`:

**CHECK 1 — the module reproduces the published capacity.** The cartridge loads to
**43.70 g** exactly, and 95 % utilisation is reached at **2.78 days** against a
mass-balance prediction of **2.92 days** (4.8 % apart, and the gap is the 5 % of
capacity the threshold leaves unused).

**CHECK 2 — the closed loop fails abruptly.** The loop holds a steady
**8.8 mg N/L** for two days (analytically 9.7 = influx ÷ dialysate flow), then the
bed exhausts and the concentration runs away:

| day | loop urea | cartridge |
| --- | --- | --- |
| 1 | 8.8 mg N/L | 34 % |
| 2 | 8.8 mg N/L | 68 % |
| 3 | 102 mg N/L | 100 % |
| 5 | 2642 mg N/L | 100 % |

**A real device therefore needs a sorbent monitor, not a concentration trend.** A
device that infers remaining capacity from the loop concentration would see
nothing wrong until it was already failing.

**CHECK 3 — what actually limits a continuous artificial kidney.**

| | intermittent (single pass) | continuous (regenerated loop) |
| --- | --- | --- |
| dialyzer clearance | 231.9 mL/min | **16.6 mL/min (14× lower)** |
| dialysate | 360 L/week, discarded | 5.5 L, replaced every 2.9 days |
| membrane | reference | **proportionally ~14× smaller** |
| cartridge | — | **2.4/week, 125/year — unchanged** |

**Closing the loop shrinks the membrane requirement by ~14× but leaves the
cartridge demand exactly where it was, because that demand is set by generation
alone. No choice of clearance can reduce it.** A continuous artificial kidney is a
sorbent-materials problem, and dialyzer optimisation cannot touch it.

**CHECK 4 — what closing the loop buys physiologically.**

| therapy | BUN peak | trough | swing |
| --- | --- | --- | --- |
| intermittent (3 × 4 h/wk) | 57.1 | 12.3 | **44.8 mg/dL** |
| continuous (regenerated loop) | 29.3 | 29.3 | **0.0 mg/dL** |

The continuous level is *higher* (29.3 against a 12–57 range) because the same
weekly removal spread across 168 h holds a flat plateau. **What changes is not the
average but the swing, which goes to zero** — and that is the functional difference.
A kidney holds blood urea nitrogen roughly constant; intermittent dialysis
structurally cannot.

To hold BUN at a normal 15 mg/dL continuously would need 32.3 mL/min — still a
small membrane. **The cartridge demand is unchanged**, because it is set by
generation. That is the honest limit of today's sorbent technology.

## 5. Transferability

Answered before the work started, and it is the reason this module was chosen over
deepening the dialyzer:

- **to other solutes** — the module is parameterised by capacity, so swapping urea
  for potassium or phosphate means swapping the capacity and the sorbent chemistry;
- **to other regeneration chemistries** — oxystarch, dialdehyde cellulose and
  nanoporous membranes all reduce to a capacity and a rate law;
- **to peritoneal dialysis** — the same closed-loop regeneration problem, which the
  source literature pursued in parallel;
- **to any chronic therapy** — the finding generalises: *in a recirculating system
  the consumable sets the limit, not the separator.*

## 6. What this stage did not do

1. **It does not model the device's other consumables.** Potassium, phosphate,
  sulphate and bicarbonate all compete for sorbent capacity, and the source
  documents that some of them displace others. The 43.7 g figure is a urea-only
  capacity; real cartridges must also bind everything else, so the true lifetime is
  shorter than 2.9 days.

  > **Superseded by stage 7 — see §3b.** The cartridge is now modelled as parallel
  > capacity pools and the lifetime is a range (2.22–2.64 days). What remains
  > unmodelled is the **activated-charcoal pool**, for which the source publishes no
  > capacity; creatinine and urate therefore place no bound on the lifetime here.
  > That is a known gap, not a solved one.
2. **It does not model urease kinetics or inhibition.** The source notes cartridge-
  to-cartridge variation in urease activity and irreversible inhibition by heavy
  metals.
3. **It does not model the patient's own residual renal function**, which in reality
  contributes and would extend the cartridge.
4. **The continuous case is a steady-state calculation, not a simulation.** It gives
  the swing result exactly but does not model the transition from intermittent to
  continuous therapy.
5. **No device exists.** Everything here is computed from published capacities and
  the previously validated modules. Nothing was measured on hardware.

## 7. Files

| Path | Role |
| --- | --- |
| `modules.mjs` | the three functional modules; filtration and compartment are re-exports of validated code |
| `system.mjs` | the closed loop, the regeneration simulation, and the modality comparison |
| `capacity_competition.mjs` | stage 7: the parallel capacity pools and their lifetimes |
| `patient_variability.mjs` | stage 8: the charcoal assumption and the population distribution |
| `regenerable.mjs` | stage 9: the power-limit model and the constraint comparison |
| `tools/run_analysis.mjs` | checks 1–5 |
| `tools/run_variability.mjs` | checks 6–7 |
| `tools/run_regenerable.mjs` | checks 8–11 |
