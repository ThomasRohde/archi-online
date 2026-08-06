# Capability layout evidence

The product-specific evidence harness compares the shipping frontier engine
with balanced rows across deterministic capability forests and four target
frames. It validates structural invariants, records layout hashes, metrics,
search diagnostics, and median runtime, and renders SVG/PNG review material.

Run it from the repository root after installing the lockfile dependencies:

```powershell
npm run layout:evidence -- --role improved
```

The command performs one warm-up and five measured runs per case. Generated
files are intentionally ignored under `.capability-layout-evidence/`:

- `improved/manifest.json` and `improved/benchmark.json` contain machine data;
- `review-blind.html` conceals algorithm identity and metrics for first review;
- `comparison.html` reveals starting frontier, improved frontier, and balanced
  rows at a common target-frame scale;
- per-fixture directories contain the corresponding SVG and PNG files.

For a matched before/after comparison, run the same harness and fixture source
from a temporary worktree at the baseline commit with `--role baseline`, copy
that generated `baseline/` directory beside the improved output, and rerun the
improved command. Use `--fixture <id>` for a focused profiling run; the complete
manifest is the acceptance artifact.

The evidence times are observational and machine-specific. CI asserts
determinism, correctness, and structural frontier bounds rather than brittle
wall-clock thresholds.
