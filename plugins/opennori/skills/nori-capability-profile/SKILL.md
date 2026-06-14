---
name: nori-capability-profile
description: Capture and check OpenNori execution preferences such as required Skills, preferred stacks, avoided tools, install policy, and user-declared implementation constraints. Use when the user says a task must use a specific Skill, prefers a library or stack, wants to avoid a tool, or requires approval before installs.
---

## Mission

Keep the user's execution preferences visible to the agent and completion report without polluting Product AC.

Nori Profile answers "how should the agent work" and "what constraints affect completion confidence". Product AC still answers "what can the human user accept".

## Start Here

1. Read current profile and status before adding duplicate preferences.
2. Classify the user's statement as `skill`, `stack`, or `constraint`.
3. Classify strength:
   - `must`: completion is blocked until satisfied or waived.
   - `prefer`: objective completion can pass, but unresolved preference is review risk.
   - `avoid`: violation blocks completion unless waived.
4. Record install policy when the user mentions whether new dependencies or Skills may be installed.
5. Record compliance evidence before confident completion.

Useful state commands:

- `opennori profile show --root <repo> --json`
- `opennori profile add --root <repo> --type <skill|stack|constraint> --name "<name>" --strength <must|prefer|avoid> --purpose "<why>" --install-policy <existing_only|ask_before_install|allowed> --json`
- `opennori profile evidence --root <repo> --item <item-id> --result <satisfied|violated|waived> --summary "<evidence>" --json`

## Natural-Language Mapping

- "Must use design-taste-frontend first" -> add a `skill` item with `must`.
- "Prefer Radix UI for components" -> add a `stack` item with `prefer`.
- "Avoid adding another state library" -> add a `constraint` or `stack` item with `avoid`.
- "Ask me before installing packages" -> set install policy to `ask_before_install`.
- "This preference can be waived" -> record profile evidence as `waived` with the user's reason.
- "Did we follow my stack preference" -> show profile items and compliance evidence.

## State Writes

May write Nori Profile items and profile compliance evidence. Do not write Product AC, evidence for acceptance criteria, Architecture Baseline, or reports directly.

## Handoffs

- If a preference changes what the user can accept as a product outcome, hand off to `nori-acceptance` for AC revision.
- If a stack preference should shape architecture, hand off to `nori-architecture-brainstorm` or `nori-architecture-challenge`.
- If a preference requires proof, hand off to `nori-evidence` for user-facing verification after profile evidence is recorded.
- If completion is being judged, hand off to `nori-reporting`.

## User Reply Shape

Summarize profile impact separately from Product AC:

```text
Profile item: ...
Strength: must / prefer / avoid
Completion impact: blocks completion / review risk / no current risk
Evidence needed: ...
```

## Misuse Guards

- Do not turn Skills, libraries, architecture, or install policy into Product AC.
- Do not report confident completion with unsatisfied `must`, violated `avoid`, or unaccepted `prefer` review risk.
- Do not install or suggest installing tools when the profile says `existing_only` or `ask_before_install` without user approval.
- Do not treat availability of a Skill as evidence that the product behavior is complete.
