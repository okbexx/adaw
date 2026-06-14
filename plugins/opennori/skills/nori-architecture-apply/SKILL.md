---
name: nori-architecture-apply
description: Apply a confirmed OpenNori Architecture Baseline while implementing acceptance gaps. Use before non-trivial code changes when an active goal has architecture state, when resuming implementation in a new session, or when the agent must ensure Product AC work stays aligned with the baseline.
---

## Mission

Keep implementation work inside the architecture the user accepted, while still advancing the current Product AC gap.

This Skill is for agent behavior during implementation. It is not an architecture design Skill and not a reporting Skill.

## Start Here

1. Run `opennori status --root <repo> --json` and identify current Product AC gap.
2. Run `opennori architecture show --root <repo> --json` or read `.opennori/architecture/baseline.md`.
3. Compare the intended code change with baseline principles, directory boundaries, dependency policy, preferred libraries, avoid rules, and build-vs-buy policy.
4. If the change fits, implement only the current acceptance gap.
5. If it conflicts, stop implementation and create an Architecture Challenge.

Useful state commands:

- `opennori status --root <repo> --json`
- `opennori architecture show --root <repo> --json`
- `opennori context export --root <repo> --json`

## Natural-Language Mapping

- "Continue implementation" -> read current gap and baseline before editing.
- "Use the established architecture" -> verify the change follows baseline constraints.
- "This library/structure differs from the baseline" -> hand off to challenge before changing architecture.
- "All AC pass but architecture review remains" -> do not reopen Product AC; report review risk separately.

## State Writes

This Skill should not mutate OpenNori state directly except when exporting context. It guides implementation and delegates evidence, challenge, build-vs-buy, or reporting writes to other Skills.

## Handoffs

- Missing baseline for non-trivial work -> `nori-architecture-brainstorm`.
- Baseline conflict -> `nori-architecture-challenge`.
- Custom infrastructure or dependency decision -> `nori-build-vs-buy`.
- Verification after implementation -> `nori-evidence`.
- Completion answer -> `nori-reporting`.

## User Reply Shape

When architecture matters, state:

```text
Current AC gap: ...
Baseline used: ...
Architecture fit: aligned / needs challenge
Implementation focus: ...
```

Keep architecture commentary brief unless there is a conflict or risk.

## Misuse Guards

- Do not silently change stack, state model, dependency policy, directory boundary, or package boundary.
- Do not implement broad refactors unrelated to the current Product AC gap.
- Do not present Architecture Checks as Product AC failures.
- Do not skip evidence after implementation just because the architecture fit is good.
