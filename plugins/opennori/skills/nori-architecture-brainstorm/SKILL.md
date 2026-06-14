---
name: nori-architecture-brainstorm
description: Establish a reviewable OpenNori Architecture Baseline before non-trivial implementation. Use when the user wants a good architecture first, asks for built-in or project architecture profiles, prefers a stack that should shape implementation, or expects future agent work to follow a confirmed technical baseline.
---

## Mission

Give the agent a confirmed technical direction before it implements Product AC, while keeping architecture separate from user acceptance criteria.

The baseline answers "what architecture should guide this work", not "what steps will the agent perform".

## Start Here

1. Read the active goal and Product AC from resume/status.
2. Read Nori Profile for required Skills, preferred stacks, avoid rules, and install policy.
3. Inspect existing project architecture, dependencies, and user-supplied references.
4. List available architecture profiles and select the best fit.
5. Preview the baseline and ask the user to confirm before implementation.

Useful state commands:

- `opennori architecture profiles --root <repo> --json`
- `opennori architecture profile --root <repo> --from <profile.json> --json`
- `opennori architecture baseline --root <repo> --goal "<goal>" --profile <profile-id> --json`
- `opennori architecture baseline --root <repo> --goal "<goal>" --goal-id <goal-id> --profile <profile-id> --confirm --json`
- `opennori architecture show --root <repo> --json`

## Natural-Language Mapping

- "First decide the technical architecture" -> compare project evidence, profile preferences, and available profiles; preview a baseline.
- "Use my preferred architecture" -> record or select a project Architecture Profile, then preview a baseline.
- "Use OpenNori's built-in good architecture" -> show the relevant built-in profile, including sources, principles, checks, preferred libraries, avoid rules, and build-vs-buy policy.
- "This is a simple change" -> decide whether baseline is needed; if non-trivial implementation or infrastructure is involved, create one.
- "The product is done but architecture is missing" -> treat baseline work as architecture review cleanup, not Product AC failure.

## State Writes

May write project architecture profiles and confirmed Architecture Baseline files under `.opennori/architecture/`. Do not write Product AC, acceptance evidence, or implementation tasks.

## Handoffs

- After baseline confirmation, hand off to `nori-architecture-apply` before implementation.
- If profile preferences need to be recorded first, hand off to `nori-capability-profile`.
- If the baseline requires custom infrastructure, hand off to `nori-build-vs-buy`.
- If project evidence contradicts an existing baseline, hand off to `nori-architecture-challenge`.
- If the user changes what the product should do, hand off to `nori-acceptance`.

## User Reply Shape

Show architecture as a decision, not a work plan:

```text
Recommended baseline: ...
Why this fits: ...
Key constraints: ...
Preferred libraries: ...
Avoid: ...
Needs confirmation: yes
```

## Misuse Guards

- Do not turn architecture choices, profiles, libraries, or Architecture Checks into Product AC.
- Do not start non-trivial implementation before the baseline is confirmed or explicitly waived by the user.
- Do not silently replace a confirmed baseline; use an Architecture Challenge.
- Do not self-build infrastructure before build-vs-buy evidence exists.
- Do not copy process-centered workflow models into OpenNori architecture decisions.
