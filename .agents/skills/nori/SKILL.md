---
name: nori
description: Route OpenNori work through user-centered acceptance criteria, evidence, project health, and reporting Skills.
---

## When to use
Use when the user mentions OpenNori, asks to use OpenNori for a task, continue OpenNori, check completion, inspect project health, define acceptance criteria, record evidence, manage capability preferences, or produce an OpenNori report.

## Route
- Goal, brainstorm, approval, or AC revision -> use `nori-acceptance`.
- Verification, evidence sufficiency, human confirmation, waiver, or why an AC is passing -> use `nori-evidence`.
- Required Skills, preferred stacks, avoided tools, or install policy -> use `nori-capability-profile`.
- Install, uninstall, doctor, manifest, Skill sync, or project recoverability -> use `nori-project-health`.
- Status, report, current gap, completion answer, user intervention, or change summary -> use `nori-reporting`.

## Baseline
At the start of each OpenNori turn, run `nori resume --root <repo> --json` or `nori status --root <repo> --json` unless the task is only install/doctor/uninstall.
Use `next_recommendation` and top-level `next_actions` to continue the OpenNori loop; do not make the user repeatedly ask what the next step is.
If `nori` is not on PATH, use the installed package binary such as `node ./node_modules/opennori/bin/nori.js` or this repository's `node ./bin/nori.js` with the same arguments.

## Rule
Progress is determined by acceptance evidence, not implementation steps.
Do not make the user remember CLI syntax or internal Skill names.
Do not answer complete while the acceptance basis is draft or required AC/profile evidence is missing.
