---
name: nori-evidence
description: Record and judge OpenNori evidence while preserving agent freedom to choose verification methods.
---

## When to use
Use when the user asks to record validation as evidence, asks why an AC is passing, asks whether evidence is enough, confirms or waives an AC, wants a verification attached to OpenNori, or says existing evidence is stale/invalid/obsolete.

## Evidence Protocol
The agent may choose any useful verification method: tests, diff, screenshots, browser checks, logs, artifacts, URLs, external review tool output, human confirmation, or another reviewable signal.
When submitting evidence, explain basis, sources, reviewability, confidence, and limitations.
If evidence no longer proves the current AC, remove it before relying on status/report/context. Missing local artifact/path evidence is pruned automatically, but obsolete semantic evidence should be cleared explicitly so the AC returns to the current gap.

## Commands
`opennori evidence add --root <repo> --criterion <id> --kind <kind> --summary "..." --result <passing|failing|blocked|waived> --basis <basis> --source '<json-or-label>' --source-command '<command>' --source-path '<path>' --source-url '<url>' --reviewability "..." --limitations "..." --json`

`opennori evidence prune --root <repo> --criterion <id> --reason "..." --json`

Use multiple source flags when one AC is supported by several signals; prefer typed `--source-command`, `--source-path`, or `--source-url` when they fit, and use raw `--source` for anything else.
For high-risk passing evidence, use a strong evidence kind or explicit strong confidence only when justified.
Do not keep invalid evidence in active report or context just for history. Record fresh evidence after pruning.
Do not force evidence into a fixed adapter taxonomy.
