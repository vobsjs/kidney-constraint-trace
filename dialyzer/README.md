# Stage 4 — the artificial kidney: dialyzer mass-transfer identification

The previous three stages modelled a **patient** (a drug's disposition, with renal
clearance tied to creatinine clearance). This stage models the **device**: a
haemodialyzer, the artificial kidney itself.

The physical object is a counter-current membrane exchanger. Its entire diffusive
behaviour is governed by **one** parameter, `KoA` — the mass-transfer-area
coefficient — and the operating conditions the machine imposes, blood flow `Qb`
and dialysate flow `Qd`:

```
alpha = (KoA / Qb) * (1 - Qb / Qd)
CL    = Qb * (exp(alpha) - 1) / (exp(alpha) - Qb / Qd)
```

**Task.** A dialyzer of unknown `KoA` is on the bench. Choose operating points
`(Qb, Qd)`, one at a time, and recover `KoA` from a budget of **8 clearance
measurements**.

---

## 1. Why this is closer to a real experiment

This is not a model of a model. It is the same measurement manufacturers actually
perform: **in-vitro clearance under EN ISO 8637-1:2020**, from which the published
`KoA` values are derived. The operating points here (Qb 150–400, Qd 200–800
mL/min) are the real clinical range, and the reference data in
`data/manufacturer_clearances.json` is the published result of running exactly
this protocol.

## 2. Grounding — real data, two manufacturers

`data/manufacturer_clearances.json` transcribes **120 published in-vitro clearance
values**: 9 dialyzers from 2 independent manufacturers (Asahi Kasei APS-HE, Nipro
ELISIO HX) × up to 3 blood flows × 6 solutes spanning **60 Da (urea) to 16 700 Da
(myoglobin)**.

`tools/validate_against_manufacturers.mjs` tests the model against it:

| Check | Result |
| --- | --- |
| **Q1 forward** — does published `KoA` reproduce published urea clearance? | worst error **0.89%**, typically **<0.15%**, across 3 devices × 2 flows |
| **Q2 inverse** — is `KoA` the same whichever flow it is derived from? | median cross-flow spread **4.48%** over 43 device-solute pairs; 19 pairs exceed 5% |
| **Q3 transfer** — one model, 60 Da to 16 700 Da? | `KoA` falls monotonically with molecular size: urea 1395, creatinine 1089, phosphate 846, vitamin B12 388, inulin 200, myoglobin 151 mL/min |

## 3. The finding that makes this a design problem

`Q4` maps the elasticity `d ln CL / d ln KoA` over the operating grid. It spans
**0.0029 to 0.0976 — a 33× range.**

Two blind regions, for two different physical reasons:

- **low `Qb`**: clearance approaches `Qb`; the blood is already fully cleared in
  one pass, so the membrane can no longer be rate-limiting;
- **`Qd ≤ Qb`**: the dialysate saturates and clearance approaches `Qd`.

The parameter is visible only at **high `Qb` with `Qd` comfortably above `Qb`.**
This reverses the naive intuition that a low dialysate flow gives the solute "more
time to transfer" — at `Qd < Qb` it is the dialysate that saturates, not the
membrane.

Because the information landscape is this non-uniform, *where* you spend a
measurement matters enormously. That is the opposite of the pharmacokinetic stage,
where D-optimality saturated after three points and active selection could not beat
a good fixed design.

## 4. Result

200 seeds × 5 true `KoA` values drawn from real device-solute values across the
published tables (large-solute through urea range, a ~7.7-fold span) × 4 designs ×
8 measurements, all designs sharing the same noise realisation per seed (paired).
Measurement noise proportional, SD 3%.

| design | median error | mean error | within 10% | within 5% |
| --- | --- | --- | --- | --- |
| random8 | 2.78% | 4.03% | 91.2% | 70.9% |
| uniform8 | 2.36% | 3.28% | 95.4% | 78.3% |
| **active8** | **1.81%** | **2.71%** | **96.9%** | **85.1%** |
| oracle8 (knows the truth) | 1.82% | 2.71% | 96.7% | 84.9% |

**Endpoint: recover `KoA` within ±10% from 8 bench measurements — achieved in
96.9% of runs.**

Paired tests on per-run error:

| comparison | difference | t | p |
| --- | --- | --- | --- |
| active8 vs **uniform8** | **17.4% lower** | −6.49 | **8.7e-11** |
| active8 vs **random8** | **32.9% lower** | −11.1 | < 1e-300 |
| active8 vs oracle8 | 0.3% lower | −0.61 | 0.55 |

**The sequential rule reaches the oracle's performance without knowing the answer.**
Verified rather than assumed: the active rule picks a *different order* than the
oracle (it opens with 400/800 where the oracle would open with 400/500) but
converges on the same set of eight points, from a prior of `KoA = 1000` that is
wrong by 30–560%.

Unlike the pharmacokinetic stage, **active selection beats a fixed lattice
significantly here** — because the information landscape is 33× non-uniform
instead of saturating.

## 5. Robustness to the one unsourced parameter

Measurement noise is the one input I could not source as a published SD. It is
modelled as proportional with SD 3%, bounded by the ISO 8637-1 ±10% acceptance
band. The conclusion does not depend on it:

| σ | active mean error | uniform mean error | active advantage | endpoint (active / uniform) |
| --- | --- | --- | --- | --- |
| 1.5% | 1.32% | 1.72% | 23.3% lower | 100.0% / 99.8% |
| **3.0%** | **2.71%** | **3.28%** | **17.4% lower** | **96.9% / 95.4%** |
| 6.0% | 5.42% | 6.91% | 21.6% lower | 84.8% / 76.4% |

## 6. Transferability

Unlike the pharmacokinetic benchmark — which is about one drug in one population —
this transfers directly and without modification to other renal problems, because
the model has exactly one device-solute parameter:

- **other solutes** — demonstrated here across 60 Da to 16 700 Da; only `KoA` changes;
- **other devices** — demonstrated across 9 dialyzers from 2 manufacturers;
- **other modalities** — haemodiafiltration adds a convective term with a sieving
  coefficient (the excluded HDF columns of the source tables); peritoneal dialysis
  replaces `KoA` with a peritoneal-equivalent mass-transfer-area coefficient in the
  same three-pore formalism;
- **clinical dosing** — `KoA` feeds the prescribed `Kt/V` through
  `Kt/V = CL·t/V`, so a `KoA` error propagates straight into dialysis dose.

## 7. Files

| Path | Role |
| --- | --- |
| `dialyzer_model.mjs` | the counter-current model (frozen) |
| `data/manufacturer_clearances.json` | 120 real published clearance values, 2 manufacturers |
| `tools/validate_against_manufacturers.mjs` | Q1–Q4 checks against that data |

The sealed benchmark (true `KoA`, noise realisation, designs, comparison) lives in
the Host-side holdout outside this repository, alongside `LEDGER.md`.
