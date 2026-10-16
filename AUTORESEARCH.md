# Registering the Host evaluator

`dsh-autoresearch` keeps its evaluator registry **empty by default**: an agent
cannot invent an evaluator command, because that would let it choose its own
score. The registry lives in Host-owned profile configuration, so it has to be
created outside the agent loop.

## Status: REGISTRATION LIVE — RUN BLOCKED BY A PLUGIN PLATFORM LIMIT

The row below was merged into `$DSH_HOME/profiles/desktop/cordis.patch.yml` and was
validated by loading the plugin's own `Config`/`resolveConfig`/`evaluatorRegistry`
and resolving `gentamicin-crcl-fit`; an unknown id is correctly rejected.

After restarting, the registration was confirmed **live end to end**: the run was
launched and `evaluator_id: gentamicin-crcl-fit` **resolved successfully**. It then
failed one stage later, before any experiment ran:

```
state root must not be accessible by group or other users
```

**Cause — a win32 platform incompatibility in the plugin, not in this benchmark.**
`StateLayout.open()`/`inspect()` reject any directory where
`(info.mode & 0o077) !== 0`. On Windows, Node reports *every* directory as `0o666`
and `chmod()` is a no-op, so the condition is **unsatisfiable**. Calling
`StateLayout.open()` on a freshly created empty temp directory fails identically:

```
platform: win32 | getuid: undefined
open() FAILED -> StateLayoutError: state root must not be accessible by group or other users
```

`dsh-autoresearch` v0.0.1 therefore cannot run on Windows at all; its safety
documentation is Linux-oriented throughout (crash recovery already "requires Linux
`/proc` evidence"). Making it run on this host would mean modifying third-party
code — porting the check to an NTFS ACL test, or skipping it on win32 — which was
declined in favour of the local reference optimizer.

**To run the real loop:** use WSL/Linux, where the plugin works as designed. This
repository is pure Node with no Windows-specific dependencies, so it ports as-is
(`model/params.json`, `evaluator/`, `data/` all use relative paths).

**To undo the registration:** restore
`<temp-backup>` over
`$DSH_HOME/profiles/desktop/cordis.patch.yml`, or delete the `autoresearch` row.

## 1. The registered row

A profile override **replaces the whole row config**, so the shipped deployment
defaults from `dsh-autoresearch/cordis.patch.yml` are restated in full rather than
relying on partial-merge behaviour.

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

## 2. Run it (on a POSIX host)

From this repository — see the platform blocker above; this cannot run on win32:

```json
{
  "objective": "Minimise the Host-measured RMSE (mg/L) between the one-compartment gentamicin creatinine-clearance PK model and the frozen literature reference points, by tuning only the parameters in model/params.json.",
  "run_tag": "gentamicin-crcl-fit-1",
  "evaluator_id": "gentamicin-crcl-fit",
  "mutable_globs": ["model/params.json"],
  "target": 0.0001,
  "max_experiments": 20,
  "timeout_ms": 120000,
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
| Shipped baseline | 5.592262 |
| Optimum (`tools/reference_optimizer.mjs`) | 2.6970e-7 |
| Published parameters, evaluated directly | 3.12e-7 |

The local optimizer reaches a marginally lower RMSE than the published parameters
because it also absorbs the CSV rounding; its fitted values round to the published
values at six significant figures. See `results/reference_fit.json`.

