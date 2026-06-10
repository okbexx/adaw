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

## Required Artifact Pair

Each active goal has:

- `<goal>.acceptance.md` for human review
- `<goal>.evidence.json` for deterministic agent/tool updates

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

1. If the user starts with "use ADAW" / "用 ADAW 跑这个任务", run `adaw draft --goal "<goal>" --root <repo> --json`.
2. Show the draft acceptance criteria and ask the user to approve or revise them.
3. After approval, run `adaw approve --root <repo> --summary "<approval>" --json`.
4. If the user revises a criterion later, run `adaw criterion update --root <repo> --criterion <id> ... --json`; old evidence for the changed criterion is cleared.
5. Run `adaw resume --root <repo>` or `adaw next --root <repo>` to recover the active goal and current acceptance gap from repository files.
6. Work only to produce evidence for that gap.
7. Add evidence with `adaw evidence add`.
8. Run `adaw evaluate`.
9. Report acceptance state, not implementation steps.

Useful commands:

- `adaw draft --goal "<goal>" --root <repo>`: create a draft acceptance contract that needs user approval.
- `adaw approve --root <repo>`: mark the acceptance basis as approved so completion can be decided.
- `adaw criterion update --root <repo> --criterion <id> ...`: preserve a user revision as the new acceptance basis.
- `adaw list --root <repo>`: list active ADAW goals.
- `adaw resume --root <repo>`: recover the active goal, current gap, completion answer, and intervention state.
- `adaw status --root <repo>`: answer whether the goal is complete and whether the user needs to act.
- `adaw report --root <repo>`: generate the human acceptance report.
