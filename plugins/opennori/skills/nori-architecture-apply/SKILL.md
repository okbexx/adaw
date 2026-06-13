---
name: nori-architecture-apply
description: Apply the confirmed OpenNori Architecture Baseline before implementing acceptance gaps.
---

## When to use
Use before implementing or modifying code for a non-trivial OpenNori active goal, especially after `opennori resume` or `opennori status` reports architecture state.

## Commands
- Inspect current state: `opennori status --root <repo> --json`.
- Inspect baseline: `opennori architecture show --root <repo> --json`.
- Export full context for review tools: `opennori context export --root <repo> --json`.

## Rules
Read `.opennori/architecture/baseline.md` and the current Product AC before code changes.
Implement only acceptance gaps that are compatible with the confirmed baseline.
If the baseline is missing for an active non-trivial goal, use `nori-architecture-brainstorm` before implementation.
If project evidence conflicts with the baseline, use `nori-architecture-challenge`; do not silently change technology stack, directory boundaries, dependency policy, or state model.
Keep Product AC and Architecture Checks separate in explanations and reports.
