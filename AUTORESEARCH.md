# Registering the Host evaluator

`dsh-autoresearch` keeps its evaluator registry **empty by default**: an agent
cannot invent an evaluator command, because that would let it choose its own
score. The registry lives in Host-owned profile configuration, so it has to be
created outside the agent loop.

> **Note on the active-loop stage.** The evaluator now scores `model/params.json`
> against `data/session_observations.csv` — the 12 observations the chooser
> actually bought. `dsh-autoresearch` cannot drive an interactive sequential loop
> by itself: it proposes parameter vectors and re-scores them, it does not ask for
> one new observation at a time. The active loop is therefore driven by the
> Host-side simulator in the sealed holdout, and this registration remains what it
> was — the static-scoring path, now pointed at the session's data.

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
            - data/session_observations.csv
            - data/dataset.json
```

Notes:

- `command` and `args` are fixed and run shell-free; `cwd` is omitted, which
  selects the isolated evaluation worktree root. `node` must be resolvable by the
  Host (verified: Node resolves under this evaluator's empty environment).
- **Only `[evaluator/judge.mjs, evaluator/pk_model.mjs]` begin with `evaluator/`** —
  they are protected by the evaluator policy. `tools/` is outside `mutable_globs`
  and is therefore rejected if a candidate touches it, but it is not hash-frozen.
- The declared `dataset` files are the **noisy** fitting target and its regimen
  metadata. The **noise-free** curve is deliberately not declared and does not
  exist in this repository: it lives in a Host-side holdout outside the worktree,
  whose location is not recorded here, so it is unreachable through any input the
  evaluator or a candidate can see. Only the Host-side external check opens it.
  Its SHA-256 is published in `data/dataset.json` so it can be audited without
  being disclosed.
- The registry is validated at load time. **An app restart is required** for the
  change to take effect; confirm with `dsh --profile <name> --dump-config` (note
  that the Electron-managed `desktop` profile refuses CLI dumps).

## 2. Run it (on a POSIX host)

From this repository — see the platform blocker above; this cannot run on win32:

```json
{
  "objective": "Minimise the Host-measured RMSE (mg/L) between the one-compartment gentamicin creatinine-clearance PK model and the 12 observations collected in the active session, by tuning only the parameters in model/params.json.",
  "run_tag": "gentamicin-crcl-fit-3",
  "evaluator_id": "gentamicin-crcl-fit",
  "mutable_globs": ["model/params.json"],
  "target": 2.4,
  "max_experiments": 20,
  "timeout_ms": 120000,
  "constraints": [
    "Keep the one-compartment structure and the linear creatinine-clearance relationship; tune numeric parameters only.",
    "clearanceAtCrcl92LPerH and volumeOfDistributionL must stay positive; crclSlopePerMlMin must stay non-negative.",
    "The data span CrCl 45-130 mL/min; do not extrapolate the linear CrCl relationship outside that range."
  ]
}
```

**`target` is 2.4 mg/L.** The observations carry the publication's residual error
(proportional 0.32 + additive 0.056 mg/L), so the achievable floor is the noise,
not numerical zero. On the reference session's 12 observations the shipped
baseline scores 4.661 mg/L and the unweighted multi-start optimum reaches
2.545 mg/L; the submitted estimate scores 2.659 mg/L, because it was produced by
the maximum-likelihood estimator rather than by minimising this RMSE. See below.

## 3. Reference values

Session-scoped, on the 12 observations in `data/session_observations.csv`:

| | RMSE (mg/L) |
| --- | --- |
| Shipped baseline `[6.0, 0.003, 40.0]` | 4.661301 |
| Unweighted multi-start optimum | 2.544927 |
| Submitted estimate (`model/params.json`) | 2.658523 |

Six widely separated restarts converge to the same unweighted optimum
(worst − best RMSE = 5.3e-15).

**Why the submitted estimate is not the RMSE optimum.** The Host-side active loop
estimates by maximum likelihood for the published error model, which is a
*different objective* from this unweighted RMSE. Over 200 seeds the ML estimator
is decisively better in the active setting — mean absolute relative error 12.6 %
versus 65.9 % for unweighted LS on the same adaptive designs — and the static
stage's ledger records the full estimator comparison. A small residual RMSE gap
against the unweighted optimum is the expected cost of that choice.

Parameter recovery, the estimator's sampling distribution, the strategy
comparison and the external check are recorded in the Host-side `LEDGER.md`; they
are kept out of this repository because reporting them here would disclose the
true parameter values.


