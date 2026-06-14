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
Lead with completion state, current gap, architecture decision, evidence health, evidence basis, and required human intervention.
After reporting, follow `next_recommendation` / `next_actions` when the user has asked to continue, instead of asking the user what the next step is.
Summarize implementation details only as supporting evidence.
Report Product decision and Architecture decision separately.
Never report confidently complete unless all required ACs and blocking Nori Profile items are passing or waived, `profile_review` is clear or accepted by the user, `evidence_health` is clear, `architecture_review` is clear or accepted by the user, and `build_vs_buy` is healthy or accepted as a review risk.
If completion is `objective_complete: true` with `confidence: review-risk`, say exactly which review risks remain and keep `current_gap` separate from those risks.
Do not describe Architecture Baseline or build-vs-buy findings as Product AC failures unless they were explicitly written as user-facing criteria by the user.
