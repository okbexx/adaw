---
name: adaw-reporting
description: Summarize ADAW status, reports, current gaps, user intervention, and acceptance evidence for humans.
---

## When to use
Use when the user asks whether work is complete, what remains, what they need to do, what changed, or asks for an ADAW report.

## Commands
- Resume: `adaw resume --root <repo> --json`.
- Next gap: `adaw next --root <repo> --json`.
- Status: `adaw status --root <repo> --json`.
- Report: `adaw report --root <repo> --json`.
- Changes: `adaw changes --root <repo> --json`.
- List goals: `adaw list --root <repo> --json`.

## Rules
Lead with completion state, current gap, evidence basis, and required human intervention.
Summarize implementation details only as supporting evidence.
Never report complete unless all required ACs and blocking Capability Profile items are passing or waived.
