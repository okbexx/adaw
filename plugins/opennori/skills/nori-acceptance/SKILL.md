---
name: nori-acceptance
description: Discover, draft, approve, and revise human-centered OpenNori acceptance criteria from natural-language goals, fuzzy ideas, brainstorm candidates, or user corrections. Use when completion meaning is unclear, AC quality is being discussed, or candidate goals need to become a Nori Contract.
---

## Mission

Help the agent and user define what "done" means from the human user's point of view.

Good AC says what entry the user uses, what operation or judgment they perform, what result they see, and how they can decide it is acceptable. It does not describe the agent's implementation path.

## Start Here

1. Read current OpenNori state with resume/status when a goal already exists.
2. If the user is still exploring an idea, create brainstorm candidates before drafting a contract.
3. If the user has a goal but the completion surface is vague, run discovery before draft.
4. If a draft or active contract exists, inspect `acceptance_review` before claiming the AC is good enough.
5. If the user has approved or revised AC, persist that decision before implementation continues.

Useful state commands:

- `opennori brainstorm --idea "<idea>" --root <repo> --json`
- `opennori discover --goal "<goal>" --root <repo> --json`
- `opennori draft --goal "<goal>" --root <repo> --json`
- `opennori draft --from-brainstorm <id> --candidate <candidate> --root <repo> --json`
- `opennori approve --root <repo> --summary "<approval>" --json`
- `opennori criterion update --root <repo> --criterion <id> --user-story "..." --measurement "..." --threshold "..." --json`

## Natural-Language Mapping

- "I want to build X" -> discover missing acceptance details, then draft Product AC.
- "Brainstorm this idea" -> produce selectable acceptance directions; ask which direction should become the contract.
- "This AC is too vague" -> ask only questions that change completion judgment.
- "Approve these AC" -> write approval and make the contract the source of truth for the loop.
- "Change AC-2 to mean..." -> update that criterion and treat older evidence for it as stale.
- Complete goal with `candidate_goals` -> use the chosen candidate as a draft source, not as approved AC.

## Discovery Questions

Ask questions that affect user acceptance:

- Scope: which user role, screen, command, data object, or workflow is included.
- Operation: what exact user action or judgment happens.
- Field or input rules: editable fields, validation, defaults, limits, and excluded fields.
- Success signal: what the user sees after success.
- Persistence: what should still be true after refresh, restart, rerun, or reopening.
- Failure behavior: what the user sees when the operation cannot complete.
- Boundaries: what is intentionally out of scope.
- Review method: how the user or reviewer can verify the behavior.

Do not turn these questions into implementation tasks or evidence.

## State Writes

May write brainstorms, draft contracts, approved acceptance basis, and criterion revisions under `.opennori/`. Do not write evidence, profile, architecture decisions, or reports except through the responsible Skill.

## Handoffs

- After AC approval for non-trivial work, hand off to `nori-architecture-brainstorm`.
- After implementation needs evidence, hand off to `nori-evidence`.
- If the user states required Skills, stacks, or avoided tools while defining AC, hand off that part to `nori-capability-profile`.
- If `acceptance_review` remains after required AC are objectively passing, hand off to `nori-reporting` to present review risk separately.

## User Reply Shape

Show the draft as a compact list of user-facing checks:

```text
Goal: ...
Acceptance checks:
- AC-1: As a user, ...
  Measure: ...
  Passes when: ...
Open questions:
- ...
```

Ask for approval or specific revision. Do not include implementation steps unless the user explicitly asks for implementation detail.

## Misuse Guards

- Do not accept generic criteria such as "modify fields" or "show an error" until field scope, validation, success, persistence, failure, and review method are clear enough for the user to judge.
- Do not make tests, modules, files, commands, Skills, libraries, architecture, or build-vs-buy decisions into Product AC.
- Do not treat brainstorm output, discovery questions, candidate goals, or agent assumptions as a Nori Contract.
- Do not claim completion from AC quality alone; completion still requires reviewable evidence.
