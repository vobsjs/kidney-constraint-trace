
---

# STAGE 10 — ADDENDUM: the specification, converted into something measurable

## Why this stage, chosen without being asked

Stage 9's own ledger said, in writing: *"the specification can only be tested against
real electrochemical performance — literature or bench,"* and *"another modelling
stage would be spinning."*

The rule changed: I now choose the next step. **Sourcing real performance data is not
modelling — it is retrieval — and it was the exact thing I had named as missing.** So
that is what this stage does. Doing another model instead would have contradicted my
own written judgement.

## D48 — The specification was the wrong SHAPE, and that is fixable by algebra

Stage 9's **≤ 11.4 kWh/kg urea** is a **device** quantity. No device exists, so it
cannot be checked by anyone.

But it is algebraically identical to an **electrode** quantity:

```
energy per kg = n · F · V_cell / (M_urea · FE)
```

| term | value | status |
| --- | --- | --- |
| n, electrons per urea | **6** | **✔ sourced** |
| V_cell | **1.72 V** | **✔ derived** from sourced potentials |
| M_urea | 0.06006 kg/mol | fixed |
| **FE** | **?** | **the thing to measure** |

**This cost no assumption.** n is sourced, V_cell is derived, M_urea is fixed. The
only unknown is FE — and FE is an afternoon's measurement, not a device programme.

**V_cell derivation:** anode 0.6 V vs Hg/HgO = 0.740 V vs SHE; HER cathode at pH 14
with 0.15 V overpotential = −0.979 V vs SHE; **V_cell = 1.72 V**. The thermodynamic
minimum is **0.08 V**, so **the overpotential is 1.64 V** — the field's "sluggish
kinetics" is now a number instead of a claim.

> **The specification is equivalent to FE ≥ 40%.**

At 100 % FE the energy is 4.60 kWh/kg (2.9 W); at 60 % it is 7.67 kWh/kg (4.8 W),
comfortably inside the budget. **The specification is not obviously unmeetable.**

## D49 — I found the one directly relevant experiment, and it argues against us

**Carpenter K, Stuve EM**, *Electrooxidation of Urea and Creatinine on Nickel
Foam-based Electrocatalysts*, ChemRxiv preprint; J Appl Electrochem 2021,
doi:10.1007/s10800-021-01545-1. **Funded by Northwest Kidney Centers**, aimed
explicitly at **portable dialysis**, at **dialysate-relevant concentrations** (urea
10 mM, creatinine 0.18 mM).

| sourced finding | attacks |
| --- | --- |
| 0.18 mM creatinine cuts urea oxidation charge by **19%** on Ni hydroxide foam | **FE** |
| on plain Ni foam, creatinine **"severely limits"** urea oxidation | **FE** |
| site blocking becomes measurable after **120 s** | **FE** |
| oxygen evolution competes at the same potentials | **FE** |

**Every finding attacks faradaic efficiency, not cell voltage.** The binding risk in
this specification is not a high voltage — it is that the current is shared between
urea, creatinine and water, and only the urea fraction counts.

This is exactly the class of failure my model excludes. Stage 9 listed "no
selectivity" as something the change does *not* fix. **There is now sourced evidence
that it matters quantitatively.**

## Honest limits of this stage

1. **No number here is a measurement of a real cell.** V_cell is derived from a
   *half-cell* potential plus an order-of-magnitude HER overpotential. A real cell
   would need ohmic-drop and mass-transport terms.
2. **The 19% figure is a CHARGE reduction, not an absolute FE.** The two cannot be
   compared directly, so I do **not** claim FE falls below 40%. I claim FE is the
   binding unknown and that the one relevant experiment points the wrong way.
3. **The 6-electron stoichiometry is for complete oxidation to N₂.** Partial
   oxidation to nitrite/nitrate would change n and therefore the required FE. The
   source states the complete pathway; other products are not modelled.
4. **Still no device, still no bench.** Unchanged.

## Verdict

| | |
| --- | --- |
| specification | ≤ 11.4 kWh/kg urea |
| equivalent to | **FE ≥ 40% at V_cell = 1.72 V** |
| met? | **unknown — and now measurable** |
| the experiment that settles it | FE for urea oxidation in a dialysate-like stream containing creatinine and bicarbonate, at dialysate concentrations, over hours |

## Does the project continue?

**This stage was worth doing and the next one probably is not.**

Stage 10 converted an untestable requirement into a testable one, which is a real
gain and is what stage 9 said was missing. But the remaining unknown is now a
**single measured number, FE**, and I cannot measure it. Everything downstream of it
is either arithmetic (which is done) or bench work (which is not mine).

**So I am stopping here rather than generating a stage 11.** The honest reasons:

- the specification is now precise enough to hand to a lab, which was the goal;
- every remaining gap is an **experiment** (FE, charcoal isotherm) or **biology**
  (selectivity, reabsorption, endocrine function) — none is addressable by modelling;
- I have now twice written that more modelling would be spinning, and doing it anyway
  would make those statements worthless.

**The condition that would restart this:** a measured FE. If it comes in above 40 %,
the power-limited design holds and the next question becomes electrode engineering.
If below, the electrochemical path fails and stage 9's conclusion reverts to the
disposable sorbent — which would make the **charcoal isotherm** the binding
measurement instead.

Either way, the next move belongs to a bench, not to me.
