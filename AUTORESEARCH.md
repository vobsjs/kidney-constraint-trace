# Registering the Host evaluator

`dsh-autoresearch` keeps its evaluator registry **empty by default**: an agent
cannot invent an evaluator command, because that would let it choose its own
score. The registry lives in Host-owned profile configuration, so it has to be
created outside the agent loop.

## 1. Register the evaluator

Add this row to `$DSH_HOME/profiles/desktop/cordis.patch.yml` (merging it into the
existing top-level list; a profile override **replaces the whole row config**, so
the minimal row below is only valid if it is the only `autoresearch` row).

```yaml
- id: autoresearch
  name: dsh-autoresearch
  config:
    defaultMaxExperiments: 20
    defaultTimeoutMs: 900000
    evaluatorRegistrations:
      - id: gentamicin-crcl-fit
        command: node
        args: [evaluator/judge.mjs]
        metricName: rmse_mg_l
        metricDirection: minimize
        metricParserVersion: final-line-json-v1
        evaluatorFiles: [evaluator/judge.mjs, evaluator/pk_model.mjs]
        dataset:
          kind: local
          files:
            - data/reference_points.csv
            - data/dataset.json
```

Notes:

- `command` and `args` are fixed and run shell-free; `cwd` is omitted, which
  selects the isolated evaluation worktree root. `node` must be resolvable by the
  Host (verified: Node resolves under this evaluator's empty environment).
- **Only `[evaluator/judge.mjs, evaluator/pk_model.mjs]` begin with `evaluator/`** —
  they are protected by the evaluator policy. `tools/` is outside `mutable_globs`
  and is therefore rejected if a candidate touches it, but it is not hash-frozen.
- The registry is validated at load time. **An app restart is required** for the
  change to take effect; confirm with `dsh --profile <name> --dump-config` (note
  that the Electron-managed `desktop` profile refuses CLI dumps).

## 2. Run it

From this repository:

```json
{
  "objective": "Minimise the Host-measured RMSE (mg/L) between the one-compartment gentamicin creatinine-clearance PK model and the frozen literature reference points, by tuning only the parameters in model/params.json.",
  "run_tag": "gentamicin-crcl-fit-1",
  "evaluator_id": "gentamicin-crcl-fit",
  "mutable_globs": ["model/params.json"],
  "target": 0.0001,
  "max_experiments": 20,
  "constraints": [
    "Keep the one-compartment structure and the linear creatinine-clearance relationship; tune numeric parameters only.",
    "clearanceAtCrcl92LPerH and volumeOfDistributionL must stay positive; crclSlopePerMlMin must stay non-negative."
  ]
}
```

`target` = 1e-4 mg/L is reachable but non-trivial: the reference CSV is rounded to
six decimals, so the rounding floor is ~3.1e-7 mg/L RMSE.

## 3. Reference values

| | RMSE (mg/L) |
| --- | --- |
| Shipped baseline | 5.5923 |
| Published parameters (optimum) | 3.12e-7 |
