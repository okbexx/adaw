---
name: nori-evidence
description: Record and judge OpenNori evidence while preserving agent freedom to choose verification methods.
---

## When to use
Use when the user asks to record validation as evidence, asks why an AC is passing, asks whether evidence is enough, confirms or waives an AC, or wants a verification attached to OpenNori.

## Evidence Protocol
The agent may choose any useful verification method: tests, diff, screenshots, browser checks, logs, artifacts, URLs, AW doctor, human confirmation, or another reviewable signal.
When submitting evidence, explain basis, sources, reviewability, confidence, and limitations.

## Command
`opennori evidence add --root <repo> --criterion <id> --kind <kind> --summary "..." --result <passing|failing|blocked|waived> --basis <basis> --source '<json-or-label>' --source-command '<command>' --source-path '<path>' --source-url '<url>' --reviewability "..." --limitations "..." --json`

Use multiple source flags when one AC is supported by several signals; prefer typed `--source-command`, `--source-path`, or `--source-url` when they fit, and use raw `--source` for anything else.
For high-risk passing evidence, use a strong evidence kind or explicit strong confidence only when justified.
Do not force evidence into a fixed adapter taxonomy.
