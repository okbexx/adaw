---
name: nori-architecture-brainstorm
description: Create and confirm an OpenNori Architecture Baseline before non-trivial implementation.
---

## When to use
Use when the user starts a non-trivial OpenNori goal, asks to use a good architecture, asks to choose a technical architecture, wants built-in architecture profiles, or wants agent work to follow a confirmed architecture.

## Commands
- List profiles: `opennori architecture profiles --root <repo> --json`.
- Add a project profile from a reviewed JSON file: `opennori architecture profile --root <repo> --from <profile.json> --json`.
- Preview a baseline: `opennori architecture baseline --root <repo> --goal "<goal>" --profile <profile-id> --json`.
- Confirm a baseline after user acceptance: `opennori architecture baseline --root <repo> --goal "<goal>" --goal-id <goal-id> --profile <profile-id> --confirm --json`.
- Show current baseline: `opennori architecture show --root <repo> --json`.

## Rules
Architecture Baseline answers what architecture should guide the work. It is not a plan, phase list, task list, or implementation step sequence.
Use the user's goal, existing project structure, Nori Profile preferences, OpenNori built-in profiles, and relevant reference projects to recommend a baseline.
Treat `architecture profiles --json` as a review surface: show the user the profile's suitable use cases, sources, principles, checks, preferred libraries, avoid boundaries, and build-vs-buy policy before asking for confirmation.
When the user has a preferred architecture, save it as a project Architecture Profile first, then preview a baseline from that profile.
For OpenNori-like agent CLI products, prefer `typescript-agent-state-cli` unless project evidence clearly points elsewhere.
Do not treat architecture choices as Product AC. Product AC remains human end-user acceptance; Architecture Checks are maintainer/agent-facing quality gates.
Ask the user to confirm the baseline before implementation starts.
If a goal is already objectively complete but the baseline is missing, draft or confirm the baseline as `architecture_review` cleanup; do not change Product AC unless the user says the acceptance target itself was wrong.
