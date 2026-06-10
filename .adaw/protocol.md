# ADAW Protocol

ADAW means Acceptance-Driven Agent Workflow.

The human-facing surface is acceptance state:

- goal
- user acceptance criteria
- current acceptance gap
- evidence summary
- final status

Implementation plans are allowed inside the agent's private reasoning, but they are not the default
progress surface and they are not completion evidence.

## Layered Acceptance Criteria v1

ADAW itself is accepted only when it satisfies user-tool-operation acceptance criteria.

Each criterion must follow this shape:

```text
As a user,
using [tool or entrypoint],
I perform [concrete operation],
and can [make a judgment or take an action],
within [measurable threshold].
```

The first complete ADAW acceptance set is layered. The layers prevent the project from
mistaking a working protocol kernel for the complete product.

### L1 Protocol AC

The protocol layer proves that the repository can hold an acceptance contract, evidence ledger,
current gap, risk gate, and report.

| ID | Tool / entrypoint | User operation | User acceptance criterion | Passing threshold |
| --- | --- | --- | --- | --- |
| AC-P-1 | Editor / file browser | Open the active acceptance contract | The user understands goal, layered ACs, each status, and the current gap. | No chat history or implementation explanation required; understandable within 60 seconds. |
| AC-P-2 | CLI | Run `adaw check` | The user can reject technical implementation details masquerading as ACs. | Files, fields, commands, tests, or modules cannot be accepted as user ACs by themselves. |
| AC-P-3 | CLI | Run `adaw next` or `adaw status` | The user sees the current acceptance gap and completion answer, not a process-step list. | Output answers which AC is missing, whether complete, and whether human action is required. |
| AC-P-4 | CLI / report | Inspect a high-risk AC | The user sees that weak evidence cannot make it passing. | High-risk passing cannot rely only on agent self-summary. |
| AC-P-5 | CLI / Codex | Trigger `adaw report` | The user sees goal, layered AC statuses, evidence summaries, current gap, intervention, and conclusion. | Report is organized by acceptance state and evidence, not process steps. |

### L2 Operator AC

The operator layer proves that Codex can actually use ADAW as the work protocol in conversation.

| ID | Tool / entrypoint | User operation | User acceptance criterion | Passing threshold |
| --- | --- | --- | --- | --- |
| AC-O-1 | Codex conversation | Start a task with "use ADAW for this goal" | The user sees a draft acceptance contract written from the user's perspective. | Draft ACs describe user actions or judgments; user can approve or revise. |
| AC-O-2 | Codex conversation | Approve or revise the acceptance criteria | The user controls what "done" means. | Agent cannot decide completion before user-confirmed criteria exist. |
| AC-O-3 | New Codex session | Ask to continue ADAW | The agent restores the active goal and current acceptance gap. | Recovery uses repo files, not old chat context. |
| AC-O-4 | Codex conversation | Ask "is it done?" | The agent answers only from required AC status and evidence. | Complete is allowed only when required ACs are all `passing` or `waived`. |
| AC-O-5 | Codex conversation | Ask "what do I need to do?" | If blocked, the user sees a concrete human action. | Blocked output asks for a decision, input, permission, cost approval, or similar human action. |
| AC-O-6 | Codex conversation | Revise an AC after new facts appear | The changed acceptance basis is preserved. | Updated ACs become the basis for `current_gap` and completion; old criteria are not silently reused. |
| AC-O-7 | Codex conversation | Ask ADAW to brainstorm a fuzzy idea | The user sees selectable acceptance directions without remembering CLI syntax. | Brainstorm candidates describe user value, observable acceptance direction, and risk; they are not treated as a contract or completion evidence. |
| AC-O-8 | Codex conversation | State required Skills, preferred stacks, avoided tools, or execution constraints | The agent records a Capability Profile without making the user remember CLI syntax. | Must/avoid profile items are shown in contract and report; unsatisfied must items or violated avoid items block completion unless waived. |

### L3 Productization AC

The productization layer proves that ADAW can be installed, reused, reviewed, and cleaned up as
a durable workflow asset.

| ID | Tool / entrypoint | User operation | User acceptance criterion | Passing threshold |
| --- | --- | --- | --- | --- |
| AC-Z-1 | CLI | Run `adaw skill export` | The user gets a usable Codex Skill draft for ADAW. | The Skill tells agents to drive work through resume, next, evidence, evaluate, status, and report. |
| AC-Z-2 | CLI | Run `adaw install` | The user can install ADAW into a project without unexpected overwrites. | Install shows created/skipped assets; existing user content is not overwritten by default. |
| AC-Z-3 | Git / PR diff | Review the agent's changes | The user can separate acceptance evidence changes from implementation noise. | Summary defaults to AC status changes, evidence changes, and user impact. |
| AC-Z-4 | CLI | Run `adaw list` and select a goal | The user can see multiple active goals and choose one explicitly. | Multiple active goals are listed with status, gap, and paths; `--goal` selects the target. |
| AC-Z-5 | CLI | Archive a completed or blocked goal | The user removes it from active work while preserving evidence and report. | Active no longer lists the goal; contract, ledger, and report remain recoverable. |
| AC-Z-6 | Project file browser | Inspect the project after running ADAW | The user sees ADAW-owned state under `.adaw/` instead of a generic project `process/` directory. | Install, draft, brainstorm, report, and archive write ADAW state under `.adaw/` by default. |
| AC-Z-7 | CLI / project file browser | Run `adaw install` | The user can inspect project ADAW registration and judge version, managed entries, active goals, Skill status, and protocol capabilities. | Install output uses create, skip, overwrite, or update semantics; `.adaw/manifest.json` records version, managed files, active goals, Skill state, and capabilities. |
| AC-Z-8 | CLI | Run `adaw doctor` | The user can judge whether the project is `ready`, `needs-action`, or `broken`, and see the next recovery action. | Doctor checks `.adaw` structure, manifest consistency, active goal recoverability, Skill sync, CLI runtime, and recovery suggestions. |

## Required Artifact Pair

ADAW writes its project-local state under `.adaw/`.

```text
.adaw/
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

`.adaw/manifest.json` records the project-local ADAW registration:

- manifest schema and ADAW protocol version
- ADAW package version
- managed `.adaw` files and directories
- active goals recoverable from `.adaw/active`
- optional repo-local ADAW Skill state
- protocol capabilities exposed by this CLI

`adaw install` creates or refreshes the manifest. State-changing ADAW commands refresh it when
`.adaw/` already exists.

## Capability Profile

Acceptance criteria remain human-facing outcomes. A Capability Profile is separate execution
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
need to remember `adaw profile` commands.

## Status Model

- `unknown`: no user-understandable evidence exists
- `failing`: evidence shows the criterion is not satisfied
- `passing`: evidence shows the criterion is satisfied
- `blocked`: user decision or external condition required
- `waived`: user explicitly accepts the unmet criterion with a reason

The workflow is complete only when every required criterion is `passing` or `waived`.

## Risk Gate

ADAW separates acceptance status from evidence strength.

For `high` risk criteria, weak evidence cannot make an AC `passing`. If an agent submits
`passing` evidence with a weak kind, ADAW downgrades the criterion to `failing` with
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

## Agent Rule

On every turn:

1. If the user wants to discuss, brainstorm, explore, or is not ready to define acceptance criteria, run `adaw brainstorm --idea "<idea>" --root <repo> --json`.
2. Show only candidate acceptance directions and ask the user to choose or revise a direction. Brainstorm output is not a contract or completion evidence.
3. If the user chooses a candidate, run `adaw draft --from-brainstorm <brainstorm-id> --candidate <A|B|C> --root <repo> --json`.
4. If the user starts with "use ADAW" / "用 ADAW 跑这个任务", run `adaw draft --goal "<goal>" --root <repo> --json`.
5. Show the draft acceptance criteria and ask the user to approve or revise them.
6. After approval, run `adaw approve --root <repo> --summary "<approval>" --json`.
7. If the user states required Skills, preferred stacks, avoided tools, install policy, or execution constraints, run `adaw profile add --root <repo> ... --json` and keep those items out of the user acceptance criteria.
8. If the user revises a criterion later, run `adaw criterion update --root <repo> --criterion <id> ... --json`; old evidence for the changed criterion is cleared.
9. Run `adaw resume --root <repo>` or `adaw next --root <repo>` to recover the active goal and current acceptance gap from repository files.
10. Work only to produce evidence for that gap.
11. Add acceptance evidence with `adaw evidence add`, and add profile compliance evidence with `adaw profile evidence` when profile items exist.
12. Run `adaw evaluate`.
13. Report acceptance state, profile compliance, and evidence, not implementation steps.

Useful commands:

- `adaw brainstorm --idea "<idea>" --root <repo>`: create selectable acceptance directions before a contract exists.
- `adaw draft --goal "<goal>" --root <repo>`: create a draft acceptance contract that needs user approval.
- `adaw draft --from-brainstorm <brainstorm-id> --candidate <A|B|C> --root <repo>`: convert a selected brainstorm direction into a draft contract.
- `adaw approve --root <repo>`: mark the acceptance basis as approved so completion can be decided.
- `adaw criterion update --root <repo> --criterion <id> ...`: preserve a user revision as the new acceptance basis.
- `adaw profile add --root <repo> --type <skill|stack|constraint> --name "<name>" --strength <must|prefer|avoid>`: record user execution preferences separately from ACs.
- `adaw profile evidence --root <repo> --item <item-id> --result <satisfied|violated|waived>`: record whether the agent followed the profile.
- `adaw profile show --root <repo>`: show profile compliance and blocking items.
- `adaw list --root <repo>`: list active ADAW goals.
- `adaw install --root <repo>`: create or refresh project-local ADAW assets and manifest.
- `adaw doctor --root <repo>`: inspect project ADAW health and recovery actions.
- `adaw resume --root <repo>`: recover the active goal, current gap, completion answer, and intervention state.
- `adaw status --root <repo>`: answer whether the goal is complete and whether the user needs to act.
- `adaw report --root <repo>`: generate the human acceptance report.
