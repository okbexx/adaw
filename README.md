# OpenNori

OpenNori helps coding agents deliver results that humans can actually accept.

You describe a goal and constraints in natural language. Nori turns that into a Nori Contract:
human-centered acceptance checks, evidence, and a completion report. The agent can still plan
internally, but OpenNori treats progress as proven only when the acceptance checks have reviewable
evidence.

## Why It Exists

AI agents often do a lot of work while leaving the user unsure whether the original goal is done.
OpenNori keeps the conversation centered on:

- what the user wants to achieve
- what the user can open, run, see, or judge
- what evidence supports each acceptance check
- what is still blocked or missing
- whether the goal is complete

OpenNori is not a phase system, task planner, or process archive. It borrows productization ideas
from mature agent workflow kits, but the main storyline stays acceptance, evidence, and completion
judgment.

## Try It

```bash
npx opennori install --root . --dry-run
```

For a project install:

```bash
npm install -D opennori
npx nori install --root . --dry-run
npx nori install --root . --confirm
npx nori doctor --root .
```

Then talk to your agent:

```text
Use OpenNori for this project. Start from my goal, define a Nori Contract,
and keep working only from acceptance gaps until the report says whether it is complete.
```

## What Gets Added

OpenNori uses one project-local state directory:

```text
.opennori/
  manifest.json
  protocol.md
  active/
    <goal>.acceptance.md
    <goal>.evidence.json
  completed/
  blocked/
  reports/
  brainstorms/
```

It does not create a `process/` directory as the main workflow surface.

## Core Commands

```bash
nori install --root . --dry-run
nori install --root . --confirm
nori doctor --root .
nori brainstorm --idea "Explore this goal" --root .
nori draft --goal "Ship a user-visible result" --root .
nori approve --root . --summary "User approved the acceptance checks."
nori status --root .
nori evidence add --root . --criterion AC-1 --kind review-result --summary "..." --result passing
nori report --root .
```

Users should not need to memorize these commands. The OpenNori Skill Pack lets an agent map natural
language requests to the deterministic CLI state layer.

## Productized Boundaries

- `install`, `upgrade`, and `uninstall` support preview-first workflows; destructive writes require
  explicit confirmation.
- `doctor` reports whether project state is `ready`, `needs-action`, or `broken`, with recovery
  actions.
- Nori Profile records required Skills, preferred stacks, avoided tools, and install policy without
  turning those preferences into user acceptance checks.
- Evidence stays flexible: tests, screenshots, URLs, artifacts, logs, human confirmation, waivers, or
  other reviewable sources can support an acceptance check.
- Context export can give review tools the current goal, checks, profile, evidence, and report, but
  review tools do not take over the agent loop.

## Development

```bash
npm test
npm run check
```
