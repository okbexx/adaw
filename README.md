# OpenNori

Human-acceptable delivery contracts for coding agents.

[![npm version](https://img.shields.io/npm/v/opennori.svg)](https://www.npmjs.com/package/opennori)
[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](./LICENSE)

OpenNori helps coding agents turn natural-language goals into Nori Contracts:
human-centered acceptance checks, architecture baseline, reviewable evidence,
and completion reports.

OpenNori is not a phase system, plan template, or process archive. The agent can
plan internally, but the user-facing loop stays centered on what the user wants,
what acceptance checks define done, what evidence supports each check, and
whether the goal is complete.

## Install

Choose one path.

### Try once

```bash
npx opennori
```

### Pin to a project

```bash
npm install -D opennori
opennori
```

Project installs expose `opennori` through npm scripts, package-manager exec,
and agent/tool environments that load `node_modules/.bin`. Use `npx opennori`
when you want npm to resolve OpenNori for a one-off command.

## Quick Start

Run OpenNori in a project:

```bash
opennori
```

The interactive entry previews the `.opennori/` state it would create and asks
before writing. Agents and CI can use `--json` for deterministic machine-readable
output.

Then talk to your agent:

```text
Use OpenNori for this goal. Discover the real acceptance criteria first,
confirm the Nori Contract with me, establish an Architecture Baseline for
non-trivial work, and keep working from acceptance gaps until the report can
say whether it is complete.
```

Users do not need to memorize CLI flags. OpenNori ships Codex Plugin Skills in
the npm package; those Skills map natural language to the deterministic
`opennori` state layer.

## What It Creates

OpenNori uses one project-local state directory:

```text
.opennori/
  manifest.json
  protocol.md
  agent-guide.md
  active/
    <goal>.acceptance.md
    <goal>.evidence.json
  completed/
  blocked/
  reports/
  brainstorms/
  architecture/
    baseline.json
    baseline.md
    profiles/
    challenges/
    decisions/
    evidence/
```

It does not create `process/` as the workflow surface, and it does not copy
OpenNori Skills into each user project.

## Core Concepts

### Nori Contract

A Nori Contract combines:

- the user's natural-language goal
- human-centered acceptance checks
- evidence state
- current acceptance gap
- completion judgment

Acceptance checks describe user-visible operations and judgments, not files,
commands, modules, tests, Skills, or technology choices.

### Acceptance Discovery

Nori should not accept vague criteria such as "modify fields" or "show an
error". Before drafting a contract, OpenNori helps the agent ask the questions
that decide whether the user can accept the result:

- which fields can be changed
- what validation rules apply
- what success feedback the user sees
- how persistence is verified after refresh or return
- what failed-save behavior looks like
- what is intentionally out of scope

### Architecture Baseline

For non-trivial work, Nori should establish an Architecture Baseline before
implementation. The baseline records architecture profile, principles,
boundaries, preferred and avoided choices, build-vs-buy policy, and challenge
rules the agent must follow while completing Product AC.

Architecture Baseline is not a plan. It is sticky implementation guidance: if
project evidence conflicts with it, the agent creates an Architecture Challenge
instead of silently changing the technology stack, state model, dependency
policy, or directory boundary.

### Evidence Record

Evidence can come from tests, screenshots, URLs, artifacts, logs, human
confirmation, waivers, or other reviewable sources. OpenNori keeps evidence
flexible, but high-risk completion should not rely only on an agent's
self-summary.

### Nori Profile

Nori Profile records execution preferences such as required Skills, preferred
stacks, avoided tools, and install policy. These preferences influence
completion risk and blocking status, but they are not user acceptance checks.

## Example Uses

### Frontend Feature

User prompt:

```text
Use OpenNori for a settings page where users edit profile details.
```

Nori should reject vague acceptance checks like "modify fields" and ask which
fields, validation rules, save feedback, persistence behavior, failed-save
states, and out-of-scope boundaries matter. The final contract should describe
what the user opens, edits, saves, refreshes, and expects to see.

### Skill And Stack Preference

User prompt:

```text
Use design-taste-frontend first, build custom components with Radix UI,
and avoid adding another UI framework.
```

Nori records these as Profile items, not acceptance checks. A violated `must` or
`avoid` item can block completion unless the user waives it.

### Architecture Baseline

User prompt:

```text
Use OpenNori with an agent-native CLI architecture. Prefer mature libraries
before self-building infrastructure.
```

Nori lists available architecture profiles, previews the baseline, and asks the
user to confirm before implementation. Status and report then show Product
decision and Architecture decision separately.

### Existing OpenNori Project

User prompt:

```text
This repo already uses OpenNori. Bring it up to date without losing active contracts.
```

OpenNori previews upgrade actions before writing. Active contracts, evidence,
reports, brainstorms, and architecture state are preserved by default. `check`
can flag vague older acceptance checks for user-approved revision, surface
Architecture Baseline health, and warn when completion relies on stale, broad,
or summary-only evidence.

## Useful Commands

Users should start with natural language through an agent. These commands are
the deterministic state layer for agents and automation:

```bash
opennori bootstrap
opennori doctor --root .
opennori check --root .
opennori architecture profiles --root . --json
opennori architecture baseline --root . --goal "Ship a user-visible result"
opennori discover --goal "Ship a settings page" --root .
opennori brainstorm --idea "Explore this goal" --root .
opennori draft --goal "Ship a user-visible result" --root .
opennori approve --root . --summary "User approved the acceptance checks."
opennori status --root .
opennori evidence add --root . --criterion AC-1 --kind review-result --summary "..." --result passing
opennori report --root .
```

## Product Boundaries

- `bootstrap` gives agents one short entry for readiness checks and first-time
  preview.
- `install`, `upgrade`, and `uninstall` support preview-first workflows;
  destructive writes require explicit confirmation.
- OpenNori Plugin Skills are package assets. Install and upgrade write project
  state, not project-local copies of OpenNori Skills.
- In a human terminal, `opennori` is interactive. With `--json` or
  non-interactive stdio it returns structured JSON.
- `discover` finds underspecified acceptance gaps before draft, so vague ACs
  become user questions instead of weak contracts.
- `doctor` reports whether project state is `ready`, `needs-action`, or
  `broken`, with recovery actions.
- Nori Profile records required Skills, preferred stacks, avoided tools, and
  install policy without turning those preferences into user AC.
- Architecture Baseline records architecture guidance, build-vs-buy policy, and
  challenge rules without turning architecture checks into Product AC.
- Evidence stays flexible: tests, screenshots, URLs, artifacts, logs, human
  confirmation, waivers, or other reviewable sources can support an acceptance
  check.
- Context export can give review tools the current goal, checks, profile,
  Architecture Baseline, evidence, and report, but review tools do not take over
  the agent loop.

## Development

```bash
npm test
npm run check
```

## License

GPL-3.0-only
