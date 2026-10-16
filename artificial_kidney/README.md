# Stage 6 — from a device to a functional artificial kidney

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
| **Regeneration** | strip solute from the filtrate and **return the fluid** | tubular reabsorption | **new in this stage** |
| **Compartment** | distribute and generate solute | body fluid compartments | **validated** (stage 5, reused unchanged) |

Only regeneration is new. The other two are imported, not rewritten, so the
composition is a genuine composition rather than a reimplementation.

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
| `tools/run_analysis.mjs` | checks 1–5 |
