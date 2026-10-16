
---

# STAGE 9 — ADDENDUM: regenerable sorbent, mass limit → power limit

## 0. The transfer question, answered BEFORE the work

> *Is a regenerable sorbent moving toward a real biological system, or just swapping
> one artificial consumable for a more technically complex one? A kidney's
> "regeneration" is active cellular transport, not electrochemical regeneration. If
> the path just replaces one artificial constraint with another, say what it changes
> and what it doesn't.*

**The question exposed a mistake I had made, and it is the most important thing in
this stage.**

### D44 — Stage 6's central analogy was FALSE, and is corrected

Stage 6 called the regeneration module **"the tubular reabsorption analogue."**

**It is not.** A tubule *reclaims* glucose, amino acids, bicarbonate and water
through **molecular recognition**. A sorbent — and an electrode — *destroy* urea.
**These are opposite functions.** Dialysate regeneration has no renal counterpart at
all; it is an engineering recycling step that I dressed in biological language.

The module tables in this directory still showed "tubular reabsorption" as the
analogue. That was wrong, and it mattered: it made the architecture look more
biological than it is, in the one document a reviewer would read first.

### What the change actually alters

| | changes? |
| --- | --- |
| **Kind of limit** | **YES — mass → power** |
| **Clinical consequence** | **YES — no cartridge changes, a continuous power budget** |
| **Failure mode** | **YES — from "consumable runs out" to "budget exceeded"** |
| selectivity | no — electrochemistry has no molecular recognition |
| reabsorption | no — still destroys, never reclaims |
| endocrine / metabolic | no — absent |
| regulation | no — still a sink, not a setpoint controller |

**So the user's characterisation is half right, and the half that is right is the
half that matters.**

- **It is not biology**, and it does not become biology. The chemistry stays abiotic.
- **But it is not a lateral swap between two equivalent consumables either.** A
  kidney has **no cartridge**; it has a **metabolic budget it cannot exceed**. The
  disposable sorbent's limit is a *supply-chain* limit — an artefact of the
  technology. The power limit is the same *kind* of limit biology operates under.

**That is the honest claim: the right kind of limit, reached by abiotic means.** It
is closer to how a kidney is constrained. It is not closer to being a kidney.

## D45 — The inverted specification, avoiding an invented energy figure

**No sourceable energy-per-gram for electrochemical urea oxidation was found.** The
NSF PAR copy was unreachable (connection timeout) and an open-access Catalysis Today
PDF extracted as CID glyph indices, not text. So **none is claimed.**

Instead the question is inverted against a real physiological anchor:

| | |
| --- | --- |
| resting whole-body VO₂ | 250 mL/min |
| renal share | 7–10% |
| oxidative energy | 20.1 kJ per litre O₂ |
| **renal power budget** | **5.9 – 8.4 W (mid 7.1 W)** |

> **SPECIFICATION: electrochemical urea removal must achieve ≤ 11.4 kWh per kg of
> urea** to fit inside the budget a kidney itself operates under (~7 W).

**A requirement, not a measurement.** This is the third time the inversion trick has
been the honest move (stage 8's charcoal requirement, stage 7's ZP capacity, here).
It works because it converts an unknown into a specification without inventing a
value.

## D46 — The energy figure is swept, never claimed

| energy (kWh/kg) | power (W) | battery (kg) | fits kidney budget? |
| --- | --- | --- | --- |
| 5 | 3.1 | 0.30 | yes |
| 10 | 6.2 | 0.60 | yes |
| **16** | 10.0 | 0.96 | **no** |
| 20 | 12.5 | 1.20 | no |
| 50 | 31.2 | 2.99 | no |

At the specification the battery is **0.68 kg** (250 Wh/kg Li-ion pack, one day).

## D47 — The two constraints compared, and a mass check against a real device

Over 30 days:

| | disposable | regenerable |
| --- | --- | --- |
| carried mass | 1.66 kg | 0.68 kg |
| **resupplied** | **19.6 kg** | **0.0 kg** |
| cartridge changes | 11.8 | 0 |
| continuous power | — | 7.1 W |
| consignment | replaced | recharged |

**The structural difference is NOT mass** — the two are comparable. **It is that
sorbent mass is consumed and resupplied, while battery mass is carried and
recharged.** The resupply column is the one that changes kind.

**Mass sanity check against a device that reached clinical trials:** Gura's Wearable
Artificial Kidney — <5 kg, battery-driven, ~400 mL water, sorbent regeneration,
NCT02280005. Our modelled cartridge alone is **1.66 kg = 33%** of that budget,
leaving 3.3 kg for pump, dialyzer, battery, water and housing. A plausible total —
and the only claim made, since the WAK carried a *disposable* sorbent. **This checks
the mass scale, not the regenerable path.**

## What is not claimed

**That any electrochemical system meets the specification.** It may well not — the
widely-reported difficulty with urea electrooxidation is sluggish kinetics and high
overpotential, which would push energy per kg up, not down. But I have no sourced
figure, so I state the requirement and stop.

## Decisions needed

| # | Decision | If you do nothing |
| --- | --- | --- |
| 1 | **Source real electrochemical urea-oxidation performance** (kWh/kg, current efficiency) from the primary literature, or measure it. | The specification stands untested. **This is not a modelling task — it needs data or a bench.** |
| 2 | **The charcoal isotherm** (carried over from stage 8). | The p95 and mean lifetime still rest on an invented number. |
| 3 | Continue, or stop? | See below. |
| 4 | Unchanged: **a PI.** | The protocol stays unexecuted. |

## Is the next step spinning? Yes — if it is another modelling step

Stated plainly, because the instruction asked for it.

**Modelling has reached the end of what it can settle here.** Everything from stage 6
onward refined one constraint, and stage 9 has now changed its kind. What remains is
**not** another refinement:

- the specification (**≤ 11.4 kWh/kg**) can only be **tested against real
  electrochemical performance** — literature or bench;
- the charcoal capacity can only be **measured**;
- the architecture's remaining gaps (selectivity, reabsorption, endocrine function)
  are **not addressable by modelling at all** — they are hardware and biology.

**Another modelling stage would be spinning**, and I would say so rather than
produce one. The useful next actions are a literature review with real performance
numbers, or a bench experiment — both outside what I can do from here.
