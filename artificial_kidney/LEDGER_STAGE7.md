
---

# STAGE 7 — ADDENDUM: capacity competition between species

## The instruction

Modify stage 6's largest simplification: model competing species consuming cartridge
capacity, so the lifetime and consumable demand become real numbers. **Report
honestly if the 14× and 2.4/week figures change.**

## D35 — The stage-6 self-criticism was HALF WRONG, and I am recording that

Stage 6 said: *"43.7 g is a urea-only capacity; real cartridges must also bind
everything else, so the true lifetime is shorter than 2.9 days."*

**The first half was wrong.** The 43.7 g figure is a **measured cartridge
specification** (Table 4: D3150 minimum 42.9 g, average 53.6 g) obtained *with* the
competing species present. Dividing it down again for potassium would have
double-counted. I would have produced a wrong correction if I had trusted my own
stage-6 reasoning instead of going back to the source.

**The second half was right, for a different reason.** What stage 6 actually missed
is not a correction to the urea pool but **the existence of the other pools**.

## D36 — The cartridge is parallel pools, not one shared pool

**Decision.** Model each sorbent layer as its own capacity pool; the device dies
when the **first** is exhausted.

| Pool | Binds | Capacity | Lifetime |
| --- | --- | --- | --- |
| ZP (cation) | NH4+, K+, Ca2+, Mg2+, HCO3- | 1881 mEq operative | **2.64 d** |
| HZO/alumina (anion) | phosphate, bicarbonate | 80–113 mEq | **2.68 d** (mid) |
| activated charcoal | creatinine, urate, middle molecules | **not published** | not modelled |

**ZP load:** NH4+ from urea 499.5, K+/Ca2+/Mg2+ 145.2, HCO3- on ZP 67.4 =
**712.1 mEq/day**.
**HZO load:** phosphate 36.0 mEq/day. Sulphate is **excluded**: the source shows no
net uptake after 90 min because bicarbonate displaces it.

**Urea is not the binding pool.** Once the other layers exist, the cation pool binds
at mid-range HZO capacity and the anion pool binds at the low end — the binding pool
**switches** across the published range.

## D37 — A stage-6 open question is CLOSED by stoichiometry

Stage 6 recorded an arithmetic inconsistency it could not explain: the source gives
**145.9 mEq** of ammonium for a 1/10-scale cartridge and calls that **43.7 g** of
urea at full scale, which does not scale by ten. Stage 6 flagged this and could not
resolve it.

**It resolves exactly.** Urease hydrolysis is

    (NH2)2CO + H2O -> 2 NH3 + CO2

so **one urea molecule yields TWO ammonium ions**, and

    43.7 g urea = 727.6 mmol = 1455 mEq NH4+  =  145.9 mEq x 10

**Stage 6's arithmetic was correct; the stoichiometry I had assumed (1 mEq per mmol)
was wrong.** The check now runs in CHECK 5 and prints both numbers.

## The corrected numbers

| | stage 6 | stage 7 |
| --- | --- | --- |
| cartridge lifetime | 2.91 days | **2.22 – 2.64 days** |
| cartridges per week | 2.4 | **2.7 – 3.1** |
| cartridges per year | 125 | **115 – 160** |
| required clearance vs intermittent | 14× lower | **14× lower — UNCHANGED** |
| BUN swing | 44.8 → 0.0 | **unchanged** |

**The 14× did not change, and I am saying so plainly.** It is a clearance-and-flow
result: matching a weekly cleared volume over 168 h rather than 12 h. It does not
depend on cartridge capacity at any point. Only the consumable figure moved, and it
moved in the **pessimistic** direction, which is what the instruction was for.

The lifetime is reported as a **range, not a point**, because the HZO complement is
published as a range (80–113 mEq) and the binding pool changes across it. Quoting a
single number would have been false precision.

## D38 — The near-match is reported as an observation, not as evidence

The two pools land within **~1.5 %** of each other at mid-range capacity (2.64 vs
2.68 days). That is what a deliberately balanced multi-layer design *should* do, and
it would be tempting to present as validation.

**It may also be coincidence.** Nothing in the source states the layers were matched,
and I did not fit anything to make them match. It is recorded as an observation with
its uncertainty attached, not as a result.

## What is still not modelled

1. **The activated-charcoal pool.** The source gives no capacity for creatinine or
   urate, so this pool places **no bound** on the lifetime here. Stage 6's
   "largest simplification" is now *narrower* but not gone — it moved from urea to
   charcoal. If charcoal exhausts before 2.64 days, the real figure is lower again.
2. **Compounds the source says are degraded by competition.** Creatinine and urate
   adsorption is stated to be compromised ~5 % by other highly-adsorbed species.
   Not applied.
3. **Urease kinetics and inhibition** (unchanged from stage 6).
4. **Residual renal function** (unchanged from stage 6).
5. **All loads are steady-state daily averages.** Real patients vary ±30–50 % in urea
   generation and have different phosphate loads, so cartridge life varies between
   patients far more than the 2.22–2.64 day range suggests. The range reflects
   *parameter* uncertainty, not *patient* variability — and the second is larger.

## Decisions needed

| # | Decision | If you do nothing |
| --- | --- | --- |
| 1 | **Is the range acceptable, or should the charcoal pool be bounded by an assumption?** No published capacity exists, so bounding it means assuming one. | Creatinine/urate remain unbounded, and the true lifetime may be shorter than 2.22 days. My view: an explicit assumed capacity, clearly flagged, beats an unbounded gap. |
| 2 | **The steady-state load assumption.** Real generation varies threefold between patients. | The cartridge-life range understates real variability. Modelling a patient distribution would widen it substantially. |
| 3 | **Continue, or stop?** | Six stages plus this correction: validated device, validated patient model, executable protocol, functional system architecture, and the consumable constraint now quantified as a range. |
| 4 | Unchanged: **a PI.** | The protocol stays unexecuted. |
