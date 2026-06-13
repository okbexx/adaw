# evidence-health-audit Build-vs-Buy Decision

Area: evidence-health
Need: Warn when a complete-looking OpenNori goal relies on stale, summary-only, or bulk-template evidence
Recommendation: self-build

## Summary

Reuse OpenNori's existing evidence ledger fields to audit evidence health without forcing adapters: created_at, sources, reviewability, limitations, basis, confidence, and summary patterns are enough for first-pass warnings.

## Candidates Checked

- Current project: src/core/evidence.ts normalizes evidence and evidence health; src/core/report.ts plus src/cli/commands/check.ts expose evidence metadata in report/check surfaces.
- Standard library: Node built-ins are sufficient; no parser or database is needed.
- Official SDK: No official SDK applies to OpenNori's evidence semantics.
- Open source: Generic validation libraries would not understand OpenNori's human acceptance evidence semantics; schema libraries can be revisited if evidence schemas grow.

## Self-build Reason

Evidence health is OpenNori product-domain semantics. The audit should stay flexible and warn on review risk without turning evidence into a fixed adapter taxonomy.
