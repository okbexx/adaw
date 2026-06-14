---
name: nori-acceptance
description: Create, review, approve, and revise OpenNori human-centered acceptance criteria from natural language goals.
---

## When to use
Use when the user gives a goal, wants to discover real acceptance criteria, wants to brainstorm acceptance directions, approves criteria, revises completion criteria, or says the AC is wrong.

## Commands
- Before drafting from a fuzzy goal: `opennori discover --goal "<goal>" --root <repo> --json`.
- Fuzzy idea or discussion: `opennori brainstorm --idea "<idea>" --root <repo> --json`.
- Start from a goal: `opennori draft --goal "<goal>" --root <repo> --json`.
- Start from a chosen brainstorm candidate: `opennori draft --from-brainstorm <brainstorm-id> --candidate <A|B|C> --root <repo> --json`.
- User approves criteria: `opennori approve --root <repo> --summary "<approval>" --json`.
- User revises a criterion: `opennori criterion update --root <repo> --criterion <id> --user-story ... --measurement ... --threshold ... --json`.

## Rules
Run discovery before draft when the goal or candidate AC contains vague verbs such as modify, save, support, show an error, or improve.
Discovery gaps are questions for the user, not implementation tasks and not completion evidence.
Do not treat generic ACs like 'modify fields' or 'show failure prompt' as confidently complete until field scope, validation rules, success signal, persistence scope, failure cases, and out-of-scope boundaries are clear enough for the user to judge.
ACs should describe user actions or judgments, not implementation files, commands, modules, fields, tests, Skills, or technology choices. If `acceptance_review` flags a possible issue, explain it as a review question and ask the user to revise, confirm an assumption, waive, or accept the remaining review risk.
Capability preferences belong in the Nori Profile, not user ACs.
Do not treat brainstorm output as a Nori Contract or completion evidence.
