---
name: nori-architecture-challenge
description: Create reviewable Architecture Challenges when project evidence conflicts with the confirmed baseline.
---

## When to use
Use when the confirmed Architecture Baseline seems too heavy, too weak, incompatible with current project conventions, blocked by dependency/license/security constraints, or contradicted by evidence.

## Command
`opennori architecture challenge --root <repo> --summary "<conflict>" --evidence "<project evidence>" --recommendation "<suggested baseline change>" --json`

## Rules
A challenge is not permission to change the baseline. It is a request for user confirmation.
Agent must not silently replace the Architecture Baseline.
Include current baseline, observed project evidence, the conflict, recommendation, and risk of not changing.
Do not create a process plan or task list.
After creating a challenge, report that user confirmation is required unless the user explicitly waived confirmation.
