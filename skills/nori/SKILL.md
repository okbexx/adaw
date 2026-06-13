---
name: nori
description: Route OpenNori work through user-centered acceptance criteria, evidence, project health, and reporting Skills.
---

## When to use
Use when the user mentions OpenNori, asks to use OpenNori for a task, continue OpenNori, check completion, inspect project health, define acceptance criteria, record evidence, manage capability preferences, or produce an OpenNori report.

## Route
- Goal, acceptance discovery, brainstorm, approval, or AC revision -> use `nori-acceptance`.
- Verification, evidence sufficiency, human confirmation, waiver, or why an AC is passing -> use `nori-evidence`.
- Required Skills, preferred stacks, avoided tools, or install policy -> use `nori-capability-profile`.
- Architecture baseline, architecture profile selection, applying baseline before implementation, architecture challenge, or build-vs-buy -> use `nori-architecture-brainstorm`, `nori-architecture-apply`, `nori-architecture-challenge`, or `nori-build-vs-buy`.
- Install, upgrade, uninstall, doctor, manifest, Plugin health, or project recoverability -> use `nori-project-health`.
- Status, report, current gap, completion answer, user intervention, or change summary -> use `nori-reporting`.

## Baseline
At the start of each OpenNori turn, run `opennori bootstrap --root <repo> --json` if project readiness is unknown; otherwise run `opennori list --root <repo> --json`, then use `opennori resume --root <repo> --goal <goal-id> --json` or `opennori status --root <repo> --goal <goal-id> --json` when multiple active goals exist.
If bootstrap returns `needs_confirm`, show the preview briefly and ask the user before rerunning with `--confirm`.
For non-trivial goals, make sure an Architecture Baseline exists before implementation. Use `nori-architecture-brainstorm` to establish it and `nori-architecture-apply` before each implementation loop.
Use `next_recommendation` and top-level `next_actions` to continue the OpenNori loop; do not make the user repeatedly ask what the next step is.
If `opennori` is not on PATH, use the installed package binary such as `node ./node_modules/opennori/bin/opennori.js` or this repository's `node ./bin/opennori.js` with the same arguments.

## Rule
Progress is determined by acceptance evidence, not implementation steps.
Architecture Baseline is sticky after user confirmation. Challenge it with evidence; do not silently replace it.
Do not make the user remember CLI syntax or internal Skill names.
Do not answer confidently complete while the acceptance basis is draft, required AC/profile evidence is missing, `architecture_check` has warnings, or `evidence_health` needs review.
Do not suggest project-local OpenNori Skill installation or sync. OpenNori Skills come from the package Plugin; CLI commands only manage `.opennori` state.
