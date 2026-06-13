# OpenNori Architecture Baseline

Status: active
Profile: typescript-agent-state-cli
Sticky: yes
Requires challenge to change: yes

## Goal

Migrate OpenNori toward the TypeScript agent state CLI architecture while preserving its acceptance-driven product boundary

## Summary

Use strict TypeScript, a citty command layer, public JSON Schema with Ajv validation, tsc builds without bundling, Vitest and Biome quality gates, manifest-managed lifecycle actions, directory-based Skills, and build-vs-buy checks before custom infrastructure.

## Principles

- strict-typescript-source
- citty-command-layer
- thin-cli-entry
- domain-first-modules
- json-schema-public-protocol
- ajv-runtime-validation
- tsc-build-no-bundle-by-default
- vitest-and-biome-quality-gates
- plugin-packaged-skills
- manifest-managed-install-upgrade-uninstall
- skill-driven-natural-language-usage
- generic-context-export-for-external-review
- build-vs-buy-before-custom-infrastructure

## Architecture Checks

- ARCH-1 (maintainer): CLI command definitions are thin citty command modules that delegate product decisions to domain modules.
- ARCH-2 (maintainer): Persisted OpenNori state has public JSON Schema and Ajv runtime validation; OpenNori semantic rules stay separate from structural schema validation.
- ARCH-3 (maintainer): OpenNori Skill content lives in plugin-packaged skills/*/SKILL.md with optional references/scripts/assets/openai metadata, not as hard-coded JS strings or project-local copies.
- ARCH-4 (maintainer): Install, upgrade, uninstall, managed files, and doctor recovery are lifecycle concerns with deterministic plans, dry-run preview, and explicit confirmation boundaries.
- ARCH-5 (agent): Before custom infrastructure work, check current project dependencies, standard libraries, official SDKs, mature open-source libraries, and documented reference projects.
- ARCH-6 (agent): Do not replace this baseline silently. Raise an Architecture Challenge when project evidence conflicts with it.

## Build-vs-Buy Policy

1. current-project-dependency
2. standard-library
3. official-sdk
4. mature-open-source-library
5. small-local-implementation

## Prefer

- language: Use TypeScript strict mode for source modules and keep generated JavaScript as npm runtime output.
- cli: Use citty for command definitions; keep commander as a fallback only if packaging, nested command, or compatibility evidence blocks citty.
- interactive: Use @clack/prompts for minimal project-aware quickstart prompts; keep all state commands JSON-capable.
- build: Use tsc emit without bundling by default; add tsdown or tsup only when a real packaging need appears.
- schema: Use public JSON Schema files as protocol truth and Ajv for runtime validation.
- markdown-frontmatter: Use yaml for frontmatter when needed; keep JSON authoritative and avoid micromark/unified unless Markdown import requires it.
- test: Use Vitest plus tsc --noEmit; CLI integration tests should spawn the real bin against temporary projects.
- quality: Use Biome for lint and format; agents must not weaken quality config to pass checks.
- skills: Ship directory-based Skills as Codex Plugin package assets; project lifecycle commands manage .opennori state, not project-local Skill copies.

## Avoid

- process/ as OpenNori's workflow mainline
- phase/task-list state as product completion state
- agent self-summary as the only high-risk completion evidence
- Markdown as authoritative protocol state when JSON state exists
- hard-coded Skill bodies in JS strings
- silent architecture replacement
- custom infrastructure without build-vs-buy evidence
- bundler-first builds before tsc emit proves insufficient
- external review tools as OpenNori's control plane

## Agent Rule

Before implementing a non-trivial acceptance gap, read this baseline and keep the implementation aligned with it.
If project evidence conflicts with this baseline, create an Architecture Challenge instead of silently replacing it.
