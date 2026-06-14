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

## Install OpenNori Capability Bundle

OpenNori is one agent capability bundle, not three separate products:

- Codex Plugin distributes and discovers the packaged OpenNori Skills.
- OpenNori Skills are agent behavior protocols for natural-language work.
- `opennori` is the deterministic state layer those Skills call.
- `.opennori/` stores project contracts, evidence, profile, architecture, health, and reports.

First-time setup installs the complete bundle with preview and explicit
confirmation:

```bash
npx opennori setup
```

Setup previews the Codex Plugin registration, packaged Skill availability,
global `opennori` CLI installation, current project `.opennori/` initialization,
and final doctor check before it writes anything.

After setup, initialize any project from that project directory:

```bash
opennori init
```

For local OpenNori development from a checkout:

```bash
codex plugin marketplace add .
codex plugin add opennori@opennori
```

After installing the capability bundle, open a new Codex session and say:

```text
Use OpenNori for this goal.
```

For advanced recovery, the setup command is equivalent to previewing and then
confirming the same official Codex and npm actions:

```bash
codex plugin marketplace add okbexx/opennori --ref main
codex plugin add opennori@opennori
npm install -g opennori@latest
```

Direct CLI use is an advanced or automation path, not a separate product path
from the Plugin and Skills.

## Quick Start

If OpenNori is already installed on this machine, run the project initializer:

```bash
opennori init
```

The initializer previews the `.opennori/` state it would create and asks before
writing. Agents and CI can use `--json` for deterministic machine-readable
output.

Then talk to your agent:

```text
Use OpenNori for this goal. Discover the real acceptance criteria first,
confirm the Nori Contract with me, establish an Architecture Baseline for
non-trivial work, and keep working from acceptance gaps until the report can
say whether it is complete.
```

Users do not need to memorize CLI flags or Skill names. The bundled Skills map
natural language to the deterministic `opennori` state layer.

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

Acceptance checks should describe user-visible operations and judgments, not
implementation files, modules, tests, Skills, or technology choices. OpenNori
surfaces likely mistakes as review questions for the agent and user; it does
not reject a contract just because a heuristic sees a technical word.

### Acceptance Discovery

Nori should review vague criteria such as "modify fields" or "show an error"
with the user instead of silently treating them as done. Before drafting or
claiming confident completion, OpenNori helps the agent ask the questions that
decide whether the user can accept the result:

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

Missing, challenged, or stale architecture state is reported as
`architecture_review`: the Product AC can be objectively complete, but OpenNori
will not report confident completion until the agent or user reviews the
architecture risk.

### Evidence Record

Evidence can come from tests, screenshots, URLs, artifacts, logs, human
confirmation, waivers, or other reviewable sources. OpenNori keeps evidence
flexible, but high-risk completion should not rely only on an agent's
self-summary.

### Next Loop Candidates

When a goal is confidently complete, `resume`, `status`, `next`, `report`, and
context export include `next_recommendation.candidate_goals`. These are small
candidate starts for the next Nori Contract: each candidate names the goal, user
value, acceptance directions, and risks.

Candidate goals are not phases, task lists, approved acceptance checks, or
completion evidence. They help the agent continue after the user says
"continue" without making the user invent the next prompt from scratch.

### Nori Profile

Nori Profile records execution preferences such as required Skills, preferred
stacks, avoided tools, and install policy. These preferences influence
completion risk and blocking status, but they are not user acceptance checks.

Build-vs-buy findings work the same way. They are architecture review risks,
not Product AC. If self-built infrastructure lacks reuse research or a
self-build reason, status/report say `build_vs_buy` review is required before
claiming mature completion.

## Example Uses

### Frontend Feature

User prompt:

```text
Use OpenNori for a settings page where users edit profile details.
```

Nori should flag vague acceptance checks like "modify fields" as
`acceptance_review` findings and ask which fields, validation rules, save
feedback, persistence behavior, failed-save states, and out-of-scope boundaries
matter. The final contract should describe what the user opens, edits, saves,
refreshes, and expects to see.

### Skill And Stack Preference

User prompt:

```text
Use design-taste-frontend first, build custom components with Radix UI,
and avoid adding another UI framework.
```

Nori records these as Profile items, not acceptance checks. A violated `must` or
`avoid` item can block completion unless the user waives it. An unknown or
violated `prefer` item becomes `profile_review`: objectively complete work can
still require user or agent review before it is reported as confidently complete.

### Architecture Baseline

User prompt:

```text
Use OpenNori with an agent-native CLI architecture. Prefer mature libraries
before self-building infrastructure.
```

Nori lists available architecture profiles, previews the baseline, and asks the
user to confirm before implementation. Status and report then show Product
decision and Architecture decision separately.

If all Product ACs pass while the Architecture Baseline is missing, challenged,
or build-vs-buy is unhealthy, status/report answer: objectively complete with
review risk, not confidently complete.

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
opennori setup
opennori init
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
opennori evidence prune --root . --criterion AC-1 --reason "Evidence no longer proves the current AC"
opennori report --root .
```

## Product Boundaries

- `setup` is the first-time machine installer for the complete capability
  bundle: Codex Plugin, packaged Skills, global CLI, project state, and doctor.
- `init` prepares or refreshes `.opennori/` state in the current project.
- `install`, `upgrade`, and `uninstall` support preview-first workflows;
  destructive writes require explicit confirmation.
- OpenNori Plugin Skills are package behavior protocols for agents. Install and
  upgrade write project state, not project-local copies of OpenNori Skills.
- In a human terminal, `opennori setup` and `opennori init` are interactive.
  With `--json` or non-interactive stdio they return structured JSON.
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
- Complete goals can expose `candidate_goals` for the next acceptance loop; the
  agent still turns the chosen candidate into a new draft Nori Contract before
  completion judgment begins.

## Development

```bash
npm test
npm run check
```

## License

GPL-3.0-only
