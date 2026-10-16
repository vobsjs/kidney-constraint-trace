# PROVENANCE

Every constant used anywhere in this repository, where it came from, and whether
it was independently checked. A reviewer should be able to audit any number in any
result from this table.

**Verification legend**

| Mark | Meaning |
| --- | --- |
| **✔ read** | I retrieved the primary source myself and read the value out of it |
| **✔ repro** | The value or equation is *reproduced* by code here against independent data |
| **~ via** | Taken from a secondary transcription of a primary source I did not open |
| **⚠ assume** | A modelling choice, not a sourced value. Exposed and sensitivity-tested. |
| **✖ unverified** | Stated but not checked. Listed so it is not mistaken for verified. |

---

## 1. Stage 1–3 — the PK benchmark

| Constant | Value | Source | Status |
| --- | --- | --- | --- |
| `clearanceAtCrcl92LPerH` | 3.44 L/h | Duong 2022, Table S2 (Bos row) | **~ via** the `nlmixr2lib` model file `Duong_2022_gentamicin_bos.R`, which cites the paper. I did **not** open the paper. |
| `crclSlopePerMlMin` | 0.00925 | same | **~ via** |
| `volumeOfDistributionL` | 22.4 L | same | **~ via** |
| Residual error | proportional 0.32 + additive 0.056 mg/L | Bos 2019, Table S1 | **~ via** the same library file |
| Veinstein per-patient clearance data | 10 patients | Veinstein 2013, Table 3, PMCID PMC3553715 | **✔ read** from the PMC full text, and the transcription was checked by recomputing the paper's own summary row (8 of 9 columns reproduce exactly; `CL_HD` does not — an inconsistency in the source, confirmed in the raw HTML) |

## 2. Stage 4 — the dialyzer

| Constant | Value | Source | Status |
| --- | --- | --- | --- |
| Counter-current clearance relation | `α = (KoA/Qb)(1 − Qb/Qd)`; `CL = Qb(e^α−1)/(e^α−Qb/Qd)` | standard urea-kinetic formulation (Michaels 1968 lineage) | **✔ repro** — reproduces published manufacturer clearances to a worst error of **0.89%** across 3 devices × 2 blood flows |
| Asahi Kasei APS-HE clearances | 3 devices × 2 flows × 5 solutes | product performance page, stated EN ISO 8637-1:2020 | **✔ read** — transcribed from the live page |
| Asahi published KoA (urea) | 1344 / 1559 / 2022 mL/min | same page | **✔ read**, and **✔ repro** — feeding these into the model returns the labelled clearances |
| Nipro ELISIO HX clearances | 6 devices × 3 flows × 5 solutes | spec sheet MM-2213 (27 Jul 2022) | **✔ read** — extracted from the PDF with a purpose-written extractor, since no PDF library was available |
| Solute molecular weights | 60 / 96 / 113 / 1355 / 5000 / 16700 Da | standard chemistry | **✖ unverified** — used only to order the solutes in one table; no result depends on the exact values |
| Measurement noise SD | 3% proportional | **none** | **⚠ assume** — bounded by the ISO 8637-1 ±10% acceptance band and by the 0.06–0.89% round-trip disagreement in the manufacturer's own data. Sensitivity tested at 1.5% / 3% / 6%; the conclusion holds at all three. **Approved by the project owner.** |
| Ultrafiltration set-points in the stage-5 test | 0–4 L | realistic clinical range | ⚠ assume |

## 3. Stage 5 — the patient, and the protocol

All patient parameters come from one paper, which I retrieved and read:

> Daugirdas JT, Depner TA. *Creatinine generation from kinetic modeling with or
> without postdialysis serum creatinine measurement: results from the HEMO study.*
> Nephrol Dial Transplant 2017;32(11):1926–1933. **PMCID PMC5837547**

| Constant | Value | Status |
| --- | --- | --- |
| Model structure | two-pool (proximal/distal) | **✔ read** |
| Urea distribution volume | 31.1 (SD 7.0) L | **✔ read** |
| proximal : distal volume ratio | 1 : 2 (1/3–2/3) | **✔ read** |
| Intercompartmental clearance, urea | **Kc = 16 × V(L) mL/min** | **✔ read** — quoted in that paper specifically for urea. The paper's own fitted value is for *creatinine* (KcCr 236 ± 57 mL/min). |
| Urea generation (as nitrogen) | 4.85 (SD 1.95) mg/min | **✔ read** |
| Cross-dialyzer urea clearance | 230 (SD 37) mL/min at 1 h | **✔ read** — and reproduced by the stage-4 device model to **0.1%**, two independent measurement traditions agreeing |
| Extrarenal creatinine clearance | 0.038 L/kg/24 h | **✔ read**, recorded, **not used** in any computation here |

### The rate equation — a case where the obvious citation was not the right one

The standard-of-care comparator throughout stage 5 is

```
spKt/V − eKt/V = a·(spKt/V / t_hours) − b,      a = 0.6,  b = 0.03
```

I originally attributed this to "Daugirdas & Schneditz" without a full reference,
which a reviewer would reject. Both the **form and both constants** were then
verified against:

> **HEMO Study Manual of Operations**, NIDDK —
> `http://repository.niddk.nih.gov/media/studies/hemo/Manual_of_Operations.pdf`

which states the equation, assigns `a = 0.6` and `b = 0.03`, and works the example
`spKt/V 1.2 over 3 h → Δ = 0.21`. **Our implementation returns 0.21 for that
example** (`estimator.mjs` self-test), so the equation is now **✔ read** and
**✔ repro**.

The manual attributes the derivation to:

> Daugirdas JT, Schneditz D. *Overestimation of hemodialysis dose depends on
> dialysis efficiency by regional blood flow but not by conventional two pool urea
> kinetic analysis.* ASAIO J 1995;41(3):M719–24. **PMID 8573901**

**PMID and citation verified** via the NCBI E-utilities (`esummary`). The paper text
itself was **not** read — only the manual's statement of the equation it derives.

The manual also states that **"equilibration is almost always complete by 60
minutes"** — relevant because the protocol's fourth draw is at 30 min. That is
defensible not because 30 min is equilibrated, but because the analysis **models**
the rebound and therefore does not need the sample to be at equilibrium.

### Assumptions in stage 5, all exposed

| Assumption | Value | Sensitivity |
| --- | --- | --- |
| BUN assay noise SD | 2% proportional | tested at 1% / 2% / 4%; protocol ordering stable. **Approved by the project owner.** |
| Session length | 240 min (4 h) | model swept 3–5 h |
| Interdialytic interval | 44 h | standard thrice-weekly schedule |
| Sieving coefficient, urea | 1 | urea is small; not independently verified |
| Between-patient CV in Kc, for the sample size | 35% | **✔ reported as a sweep** (0% / 20% / 35% / 50%), not as a single value |
| Protocol target n | 20 sessions, extend to 60 if observed SD > 0.18 | pre-specified, **approved** |

## 3b. Reference downloads: deliberately not carried into the repository

Verifying the rate equation required downloading the HEMO Study Manual of
Operations. The cached copies — the 3 MB manual PDF, its extracted text, and the
PMC page for the HEMO kinetics paper — are **not** committed, because they are
public, re-fetchable, and would dominate the repository's size. Their URLs are
recorded above; the *conclusion* drawn from them is checked by
`dialysis_session/estimator.mjs`, whose self-test reproduces the manual's worked
example (`spKt/V 1.2 over 3 h → gap 0.21`). That check runs in
`tools/verify_all.mjs`, so the evidence is reproducible even without the downloads.

---

## 4. What is validated, assumed, and unverified — in one place

**Validated against real, independent measurement**

- the counter-current device model, against 120 published EN ISO 8637-1:2020
  clearances from two manufacturers (worst error 0.89%);
- the device model against a *clinical* measurement: the HEMO cross-dialyzer urea
  clearance of 230 mL/min, reproduced to 0.1%;
- the Daugirdas–Schneditz rate equation, against the HEMO manual's own worked
  example.

**Assumed, and sensitivity-tested**

- both measurement-noise SDs (3% dialyzer, 2% BUN);
- the two-pool exchange parameter for urea (`Kc = 16×V`), which stage 5's
  ultrafiltration test **localised as the likely source of a known discrepancy** —
  the model matches the published correction at `Kc ≈ 24×V` instead.

**Stated but unverified**

- solute molecular weights (§2);
- the ASAIO 1995 primary text (only the manual's statement of its result was read);
- the Duong 2022 and Bos 2019 papers themselves (their parameter values here come
  from a curated secondary transcription).

**Added in stages 6–9, and weaker than the above**

- the sorbent pool capacities: **single-source**, one published characterisation,
  never replicated (§5);
- the charcoal creatinine capacity: **an assumption I invented**, because no
  citable figure exists in the accessible literature (§6) — this is the single
  weakest number in the package;
- the electrochemical energy requirement: **not sourced at all**, stated only as a
  derived requirement of ≤ 11.4 kWh/kg (§7);
- **no hardware has ever been built or measured by this project.**

**Never done**

- the model has never been confronted with a real patient's measured BUN
  trajectory;
- no real dialyzer has been measured by us;
- nothing here has been reviewed by a clinician or an ethics committee.

## 5. Stages 6–7 — the sorbent cartridge

Source: a published REDY sorbent-cartridge characterisation (UNSW). Values are as
read from that document; its OCR was imperfect in places, noted where it mattered.

| Constant | Value | Status |
| --- | --- | --- |
| D3150 urea capacity | **43.7 g** computed; table gives min **42.9**, avg **53.6** | **✔ read** — the computed figure agrees with the table |
| Urea → ammonium stoichiometry | **2 NH4+ per urea** | **✔ derived**, and it resolves the arithmetic: 43.7 g = 727.6 mmol = 1455 mEq = 145.9 mEq × 10 |
| ZP ammonium capacity | 1.42–1.66 mEq/g; **1.47 measured** | **✔ read** |
| ZP total cation capacity | 3.80 ± 1.14 mEq/g (Na 2.80 ± 0.87, H 1.00 ± 0.34) | **✔ read** — but the source states it is *not* applicable under dialysis conditions |
| ZP operative capacity | **1.90 mEq/g**, derived from 188.3 mEq used of a 99.1 g bed | **✔ derived** |
| HZO/alumina anion complement | **80–113 mEq** | **✔ read** — published as a range, which is why lifetimes are ranges |
| Measured ammonium / other cations | 145.9 / 42.4 mEq (1/10 scale) | **✔ read** |
| Urea carbon → bicarbonate | **27%** | **✔ read** |
| Sulphate net uptake | **0** after 90 min (displaced by bicarbonate) | **✔ read** — excluded from the load |
| REDY recirculating loop volume | **5.5 L** | **✔ read** |
| Urea generation | **15.0 g/day** | **✔ read** (HEMO, verified in stage 5) |

**Caution:** every value here rests on **one** published characterisation, never
independently replicated. Treat the pool *structure* as well-grounded and the exact
capacities as single-source.

## 6. Stage 8 — patient variability and the charcoal assumption

| Constant | Value | Status |
| --- | --- | --- |
| Urea generation, between patients | **4.85 ± 1.95 mg N/min** (CV 40%) | **✔ read** — HEMO. The only *measured population spread* in the package |
| Charcoal mass | 249 g | **⚠ assume** — the source gives 24.9 g at 1/10 scale; **the ×10 scaling is mine** |
| Creatinine generation | 1400 mg/day | **⚠ assume** — 20 mg/kg/day × 70 kg; no source |
| Charcoal creatinine capacity | 10–50 mg/g | **⚠ assume** — **no citable figure exists in the accessible literature.** The package's weakest number |
| Charcoal requirement (derived) | **≥ 14.8 mg/g** to outlast 2.64 days | **✔ derived** — needs no assumption |

## 7. Stage 9 — the power limit

| Constant | Value | Status |
| --- | --- | --- |
| Resting whole-body VO₂ | 250 mL/min | **✔ standard physiology** |
| Renal share of VO₂ | 7–10% | **✔ standard physiology** |
| Oxidative energy | 20.1 kJ per litre O₂ | **✔ standard physiology** |
| **Renal power budget** | **5.9–8.4 W (mid 7.1 W)** | **✔ derived** |
| Li-ion pack energy density | 250 Wh/kg | **✔ typical published value** |
| Wearable reference device | <5 kg, 400 mL water, sorbent, NCT02280005 | **✔ read** — Gura's WAK, reached clinical trials |
| Electrochemical energy per kg urea | **NOT SOURCED** | **✖ none claimed** — the NSF PAR copy was unreachable and one open-access PDF was CID-glyph encoded. Stated as a *requirement* (≤ 11.4 kWh/kg), never a measurement |
