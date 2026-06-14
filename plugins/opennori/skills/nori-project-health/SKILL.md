---
name: nori-project-health
description: Install, upgrade, uninstall, diagnose, and recover project-local OpenNori state, manifest, Plugin health, and active goals.
---

## When to use
Use when the user asks to install OpenNori, upgrade OpenNori project state, uninstall OpenNori, check whether OpenNori is ready, diagnose broken `.opennori` state, inspect manifest, or recover active goals.

## Commands
- Short readiness / first-time preview: `opennori bootstrap --root <repo> --json`.
- Confirm first-time setup after user approval: `opennori bootstrap --root <repo> --confirm --json`.
- Preview install: `opennori install --root <repo> --dry-run --json`.
- Confirm install after user approval: `opennori install --root <repo> --confirm --json`.
- Preview optional agent route merge: `opennori install --root <repo> --merge-agent-route --dry-run --json`.
- Confirm optional agent route merge after user approval: `opennori install --root <repo> --merge-agent-route --confirm --json`.
- Preview destructive overwrite only when preservation is not enough: `opennori install --root <repo> --force --dry-run --json`.
- Confirm destructive overwrite only after explicit user approval: `opennori install --root <repo> --force --confirm --json`.
- Preview protocol/manifest/guide upgrade: `opennori upgrade --root <repo> --dry-run --json`.
- Confirm protocol/manifest/guide upgrade after user approval: `opennori upgrade --root <repo> --confirm --json`.
- Doctor: `opennori doctor --root <repo> --json`.
- Existing contract check after upgrade: `opennori check --root <repo> --json`.
- Preview uninstall: `opennori uninstall --root <repo> --dry-run --json`.
- Remove manifest while preserving state: `opennori uninstall --root <repo> --confirm --json`.
- Remove all OpenNori state only after explicit user acceptance: `opennori uninstall --root <repo> --include-state --confirm --json`.

## Rules
Always show dry-run plans before destructive writes.
Install and upgrade manage `.opennori` project state. They do not copy OpenNori Skills into the user's project.
OpenNori Skills are package assets exposed by `plugins/opennori/.codex-plugin/plugin.json`; if doctor reports missing Plugin Skills, reinstall or update the OpenNori package.
Use `--merge-agent-route` only as an explicit optional fallback when the user wants AGENTS.md or CLAUDE.md to point new sessions at `.opennori/architecture/baseline.md`.
Default uninstall preserves active goals, evidence, reports, archives, brainstorms, protocol, guide, and architecture state.
Doctor output includes packaged Plugin Skill health, Architecture Baseline health, and active goal recoverability.
`opennori check` output includes hard contract integrity validation plus soft `acceptance_review`, `architecture_check`, `build_vs_buy`, and `evidence_health` findings. Treat review findings as agent/user discussion input, not protocol rejection.
When status/report show `objective_complete: true` with `confidence: review-risk`, do not reopen Product AC just because architecture or build-vs-buy needs review. Route `architecture_review` to architecture Skills, `build_vs_buy` to `nori-build-vs-buy`, `evidence_health` to `nori-evidence`, and `acceptance_review` to `nori-acceptance`.
Upgrade must preserve existing active contracts, evidence, and architecture baselines. After upgrade, run `opennori check` and route findings for user-approved revision, assumption confirmation, waiver, recovery, or accepted review risk.
Do not suggest `opennori skill export`, `install --skill`, `refresh-skill`, or project-local `.agents/skills` sync.
