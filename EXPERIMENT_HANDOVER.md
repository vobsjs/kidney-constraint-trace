# EXPERIMENT HANDOVER

For a bench or laboratory team considering the artificial-kidney work.

> **Read this together with [`HANDOVER.md`](./HANDOVER.md), which is for a clinical
> collaborator. That one describes a patient study; this one describes bench work.
> They are different projects with different requirements.**

---

## The direct answer

**The modelling is complete and the package is self-contained. What is missing is
not documentation — it is data.**

Three quantities the whole artificial-kidney conclusion rests on **cannot be
computed, only measured**, and none of them have been:

| Quantity | Status |
| --- | --- |
| activated-charcoal creatinine capacity | **an assumption I invented** (10–50 mg/g) |
| electrochemical urea-oxidation energy | **no sourced value exists in this package** |
| ZP/HZO operative capacities | from one published source, never independently replicated |

**So the answer is: the package lacks a bench, not a document.** Below is exactly
what a bench should measure, in what order, and what result would falsify the model.

## 1. Your first 30 minutes

```sh
node tools/verify_all.mjs              # 30 checks, ~1 min
node artificial_kidney/tools/run_analysis.mjs     # checks 1-5
node artificial_kidney/tools/run_variability.mjs  # checks 6-7
node artificial_kidney/tools/run_regenerable.mjs  # checks 8-11
```

If all pass, the model does what is claimed. If any fail, stop and report — every
downstream conclusion depends on them.

## 2. The three testable specifications

These are **requirements derived from the model**, not measurements. Each is a
falsifiable claim about hardware.

### Specification A — charcoal capacity ≥ 14.8 mg/g

| | |
| --- | --- |
| **Measure** | creatinine adsorption isotherm on the actual cartridge charcoal |
| **Threshold** | **≥ 14.8 mg/g** to stop being the binding pool |
| **Source of the number** | derived from the other pools and the assumed creatinine load — **no assumption needed** |
| **If it fails** | the cartridge lifetime falls below 2.5 days, and the p95 of the distribution is wrong |
| **Why it matters** | this is the single number the entire upper tail of the lifetime distribution rests on, and it is **currently invented** |

### Specification B — electrochemical urea removal ≤ 11.4 kWh/kg urea

| | |
| --- | --- |
| **Measure** | energy per kg of urea removed, with current efficiency |
| **Threshold** | **≤ 11.4 kWh/kg** to fit inside the ~7 W a kidney itself spends |
| **Source of the number** | renal oxygen consumption, 7–10% of 250 mL/min at 20.1 kJ/L O₂ |
| **If it fails** | the power budget exceeds what biology uses, and a wearable would need a battery too heavy to carry |
| **Why it matters** | this is the test of whether "mass limit → power limit" is a genuine advance or a lateral move |

**Note the direction of published risk.** Urea electrooxidation is widely reported as
sluggish with high overpotential, which pushes energy per kg **up**. I could not
source a figure, so I am not claiming it fails — I am saying the threshold is
untested and the prior is not favourable.

### Specification C — ZP/HZO operative capacities

| | |
| --- | --- |
| **Measure** | ammonium, potassium, calcium, magnesium uptake on ZP; phosphate on HZO |
| **Threshold** | reproduce the source's 1.47 mEq/g ammonium and 80–113 mEq HZO complement |
| **Source of the number** | one published REDY characterisation |
| **If it fails** | the whole pool-competition result (stage 7) moves |

This is the **least urgent** of the three: it is a replication, not a gap.

## 3. Falsifiable predictions of the model

A bench can break the model in any of these ways:

| # | Prediction | How to falsify |
| --- | --- | --- |
| P1 | Cartridge life **median 2.54 days**, p05 1.51, p95 5.34 | run a cartridge to exhaustion at a known urea load |
| P2 | Failure is **abrupt**, not gradual — loop concentration is flat then runs away | measure loop urea hourly; a gradual ramp falsifies it |
| P3 | Urea is **not** the binding pool; ZP or HZO is | analyse the spent cartridge's layer-by-layer loading |
| P4 | The two pools land **within ~1.5%** of each other at mid-range HZO capacity | compare measured pool lifetimes |
| P5 | Closing the loop cuts required membrane area **~14×** at matched weekly clearance | trivial to verify from flows; listed for completeness |

**P4 is the one I would most like tested.** I flagged it as an observation that may
be coincidence. If the layers really are engineered to match, the model is capturing
something real; if they are not, the agreement was luck.

## 4. What is already validated — do not re-derive it

The modelling chain has real anchors, established in stages 4–5:

- the counter-current device model reproduces **120 published EN ISO 8637-1:2020**
  manufacturer clearances to a worst error of **0.89%**;
- the same in-vitro model reproduces **HEMO's clinical cross-dialyzer urea clearance
  of 230 mL/min to 0.1%** — two independent measurement traditions agreeing;
- the Daugirdas–Schneditz rate equation reproduces the **HEMO manual's own worked
  example** exactly.

See [`PROVENANCE.md`](./PROVENANCE.md) for every constant's source and status.

## 5. What the model cannot tell you — and these are not small

1. **No selectivity.** Electrochemistry oxidises whatever reaches the electrode. The
   model treats urea as the only target; a real cell may attack amino acids,
   glucose, or the dialysate's own constituents.
2. **Not reabsorption.** A tubule *reclaims* useful solute; every option here
   *destroys* urea. Stage 6 called this module "the tubular reabsorption analogue" —
   **that was a false analogy, corrected in stage 9.** Dialysate regeneration has no
   renal counterpart.
3. **No endocrine or metabolic function.** Erythropoietin, vitamin D activation,
   gluconeogenesis, ammonia handling: all absent.
4. **No regulation.** The system is a sink, not a setpoint controller. A kidney holds
   blood chemistry constant; this removes a fixed mass per day.
5. **Nothing has been built or measured by this project.** Every result is computed
   from published capacities plus previously validated modules.

## 6. What a successful bench would change

If Specifications A and B both pass, the model's conclusion stands: **a continuous
artificial kidney is a sorbent-materials problem**, and the constraint has moved from
consumable mass to power — which is the right *kind* of limit.

If either fails, the conclusion changes, and the package says which number moved.

**Either outcome is a result.** The model is built so that a bench failure is
informative rather than merely negative — which is the most that modelling can
offer without a bench.

## 7. Documents, in reading order

| Document | Why |
| --- | --- |
| [`artificial_kidney/README.md`](./artificial_kidney/README.md) | the architecture and all four stages' results |
| [`artificial_kidney/LEDGER.md`](./artificial_kidney/LEDGER.md) | stage 6 decisions — the module decomposition |
| [`artificial_kidney/LEDGER_STAGE7.md`](./artificial_kidney/LEDGER_STAGE7.md) | capacity competition; **corrects a stage-6 error of my own** |
| [`artificial_kidney/LEDGER_STAGE8.md`](./artificial_kidney/LEDGER_STAGE8.md) | the charcoal assumption and patient variability |
| [`artificial_kidney/LEDGER_STAGE9.md`](./artificial_kidney/LEDGER_STAGE9.md) | mass → power; **corrects stage 6's false analogy** |
| [`PROVENANCE.md`](./PROVENANCE.md) | every constant, its source, and whether it was verified |
