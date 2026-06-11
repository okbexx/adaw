---
name: nori-project-health
description: Install, uninstall, diagnose, and recover project-local OpenNori assets, manifest, and Skill Pack sync.
---

## When to use
Use when the user asks to install OpenNori, uninstall OpenNori, check whether OpenNori is ready, diagnose broken OpenNori state, inspect manifest, or sync project Skills.

## Commands
- Short readiness / first-time preview: `opennori bootstrap --root <repo> --json`.
- Confirm first-time setup after user approval: `opennori bootstrap --root <repo> --confirm --json`.
- Preview install: `opennori install --root <repo> --dry-run --json`.
- Install Skill Pack: `opennori install --root <repo> --skill --json`.
- Preview destructive install: `opennori install --root <repo> --skill --force --dry-run --json`.
- Confirm destructive install: `opennori install --root <repo> --skill --force --confirm --json`.
- Doctor: `opennori doctor --root <repo> --json`.
- Preview uninstall: `opennori uninstall --root <repo> --dry-run --json`.
- Remove entry assets while preserving state: `opennori uninstall --root <repo> --confirm --json`.
- Remove all OpenNori state only after explicit user acceptance: `opennori uninstall --root <repo> --include-state --confirm --json`.

## Rules
Always show dry-run plans before destructive writes.
Default uninstall preserves active goals, evidence, reports, archives, and brainstorms.
