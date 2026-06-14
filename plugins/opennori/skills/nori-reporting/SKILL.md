---
name: nori-reporting
description: Explain OpenNori status, current gaps, completion decisions, user intervention, reports, changes, and context export in human terms. Use when the user asks whether work is complete, what remains, what changed, what they need to do, or how to continue after a completed goal.
---

## Mission

Give the user a concise acceptance-centered answer: what goal is being judged, what gap remains, whether the user must act, whether the goal is complete, and what should happen next.

Reporting is not an implementation diary.

## Start Here

1. Run the narrowest status command that answers the user.
2. Prefer resume/status for current state, report for a durable human report, changes for diff grouping, and context export when another tool needs review context.
3. Read completion, current_gap, acceptance_review, evidence_health, profile_review, architecture decision, build_vs_buy health, and next_recommendation.
4. If the user asked to continue, follow next_recommendation instead of stopping at a status dump.

Useful state commands:

- `opennori resume --root <repo> --json`
- `opennori next --root <repo> --json`
- `opennori status --root <repo> --json`
- `opennori report --root <repo> --json`
- `opennori changes --root <repo> --json`
- `opennori list --root <repo> --json`
- `opennori context export --root <repo> --json`

## Natural-Language Mapping

- "Is it done" -> answer from completion and required AC evidence.
- "What remains" -> identify current_gap and any review risks separately.
- "What do I need to do" -> report user intervention only, not implementation chores.
- "What changed" -> group OpenNori acceptance artifacts separately from implementation files.
- "Generate report" -> create/read the OpenNori report and summarize the decision.
- "Continue" after a complete goal -> inspect `candidate_goals`, choose or refine the strongest human-facing next goal, then hand off to `nori-acceptance`.
- "Export for review" -> use context export and state what the reviewer can inspect.

## State Writes

May generate reports, changes output, or context exports. Do not mutate Product AC, evidence, profile, architecture, or lifecycle state.

## Handoffs

- Current gap lacks evidence -> `nori-evidence`.
- AC is vague or acceptance review has unresolved findings -> `nori-acceptance`.
- Profile risk remains -> `nori-capability-profile`.
- Architecture or build-vs-buy risk remains -> architecture Skills or `nori-build-vs-buy`.
- Project is unhealthy -> `nori-project-health`.
- Ready for next loop -> `nori-acceptance` with a selected candidate goal.

## User Reply Shape

Lead with:

```text
Goal: ...
Current gap: ...
Need user: yes/no
Decision: ...
Next: ...
```

Then add short evidence or risk bullets only when they affect acceptance.

## Misuse Guards

- Do not report confident completion unless required AC are passing or waived, blocking profile items are satisfied or waived, evidence health is clear or accepted, and architecture/build-vs-buy review risks are clear or accepted.
- Do not merge Product decision and Architecture decision.
- Do not describe implementation details as the main progress signal.
- Do not treat candidate goals as approved AC, phases, task lists, or evidence.
- Do not hide review-risk completion behind a simple "done".
