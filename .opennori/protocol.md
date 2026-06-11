# OpenNori Protocol

OpenNori is the product; Nori is the agent-facing role that turns goals into Nori Contracts.

The human-facing surface is acceptance state:

- goal
- user acceptance criteria
- current acceptance gap
- evidence summary
- final status

Implementation plans are allowed inside the agent's private reasoning, but they are not the default
progress surface and they are not completion evidence.

## Layered Acceptance Criteria v1

OpenNori itself is accepted only when it satisfies user-tool-operation acceptance criteria.

Each criterion must follow this shape:

```text
As a user,
using [tool or entrypoint],
I perform [concrete operation],
and can [make a judgment or take an action],
within [measurable threshold].
```

The first complete OpenNori acceptance set is layered. The layers prevent the project from
mistaking a working protocol kernel for the complete product.

### L1 Protocol AC

The protocol layer proves that the repository can hold a Nori Contract, evidence record,
current gap, risk gate, and report.

| ID | Tool / entrypoint | User operation | User acceptance criterion | Passing threshold |
| --- | --- | --- | --- | --- |
| AC-P-1 | Editor / file browser | Open the active Nori Contract | The user understands goal, layered ACs, each status, and the current gap. | No chat history or implementation explanation required; understandable within 60 seconds. |
| AC-P-2 | CLI | Run `nori check` | The user can reject technical implementation details masquerading as ACs. | Files, fields, commands, tests, or modules cannot be accepted as user ACs by themselves. |
| AC-P-3 | CLI | Run `nori next` or `nori status` | The user sees the current acceptance gap and completion answer, not a process-step list. | Output answers which AC is missing, whether complete, and whether human action is required. |
| AC-P-4 | CLI / report | Inspect a high-risk AC | The user sees that weak evidence cannot make it passing. | High-risk passing cannot rely only on agent self-summary. |
| AC-P-5 | CLI / Codex | Trigger `nori report` | The user sees goal, layered AC statuses, evidence summaries, current gap, intervention, and conclusion. | Report is organized by acceptance state and evidence, not process steps. |
| AC-P-6 | CLI / report | Inspect evidence basis | The user can tell what evidence supports passing, blocked, or waived ACs. | Report/status shows evidence summary, basis, confidence, and limitations, not only an agent conclusion. |
| AC-P-7 | CLI / report | Review evidence sources | The user can review evidence sources without constraining how the agent gathered them. | Sources can be commands, artifacts, URLs, screenshots, diffs, human confirmations, or other reviewable references. |
| AC-P-8 | CLI / report | Compare evidence basis types | The user can distinguish tool observations, human confirmations, artifact reviews, protocol checks, and agent observations. | Evidence basis is shown clearly and agent judgment is not disguised as tool or human verification. |
| AC-P-9 | CLI / report | Inspect reviewability and limitations | The user sees how to review evidence and what it does not cover. | Report shows reviewability and limitations for structured evidence. |
| AC-P-10 | CLI / report | Inspect combined evidence sources | The user can see one AC supported by multiple sources. | Evidence can contain multiple sources without forcing them into fixed adapters. |
| AC-P-11 | Codex conversation | Ask the agent to record a verification as evidence | The user does not need to remember evidence CLI flags. | The OpenNori Skill tells the agent to choose a suitable verification method, then record basis, sources, reviewability, confidence, and limitations. |

### L2 Operator AC

The operator layer proves that Codex can actually use OpenNori as the work protocol in conversation.

| ID | Tool / entrypoint | User operation | User acceptance criterion | Passing threshold |
| --- | --- | --- | --- | --- |
| AC-O-1 | Codex conversation | Start a task with "use OpenNori for this goal" | The user sees a draft Nori Contract written from the user's perspective. | Draft ACs describe user actions or judgments; user can approve or revise. |
| AC-O-2 | Codex conversation | Approve or revise the acceptance criteria | The user controls what "done" means. | Agent cannot decide completion before user-confirmed criteria exist. |
| AC-O-3 | New Codex session | Ask to continue OpenNori | The agent restores the active goal and current acceptance gap. | Recovery uses repo files, not old chat context. |
| AC-O-4 | Codex conversation | Ask "is it done?" | The agent answers only from required AC status and evidence. | Complete is allowed only when required ACs are all `passing` or `waived`. |
| AC-O-5 | Codex conversation | Ask "what do I need to do?" | If blocked, the user sees a concrete human action. | Blocked output asks for a decision, input, permission, cost approval, or similar human action. |
| AC-O-6 | Codex conversation | Revise an AC after new facts appear | The changed acceptance basis is preserved. | Updated ACs become the basis for `current_gap` and completion; old criteria are not silently reused. |
| AC-O-7 | Codex conversation | Ask OpenNori to brainstorm a fuzzy idea | The user sees selectable acceptance directions without remembering CLI syntax. | Brainstorm candidates describe user value, observable acceptance direction, and risk; they are not treated as a contract or completion evidence. |
| AC-O-8 | Codex conversation | State required Skills, preferred stacks, avoided tools, or execution constraints | The agent records a Nori Profile without making the user remember CLI syntax. | Must/avoid profile items are shown in contract and report; unsatisfied must items or violated avoid items block completion unless waived. |

### L3 Productization AC

The productization layer proves that OpenNori can be installed, reused, reviewed, and cleaned up as
a durable workflow asset.

| ID | Tool / entrypoint | User operation | User acceptance criterion | Passing threshold |
| --- | --- | --- | --- | --- |
| AC-Z-1 | CLI | Run `nori skill export` | The user gets a usable Codex Skill draft for OpenNori. | The Skill tells agents to drive work through resume, next, evidence, evaluate, status, and report. |
| AC-Z-2 | CLI | Run `nori install` | The user can install OpenNori into a project without unexpected overwrites. | Install shows created/skipped assets; existing user content is not overwritten by default. |
| AC-Z-3 | Git / PR diff | Review the agent's changes | The user can separate acceptance evidence changes from implementation noise. | Summary defaults to AC status changes, evidence changes, and user impact. |
| AC-Z-4 | CLI | Run `nori list` and select a goal | The user can see multiple active goals and choose one explicitly. | Multiple active goals are listed with status, gap, and paths; `--goal` selects the target. |
| AC-Z-5 | CLI | Archive a completed or blocked goal | The user removes it from active work while preserving evidence and report. | Active no longer lists the goal; contract, ledger, and report remain recoverable. |
| AC-Z-6 | Project file browser | Inspect the project after running OpenNori | The user sees OpenNori-owned state under `.opennori/` instead of a generic project `process/` directory. | Install, draft, brainstorm, report, and archive write OpenNori state under `.opennori/` by default. |
| AC-Z-7 | CLI / project file browser | Run `nori install` | The user can inspect project OpenNori registration and judge version, managed entries, active goals, Skill status, and protocol capabilities. | Install output uses create, skip, overwrite, or update semantics; `.opennori/manifest.json` records version, managed files, active goals, Skill state, and capabilities. |
| AC-Z-8 | CLI | Run `nori doctor` | The user can judge whether the project is `ready`, `needs-action`, or `broken`, and see the next recovery action. | Doctor checks `.opennori` structure, manifest consistency, active goal recoverability, Skill sync, CLI runtime, and recovery suggestions. |
| AC-Z-9 | CLI | Preview install with `nori install --dry-run` | The user can judge what OpenNori would create, skip, update, or overwrite before writing to the project. | Install plan lists action, kind, managed status, write intent, destructive flag, and reason; dry-run reports zero actual writes. |
| AC-Z-10 | CLI | Apply force install | The user must preview and explicitly confirm destructive install actions before files are overwritten. | Real `nori install --force` fails without confirmation; dry-run previews destructive overwrites; confirmed force install may write. |
| AC-Z-11 | CLI | Preview and apply uninstall | The user can uninstall OpenNori entry assets without losing acceptance state by default. | Uninstall plan shows removals and preserved state; real uninstall requires confirmation; `.opennori` state is deleted only with `--include-state --confirm`. |
| AC-Z-12 | CLI / Codex Skills | Install OpenNori Skill Pack | The agent gets focused OpenNori Skills for acceptance, evidence, Nori Profile, project health, and reporting while the user keeps using natural language. | `nori skill export --pack` exposes the pack; `nori install --skill` writes it; manifest records `skill_pack`; doctor detects missing or stale pack Skills. |

## Required Artifact Pair

OpenNori writes its project-local state under `.opennori/`.

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

Each active goal has:

- `<goal>.acceptance.md` for human review
- `<goal>.evidence.json` for deterministic agent/tool updates

`.opennori/manifest.json` records the project-local OpenNori registration:

- manifest schema and OpenNori protocol version
- OpenNori package version
- managed `.opennori` files and directories
- active goals recoverable from `.opennori/active`
- optional repo-local OpenNori Skill state
- optional repo-local OpenNori Skill Pack state
- protocol capabilities exposed by this CLI

`nori install` creates or refreshes the manifest. State-changing OpenNori commands refresh it when
`.opennori/` already exists.

`nori install --dry-run` returns an install plan. The plan uses deterministic action semantics:

- `create`: missing OpenNori asset would be created
- `exists`: required OpenNori directory already exists
- `skip`: existing file is preserved because `--force` was not used
- `overwrite`: existing file would be overwritten because `--force` was used
- `update`: generated OpenNori state, such as the manifest, would be refreshed

Each planned action also reports `kind`, `managed`, `would_write`, `will_write`, `destructive`,
and a short human-readable reason.

Real `nori install --force` can overwrite OpenNori-managed files, so it requires explicit confirmation.
Run `nori install --dry-run --force` first to inspect destructive actions, then rerun with
`--confirm` only if those writes are acceptable.

`nori uninstall --dry-run` returns an uninstall plan. By default it removes entry assets such as the
repo-local OpenNori Skill and manifest, while preserving Nori Contracts, evidence records,
reports, archives, and brainstorms. Real uninstall requires `--confirm`. Deleting the whole `.opennori`
state directory requires both `--include-state` and `--confirm`.

## Skill Pack

OpenNori exposes a Skill Pack for agent use. The user should not need to remember these Skill names;
the root `nori` Skill routes natural-language requests to focused Skills:

- `nori`: root router for OpenNori turns
- `nori-acceptance`: brainstorm, draft, approve, and revise human-facing ACs
- `nori-evidence`: record reviewable evidence without forcing fixed adapters
- `nori-capability-profile`: record required Skills, preferred stacks, avoided tools, and install policy
- `nori-project-health`: install, uninstall, doctor, manifest, and Skill Pack sync
- `nori-reporting`: status, report, current gap, user intervention, and changes

`nori install --skill` installs the pack under `.agents/skills/`. The manifest records `skill_pack`
state, and `nori doctor` checks whether the pack is installed and in sync.

## Nori Profile

Acceptance criteria remain human-facing outcomes. A Nori Profile is separate execution
guidance for the agent when the user says things like:

- must use an existing Skill
- prefer a library or stack
- avoid a tool
- ask before installing a dependency
- follow a project-specific constraint

Profile items have:

- `type`: `skill`, `stack`, or `constraint`
- `strength`: `must`, `prefer`, or `avoid`
- `purpose`: why the user wants it
- `install_policy`: `existing_only`, `ask_before_install`, or `allowed`

Completion rules:

- `must` blocks completion until satisfied or waived.
- `prefer` is reported but does not block completion.
- `avoid` blocks completion if violated.

Agents translate the user's natural-language preferences into profile records. Users should not
need to remember `nori profile` commands.

## Status Model

- `unknown`: no user-understandable evidence exists
- `failing`: evidence shows the criterion is not satisfied
- `passing`: evidence shows the criterion is satisfied
- `blocked`: user decision or external condition required
- `waived`: user explicitly accepts the unmet criterion with a reason

The workflow is complete only when every required criterion is `passing` or `waived`.

## Risk Gate

OpenNori separates acceptance status from evidence strength.

For `high` risk criteria, weak evidence cannot make an AC `passing`. If an agent submits
`passing` evidence with a weak kind, OpenNori downgrades the criterion to `failing` with
`confidence: strong-evidence-required`.

Strong evidence kinds:

- `test-summary`
- `screenshot`
- `artifact`
- `review-result`
- `human-confirmation`
- `protocol-v1`

Strong explicit confidence values:

- `verified`
- `reviewed`
- `human-confirmed`

This keeps high-risk completion from relying on agent self-summary.

## Free Evidence Structure

OpenNori does not require the agent to use a fixed set of evidence adapters. The agent may choose the
verification approach that fits the task: tests, Git diff, screenshots, browser checks, logs,
artifacts, URLs, AW doctor, human confirmation, or another reviewable signal.

When the agent submits evidence, the user-facing record should explain:

- `basis`: why this evidence can support the AC, such as `tool-observation`,
  `human-confirmation`, `artifact-review`, `protocol-check`, or `agent-observation`
- `sources`: one or more reviewable references, each with a label and optional command, path, URL,
  outcome, or other useful metadata
- `reviewability`: how the user can rerun, reopen, inspect, or otherwise review the evidence
- `confidence`: the evidence strength used by completion and risk gates
- `limitations`: what the evidence does not cover

The shape is intentionally open. OpenNori should preserve arbitrary source metadata instead of forcing
all evidence through a narrow adapter taxonomy.

## Agent Rule

On every turn:

1. If the user wants to discuss, brainstorm, explore, or is not ready to define acceptance criteria, run `nori brainstorm --idea "<idea>" --root <repo> --json`.
2. Show only candidate acceptance directions and ask the user to choose or revise a direction. Brainstorm output is not a contract or completion evidence.
3. If the user chooses a candidate, run `nori draft --from-brainstorm <brainstorm-id> --candidate <A|B|C> --root <repo> --json`.
4. If the user starts with "use OpenNori" / "用 OpenNori 跑这个任务", run `nori draft --goal "<goal>" --root <repo> --json`.
5. Show the draft acceptance criteria and ask the user to approve or revise them.
6. After approval, run `nori approve --root <repo> --summary "<approval>" --json`.
7. If the user states required Skills, preferred stacks, avoided tools, install policy, or execution constraints, run `nori profile add --root <repo> ... --json` and keep those items out of the user acceptance criteria.
8. If the user revises a criterion later, run `nori criterion update --root <repo> --criterion <id> ... --json`; old evidence for the changed criterion is cleared.
9. Run `nori resume --root <repo>` or `nori next --root <repo>` to recover the active goal and current acceptance gap from repository files.
10. Work only to produce evidence for that gap.
11. Add acceptance evidence with `nori evidence add`; choose any suitable verification method, but record basis, sources, reviewability, confidence, and limitations. Add profile compliance evidence with `nori profile evidence` when profile items exist.
12. Run `nori evaluate`.
13. Report acceptance state, profile compliance, and evidence, not implementation steps.

Useful commands:

- `nori brainstorm --idea "<idea>" --root <repo>`: create selectable acceptance directions before a contract exists.
- `nori draft --goal "<goal>" --root <repo>`: create a draft Nori Contract that needs user approval.
- `nori draft --from-brainstorm <brainstorm-id> --candidate <A|B|C> --root <repo>`: convert a selected brainstorm direction into a draft contract.
- `nori approve --root <repo>`: mark the acceptance basis as approved so completion can be decided.
- `nori criterion update --root <repo> --criterion <id> ...`: preserve a user revision as the new acceptance basis.
- `nori evidence add --root <repo> --criterion <id> --kind <kind> --summary "<summary>" --result <passing|failing|blocked|waived> --basis <basis> --source '<json-or-label>' --reviewability "<how to review>" --limitations "<known limits>"`: attach user-understandable, reviewable evidence without forcing a fixed adapter.
- `nori profile add --root <repo> --type <skill|stack|constraint> --name "<name>" --strength <must|prefer|avoid>`: record user execution preferences separately from ACs.
- `nori profile evidence --root <repo> --item <item-id> --result <satisfied|violated|waived>`: record whether the agent followed the profile.
- `nori profile show --root <repo>`: show profile compliance and blocking items.
- `nori list --root <repo>`: list active OpenNori goals.
- `nori install --root <repo>`: create or refresh project-local OpenNori assets and manifest.
- `nori doctor --root <repo>`: inspect project OpenNori health and recovery actions.
- `nori resume --root <repo>`: recover the active goal, current gap, completion answer, and intervention state.
- `nori status --root <repo>`: answer whether the goal is complete and whether the user needs to act.
- `nori report --root <repo>`: generate the human acceptance report.
