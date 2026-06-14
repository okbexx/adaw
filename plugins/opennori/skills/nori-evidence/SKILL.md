---
name: nori-evidence
description: Record, prune, and judge reviewable OpenNori evidence for acceptance criteria while preserving agent freedom to choose verification methods. Use when the user says to attach a validation, confirms behavior, waives a gap, asks why an AC is passing, or says evidence is stale, invalid, or insufficient.
---

## Mission

Make acceptance status reviewable without forcing the agent into fixed verification adapters.

Evidence should let a human understand what was checked, where to inspect it, what it proves, what it does not prove, and how much confidence it deserves.

## Start Here

1. Read resume/status to identify the current criterion and latest evidence.
2. If existing evidence no longer proves the current AC, prune it before relying on status/report/context.
3. Choose a verification method that fits the AC and risk: command output, test, browser check, screenshot, diff, report, artifact, URL, log, human confirmation, waiver, or another reviewable signal.
4. Record basis, sources, reviewability, confidence, and limitations.
5. Rerun status/report when the evidence affects completion.

Useful state commands:

- `opennori evidence add --root <repo> --criterion <id> --kind <kind> --summary "..." --result <passing|failing|blocked|waived> --basis <basis> --reviewability "..." --limitations "..." --json`
- Add sources with `--source-command "<command>"`, `--source-path "<path>"`, `--source-url "<url>"`, or `--source "<label or JSON>"`.
- `opennori evidence prune --root <repo> --criterion <id> --reason "..." --json`

## Natural-Language Mapping

- "Attach this test result" -> record command/test evidence with the command and what output means.
- "Use this screenshot/report" -> record artifact evidence with a path or URL and review instructions.
- "I confirmed it works" -> record human confirmation, including what the human confirmed.
- "Waive this AC" -> record waiver evidence with the user's stated reason and limitation.
- "This evidence is stale" -> prune stale evidence and make the AC eligible to become the current gap again.
- "Why is AC-2 passing" -> summarize latest supporting evidence, basis, sources, confidence, and limitations.

## Evidence Quality

- High-risk passing evidence should not rely only on agent self-summary.
- Weak evidence may still be useful, but report it as lower confidence or review risk.
- Multiple sources can support one AC; combine them when they describe the same user-facing result.
- Obsolete evidence should not occupy active report or context just to preserve history.

## State Writes

May write or prune evidence records for active criteria. Do not rewrite Product AC, Architecture Baseline, Nori Profile, or reports directly.

## Handoffs

- If the AC itself is too vague to prove, hand off to `nori-acceptance`.
- If evidence violates required Skill or stack preferences, hand off to `nori-capability-profile`.
- If the verification exposes architecture drift, hand off to `nori-architecture-challenge`.
- After material evidence changes, hand off to `nori-reporting`.

## User Reply Shape

Report evidence in this shape:

```text
Criterion: AC-...
Result: passing / failing / blocked / waived
Basis: ...
Sources: ...
Reviewability: ...
Limitations: ...
Next: ...
```

## Misuse Guards

- Do not force evidence into a fixed adapter taxonomy.
- Do not disguise agent judgment as tool observation or human confirmation.
- Do not keep missing, stale, invalid, or semantically obsolete evidence in the active completion story.
- Do not mark high-risk AC passing with only summary-only evidence unless the user explicitly accepts that risk.
