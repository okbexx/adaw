---
name: adaw-project-health
description: Install, uninstall, diagnose, and recover project-local ADAW assets, manifest, and Skill Pack sync.
---

## When to use
Use when the user asks to install ADAW, uninstall ADAW, check whether ADAW is ready, diagnose broken ADAW state, inspect manifest, or sync project Skills.

## Commands
- Preview install: `adaw install --root <repo> --dry-run --json`.
- Install Skill Pack: `adaw install --root <repo> --skill --json`.
- Preview destructive install: `adaw install --root <repo> --skill --force --dry-run --json`.
- Confirm destructive install: `adaw install --root <repo> --skill --force --confirm --json`.
- Doctor: `adaw doctor --root <repo> --json`.
- Preview uninstall: `adaw uninstall --root <repo> --dry-run --json`.
- Remove entry assets while preserving state: `adaw uninstall --root <repo> --confirm --json`.
- Remove all ADAW state only after explicit user acceptance: `adaw uninstall --root <repo> --include-state --confirm --json`.

## Rules
Always show dry-run plans before destructive writes.
Default uninstall preserves active goals, evidence, reports, archives, and brainstorms.
