---
name: nori
description: "Root OpenNori router for the complete agent capability bundle. Use when the user says to use or continue OpenNori, asks whether a goal is complete, wants evidence recorded, states required Skills or stack preferences, asks for project health, wants architecture decided first, or expects the agent to use OpenNori without exposing CLI parameters. Treat Plugin discovery, packaged Skills, opennori CLI, and .opennori state as coupled parts of one product."
---

## Mission

Turn a user's natural OpenNori request into the right acceptance loop action while keeping the user focused on goal, AC, evidence, architecture state, and completion judgment.

This is the only OpenNori Skill that should behave as the default entrypoint. Use focused child Skills for domain work instead of teaching the user internal Skill names.

OpenNori is one capability bundle:

- Plugin discovery makes these packaged Skills available.
- Skills define agent behavior and natural-language routing.
- `opennori` is the deterministic state layer.
- `.opennori/` stores the project contract, evidence, profile, architecture, health, and report state.

Do not present those pieces as optional standalone product paths.

## Start Here

1. Identify the project root from the current workspace or the user's explicit path.
2. If readiness is unknown, run `opennori bootstrap --root <repo> --json`.
3. If the project is already initialized, run `opennori list --root <repo> --json`, then `opennori resume --root <repo> --goal <goal-id> --json` or `opennori status --root <repo> --goal <goal-id> --json`.
4. If multiple active goals exist and the user did not identify one, summarize the choices and ask for a target instead of guessing.
5. If bootstrap returns a preview that needs confirmation, show the user what would be created and wait for explicit approval before rerunning with confirmation.
6. If `opennori` is not on PATH, use the local package binary available in the project or this repository's `node ./bin/opennori.js`; if the Plugin, packaged Skills, CLI, or `.opennori` state is missing, route to `nori-project-health` instead of continuing in a half-installed mode.

## Natural-Language Mapping

- "Use OpenNori for this goal", "turn this into AC", "the AC is wrong", "brainstorm first" -> hand off to `nori-acceptance`.
- "Continue OpenNori", "what is next", "what is the current gap" -> run resume/status, then hand off to `nori-reporting` unless the next action clearly requires another child Skill.
- "Is it complete", "can I accept this", "what do I need to do" -> use `nori-reporting` and answer from required AC, evidence, profile, architecture, and review risks.
- "Record this verification", "use this screenshot/report/test as evidence", "that evidence is stale", "waive this" -> hand off to `nori-evidence`.
- "Must use this Skill", "prefer Radix UI", "avoid this tool", "ask before installing" -> hand off to `nori-capability-profile`.
- "Decide architecture first", "use a better architecture", "follow the baseline", "challenge the baseline" -> use `nori-architecture-brainstorm`, `nori-architecture-apply`, or `nori-architecture-challenge`.
- "Before self-building this parser/installer/schema/storage/UI primitive" -> hand off to `nori-build-vs-buy`.
- "Install", "upgrade", "uninstall", "doctor", "state is broken" -> hand off to `nori-project-health`.
- A complete goal with `next_recommendation.candidate_goals` and a user asking to continue -> choose or refine one human-facing next goal, then hand off to `nori-acceptance`.

## State Writes

This root Skill should avoid direct writes except for safe readiness/bootstrap actions. Let child Skills mutate `.opennori/active`, `.opennori/architecture`, `.opennori/reports`, `.opennori/brainstorms`, `.opennori/completed`, `.opennori/blocked`, or `.opennori/manifest.json`.

## Handoffs

Use one child Skill at a time and carry forward only the relevant state:

- Current goal id, current gap, completion confidence, and review risks.
- Any user statement that changes completion meaning.
- Any architecture/profile constraint that affects how the agent may proceed.
- Any evidence source, limitation, or human confirmation the user just supplied.

After the child Skill acts, return through `nori-reporting` when the user needs a completion answer or next gap.

## User Reply Shape

Lead with:

```text
Goal: ...
Current gap: ...
Need user: yes/no
Decision: complete / not complete yet / objectively complete with review risk
Next: ...
```

Then include only the minimum context needed for the user to approve, revise, provide evidence, accept a risk, or let the agent continue.

## Misuse Guards

- Do not make the user memorize CLI flags or internal Skill names.
- Do not split OpenNori into separate Plugin, Skill, and CLI user paths; they are one capability bundle.
- Do not continue a half-installed mode when Plugin discovery, packaged Skills, CLI access, or `.opennori` state is missing; route to project health and recover the missing piece.
- Do not present candidate goals as approved AC, evidence, phases, or task lists.
- Do not answer confidently complete while required AC evidence, blocking profile items, architecture challenges, evidence health, or acceptance review risks remain unresolved or unaccepted.
- Do not turn architecture, profile, build-vs-buy, Plugin, hook, or tool preferences into Product AC.
- Do not suggest copying or syncing OpenNori Skills into the user project; Skills come from the installed OpenNori Plugin, and the CLI only manages `.opennori` state.
