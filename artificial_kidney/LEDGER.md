# LEDGER — STAGE 6: from a device to a functional artificial kidney

Repository: `<repo>`
Stage directory: `artificial_kidney/`

---

## 0. The transfer question, answered BEFORE any work

> *Is this moving toward a real biological system and toward replacing renal
> function, or spinning inside the dialyzer benchmark's internals?*

**My answer then, and it held.** Decomposing a dialyzer into "filtration module +
housing + pump" would have been taxonomy. The reason this stage is not that:

**The dialyzer is an open loop, and the open loop is why dialysis is intermittent.**
Stages 4–5 modelled blood in, dialysate bought fresh and discarded, ~360 L/week.
A kidney filters ~180 L/day and reabsorbs ~99 % of it. Intermittency is the
defining functional difference between dialysis and a kidney, and the module that
removes it is **regeneration**.

So the test I set myself was: does adding regeneration produce a **system-level
property the single device cannot have**? If not, I said I would not do it. It
does (§4, CHECK 3 and CHECK 4).

**Rejected alternatives:** modelling the sorbent chemistry in more detail without
closing the loop (would have been the box, not the system); extending the dialyzer
further (explicitly ruled out by the brief).

## 1. Decisions

### D31 — Decompose by FUNCTION, not by hardware

**Decision.** Three modules: filtration, regeneration, compartment — matching
glomerular filtration, tubular reabsorption, and the body fluid compartments.

**Rationale.** A hardware decomposition ("dialyzer, pump, monitor") is an
equipment list. A kidney is not decomposed that way. Functional decomposition also
made the boundary checkable: filtration and compartment are *imported* from stages
4 and 5, not rewritten, so the composition is real.

### D32 — Regeneration is the module to build

**Decision.** Build the sorbent regeneration module rather than a secretion module
or a control module.

**Rationale.** Regeneration is the only one of the three that changes a
*system-level property* (continuity). A secretion module would have addressed a
clearance gap; a control module would have modelled a controller. Regeneration is
what converts an intermittent treatment into a continuous one, and it is what every
wearable artificial kidney programme is actually blocked on.

### D33 — Ground it in the REDY literature, and fit nothing

**Decision.** Take the cartridge capacity (43.7 g urea), the sorbent exchange
capacity (3.80 mEq/g) and the loop volume (5.5 L) from the published REDY record,
and take the generation rate (15.0 g/day) from the HEMO value already verified in
stage 5.

**Rationale.** Capacity and generation are *both* published. Their ratio gives the
cartridge lifetime with **nothing fitted** — which is why CHECK 1 is a real
validation rather than a calibration.

### D34 — Sharp breakthrough, not gradual decay

**Decision.** The cartridge strips everything from the dialysate it processes
until capacity is exhausted; no efficiency decay term.

**Rationale (and this was a correction).** My first implementation decayed
efficiency linearly with loading, which produced a loop concentration creeping up
from day 1. That contradicts the source, which describes removal that is constant
through the run and then breaks through. A packed ion-exchange bed has a **sharp
front**. I changed the model to match the physics, and the sharper model produced
a *more* interesting result (§4, CHECK 2): the failure is undetectable from the
concentration until it is already happening.

## 2. Two bugs worth recording

**B1 — a units error that inverted the physics.** The loop balance computed
`CL × gradient × dt` with CL in mL/min and the concentration in mg/L, giving a
result 1000× too large. The cartridge saturated in seconds and the "effective
clearance" came out **negative** (−4655 mL/min). The tell was a cumulative removal
of **−6,824,486 g** against a 43.7 g cartridge. Verified fixed by checking the
loop's steady-state concentration against the analytic value `influx / Qd`.

**B2 — a threshold borrowed from garbled OCR.** I first defined breakthrough from
an ammonium threshold quoted in the source, but the OCR was ambiguous about its
units and the resulting threshold fired at minute 2. Replaced with a
**model-internal** definition (95 % cartridge utilisation), and the source's
threshold is no longer claimed anywhere.

## 3. What the stage produced

**CHECK 1 — capacity reproduces.** Cartridge loads to **43.70 g** exactly; 95 %
utilisation at **2.78 days** against a mass-balance prediction of **2.92 days**
(4.8 % apart; the gap is the 5 % the threshold leaves unused).

**CHECK 2 — failure is abrupt and invisible in advance.** Loop holds
**8.8 mg N/L** for two days (analytic 9.7 = influx ÷ dialysate flow), then runs
away: day 3 → 102, day 5 → 2642 mg N/L.

**CHECK 3 — the system-level result.** Closing the loop reduces the required
dialyzer clearance from **231.9 to 16.6 mL/min (14×)** and the dialysate inventory
from 360 L/week to 5.5 L — **but the cartridge demand is unchanged**, at 2.4 per
week, because it is set by generation alone.

> **A continuous artificial kidney is a sorbent-materials problem. Dialyzer
> optimisation cannot touch it.**

This is the finding that justified the stage: no amount of further work on the
stage-4 device could have produced it, because the device is not the limiter.

**CHECK 4 — the physiological payoff.** Peak-to-trough BUN swing falls from
**44.8 to 0.0 mg/dL** at matched weekly clearance. A kidney holds BUN roughly
constant; intermittent dialysis structurally cannot; a closed loop can.

## 4. What was not done

1. **Only urea competes for the cartridge.** Potassium, phosphate, sulphate and
   bicarbonate all consume sorbent capacity, and the source documents that they
   displace one another. 43.7 g is a urea-only capacity, so **the true cartridge
   lifetime is shorter than the 2.9 days claimed here.** This is the largest
   simplification in the stage and it makes the headline number optimistic.
2. **No urease kinetics or inhibition**, which the source notes varies between
   cartridges and is irreversibly poisoned by heavy metals.
3. **No residual renal function**, which would extend the cartridge in reality.
4. **The continuous case is steady state, not a simulated transition.** It gives
   the swing result exactly but does not model switching a patient from
   intermittent to continuous therapy.
5. **No hardware.** Everything is computed from published capacities plus the
   previously validated modules.

## 5. Decisions needed

| # | Decision | If you do nothing |
| --- | --- | --- |
| 1 | **Is the urea-only cartridge capacity acceptable as the headline, or should the competing-species load be modelled?** | The 2.9-day lifetime stays optimistic, and CHECK 3's "2.4 cartridges per week" understates the real consumable demand. My view: this is the one simplification worth fixing if the stage continues. |
| 2 | **Does this stage continue, or does the project stop?** The module architecture exists and the system-level question is answered. | The project rests at six stages: a validated device, a validated patient model, an executable protocol, and now a functional artificial-kidney architecture with its binding constraint identified. |
| 3 | Unchanged from stage 5: **a PI.** | The protocol stays unexecuted. Nothing in stage 6 changes that. |
