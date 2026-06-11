---
name: adaw
description: Route ADAW work through user-centered acceptance criteria, evidence, project health, and reporting Skills.
---

## When to use
Use when the user mentions ADAW, asks to use ADAW for a task, continue ADAW, check completion, inspect project health, define acceptance criteria, record evidence, manage capability preferences, or produce an ADAW report.

## Route
- Goal, brainstorm, approval, or AC revision -> use `adaw-acceptance`.
- Verification, evidence sufficiency, human confirmation, waiver, or why an AC is passing -> use `adaw-evidence`.
- Required Skills, preferred stacks, avoided tools, or install policy -> use `adaw-capability-profile`.
- Install, uninstall, doctor, manifest, Skill sync, or project recoverability -> use `adaw-project-health`.
- Status, report, current gap, completion answer, user intervention, or change summary -> use `adaw-reporting`.

## Baseline
At the start of each ADAW turn, run `adaw resume --root <repo> --json` or `adaw status --root <repo> --json` unless the task is only install/doctor/uninstall.
If `adaw` is not on PATH, use `node /Users/jarl/code/jarlone/adaw/bin/adaw.js` with the same arguments.

## Rule
Progress is determined by acceptance evidence, not implementation steps.
Do not make the user remember CLI syntax or internal Skill names.
Do not answer complete while the acceptance basis is draft or required AC/profile evidence is missing.
