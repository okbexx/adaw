---
name: nori-project-health
description: Diagnose, initialize, upgrade, uninstall, and recover project-local OpenNori state, manifest, packaged Plugin Skill health, and active-goal integrity. Use when the user asks whether OpenNori is ready, wants setup, sees broken `.opennori` state, or needs safe lifecycle actions with preview and explicit confirmation.
---

## Mission

Keep OpenNori project state usable and recoverable without making lifecycle commands the user's workflow.

Health work protects `.opennori/` integrity, manifest freshness, packaged Plugin Skill visibility, and active-goal recoverability. It should not decide subjective product acceptance.

## Start Here

1. Run `opennori doctor --root <repo> --json` when the project may already use OpenNori.
2. Run `opennori bootstrap --root <repo> --json` for first contact or unknown readiness.
3. For lifecycle writes, show preview first and ask for explicit confirmation when the action writes, overwrites, upgrades, uninstalls, or deletes state.
4. After upgrade or repair, run `opennori check --root <repo> --json` and route soft review findings to the relevant Skill.

Useful state commands:

- `opennori bootstrap --root <repo> --json`
- `opennori bootstrap --root <repo> --confirm --json`
- `opennori install --root <repo> --dry-run --json`
- `opennori install --root <repo> --confirm --json`
- `opennori upgrade --root <repo> --dry-run --json`
- `opennori upgrade --root <repo> --confirm --json`
- `opennori uninstall --root <repo> --dry-run --json`
- `opennori uninstall --root <repo> --confirm --json`
- `opennori uninstall --root <repo> --include-state --confirm --json`
- `opennori doctor --root <repo> --json`
- `opennori check --root <repo> --json`

## Natural-Language Mapping

- "Set up OpenNori here" -> bootstrap preview, then confirm only after the user approves.
- "Is OpenNori healthy" -> doctor and summarize ready, needs-action, or broken with recovery actions.
- "Upgrade this project" -> upgrade dry run, confirm if approved, then check.
- "Remove OpenNori" -> uninstall dry run; preserve `.opennori` state unless the user explicitly asks to delete it.
- "State is broken" -> doctor, identify hard integrity failures, and propose recovery actions.
- "Doctor shows review risks" -> route acceptance, evidence, profile, architecture, or build-vs-buy review to the responsible Skill.

## State Writes

May write manifest, protocol, agent guide, lifecycle-managed `.opennori/` assets, and uninstall removals after confirmation. It may not silently rewrite active Product AC, evidence, profile, architecture decisions, or reports as a side effect of health checks.

## Handoffs

- `acceptance_review` -> `nori-acceptance`.
- `evidence_health` -> `nori-evidence`.
- `profile_review` -> `nori-capability-profile`.
- `architecture_check` or stale baseline surface -> `nori-architecture-brainstorm`, `nori-architecture-apply`, or `nori-architecture-challenge`.
- `build_vs_buy` findings -> `nori-build-vs-buy`.
- Healthy status or user-facing summary -> `nori-reporting`.

## User Reply Shape

For health responses, use:

```text
Status: ready / needs-action / broken
Problem: ...
Recovery: ...
Writes needed: none / previewed / needs confirmation
Next: ...
```

For previews, list create/skip/update/overwrite/remove and whether the action is destructive.

## Misuse Guards

- Do not copy OpenNori Skills into the user project; packaged Plugin Skills are the agent discovery surface.
- Do not perform destructive lifecycle writes without preview and explicit confirmation.
- Do not treat soft review findings as hard protocol rejection.
- Do not reopen Product AC just because architecture, build-vs-buy, evidence health, or profile review needs user attention.
- Do not use health commands as a substitute for acceptance evidence.
