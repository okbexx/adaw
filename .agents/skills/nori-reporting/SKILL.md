---
name: nori-reporting
description: Summarize OpenNori status, reports, current gaps, user intervention, and acceptance evidence for humans.
---

## When to use
Use when the user asks whether work is complete, what remains, what they need to do, what changed, or asks for an OpenNori report.

## Commands
- Resume: `opennori resume --root <repo> --json`.
- Next gap: `opennori next --root <repo> --json`.
- Status: `opennori status --root <repo> --json`.
- Report: `opennori report --root <repo> --json`.
- Changes: `opennori changes --root <repo> --json`.
- List goals: `opennori list --root <repo> --json`.

## Rules
Lead with completion state, current gap, evidence basis, and required human intervention.
After reporting, follow `next_recommendation` / `next_actions` when the user has asked to continue, instead of asking the user what the next step is.
Summarize implementation details only as supporting evidence.
Never report complete unless all required ACs and blocking Nori Profile items are passing or waived.
