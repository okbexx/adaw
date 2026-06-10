---
name: adaw
description: Drive agent work through user-centered acceptance criteria and evidence, not exposed process plans.
---

## When to use
Use when a task needs the agent to keep working until human-centered acceptance criteria have passing or waived evidence.

## Start
If the user says they want to discuss, brainstorm, explore, or are not ready to define acceptance criteria, run `adaw brainstorm --idea "<idea>" --root <repo> --json` and show only the candidate acceptance directions. Ask the user to choose or revise a direction.

When the user says `用 ADAW 跑这个任务：目标是 X`, run `adaw draft --goal "X" --root <repo> --json` and show the draft acceptance criteria for approval or revision before implementation.
If `adaw` is not on PATH in this workspace, use `node /Users/jarl/code/jarlone/adaw/bin/adaw.js` with the same arguments.

If the user chooses a brainstorm candidate, run `adaw draft --from-brainstorm <brainstorm-id> --candidate <A|B|C> --root <repo> --json`.

After the user approves the criteria, run `adaw approve --root <repo> --summary "user approved acceptance criteria" --json`. If the user revises a criterion, run `adaw criterion update --root <repo> --criterion <id> --user-story ... --measurement ... --threshold ... --json`.

If the user states required Skills, preferred stacks, avoided tools, install policy, or execution constraints, translate the natural-language preference into a Capability Profile with `adaw profile add --root <repo> --type <skill|stack|constraint> --name "<name>" --strength <must|prefer|avoid> --purpose "<why>" --install-policy <existing_only|ask_before_install|allowed> --json`.
Before answering complete, add profile evidence with `adaw profile evidence --root <repo> --item <item-id> --result <satisfied|violated|waived> --summary "<evidence>" --json` for must/avoid items. Must items without satisfied or waived evidence block completion.

## Resume
At the start of each turn, run `adaw resume --root <repo> --json` or `adaw next --root <repo> --json` to recover the active goal and current acceptance gap.

## Evidence loop
Work only to produce evidence for the current acceptance gap. Add evidence with `adaw evidence add`, run `adaw evaluate`, answer status with `adaw status`, and generate the user report with `adaw report`.

## Rule
Progress is determined by acceptance evidence, not by implementation steps.
Do not answer complete while the acceptance basis is draft.
Do not treat brainstorm output as an acceptance contract or completion evidence.
Do not turn Capability Profile items into user acceptance criteria; they are agent execution guidance and compliance evidence.
