---
name: adaw
description: Drive agent work through user-centered acceptance criteria and evidence, not exposed process plans.
---

## When to use
Use when a task needs the agent to keep working until human-centered acceptance criteria have passing or waived evidence.

## Start
When the user says `用 ADAW 跑这个任务：目标是 X`, run `adaw draft --goal "X" --root <repo> --json` and show the draft acceptance criteria for approval or revision before implementation.
If `adaw` is not on PATH in this workspace, use `node /Users/jarl/code/jarlone/adaw/bin/adaw.js` with the same arguments.

After the user approves the criteria, run `adaw approve --root <repo> --summary "user approved acceptance criteria" --json`. If the user revises a criterion, run `adaw criterion update --root <repo> --criterion <id> --user-story ... --measurement ... --threshold ... --json`.

## Resume
At the start of each turn, run `adaw resume --root <repo> --json` or `adaw next --root <repo> --json` to recover the active goal and current acceptance gap.

## Evidence loop
Work only to produce evidence for the current acceptance gap. Add evidence with `adaw evidence add`, run `adaw evaluate`, answer status with `adaw status`, and generate the user report with `adaw report`.

## Rule
Progress is determined by acceptance evidence, not by implementation steps.
Do not answer complete while the acceptance basis is draft.
