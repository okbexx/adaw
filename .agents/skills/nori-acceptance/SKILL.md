---
name: nori-acceptance
description: Create, review, approve, and revise OpenNori human-centered acceptance criteria from natural language goals.
---

## When to use
Use when the user gives a goal, wants to brainstorm acceptance directions, approves criteria, revises completion criteria, or says the AC is wrong.

## Commands
- Fuzzy idea or discussion: `opennori brainstorm --idea "<idea>" --root <repo> --json`.
- Start from a goal: `opennori draft --goal "<goal>" --root <repo> --json`.
- Start from a chosen brainstorm candidate: `opennori draft --from-brainstorm <brainstorm-id> --candidate <A|B|C> --root <repo> --json`.
- User approves criteria: `opennori approve --root <repo> --summary "<approval>" --json`.
- User revises a criterion: `opennori criterion update --root <repo> --criterion <id> --user-story ... --measurement ... --threshold ... --json`.

## Rules
ACs must describe user actions or judgments, not implementation files, commands, modules, fields, tests, Skills, or technology choices.
Capability preferences belong in the Nori Profile, not user ACs.
Do not treat brainstorm output as a Nori Contract or completion evidence.
