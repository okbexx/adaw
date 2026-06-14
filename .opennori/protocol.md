# OpenNori Protocol

OpenNori is the product; Nori is the agent-facing role that turns goals into Nori Contracts.

The human-facing surface is acceptance state:

- goal
- user acceptance criteria
- architecture baseline decision
- current acceptance gap
- evidence summary
- final status

Implementation plans are allowed inside the agent's private reasoning, but they are not the default
progress surface and they are not completion evidence.

For non-trivial goals, OpenNori also carries an Architecture Baseline. Product AC answers what the
human user must be able to accept. Architecture Baseline answers what technical architecture the
agent must follow while producing that outcome. These are reported together but kept separate.

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
| AC-P-2 | CLI | Run `opennori check` | The user can reject technical implementation details masquerading as ACs. | Files, fields, commands, tests, or modules cannot be accepted as user ACs by themselves. |
| AC-P-3 | CLI | Run `opennori next` or `opennori status` | The user sees the current acceptance gap and completion answer, not a process-step list. | Output answers which AC is missing, whether complete, and whether human action is required. |
| AC-P-4 | CLI / report | Inspect a high-risk AC | The user sees that weak evidence cannot make it passing. | High-risk passing cannot rely only on agent self-summary. |
| AC-P-5 | CLI / Codex | Trigger `opennori report` | The user sees goal, layered AC statuses, evidence summaries, current gap, intervention, and conclusion. | Report is organized by acceptance state and evidence, not process steps. |
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
| AC-O-9 | Codex conversation | Ask OpenNori to use a good architecture for a non-trivial goal | The user sees Product AC and an Architecture Baseline before implementation starts. | The baseline is not a plan; it names the architecture profile, boundaries, build-vs-buy policy, and challenge rule. |

### L3 Productization AC

The productization layer proves that OpenNori can be installed, reused, reviewed, and cleaned up as
a durable workflow asset.

| ID | Tool / entrypoint | User operation | User acceptance criterion | Passing threshold |
| --- | --- | --- | --- | --- |
| AC-Z-1 | Codex Plugin / package assets | Install or inspect the OpenNori package | The user's agent can discover focused OpenNori Skills without the user memorizing CLI flags. | `.agents/plugins/marketplace.json` points to `./plugins/opennori`; `plugins/opennori/.codex-plugin/plugin.json` points to package-local `skills/`; the `nori` Skill routes natural-language work through acceptance, evidence, profile, architecture, health, and reporting. |
| AC-Z-2 | CLI | Run `opennori install` | The user can install OpenNori into a project without unexpected overwrites. | Install shows created/skipped assets; existing user content is not overwritten by default. |
| AC-Z-3 | Git / PR diff | Review the agent's changes | The user can separate acceptance evidence changes from implementation noise. | Summary defaults to AC status changes, evidence changes, and user impact. |
| AC-Z-4 | CLI | Run `opennori list` and select a goal | The user can see multiple active goals and choose one explicitly. | Multiple active goals are listed with status, gap, and paths; `--goal` selects the target. |
| AC-Z-5 | CLI | Archive a completed or blocked goal | The user removes it from active work while preserving evidence and report. | Active no longer lists the goal; contract, ledger, and report remain recoverable. |
| AC-Z-6 | Project file browser | Inspect the project after running OpenNori | The user sees OpenNori-owned state under `.opennori/` instead of a generic project `process/` directory. | Install, draft, brainstorm, report, and archive write OpenNori state under `.opennori/` by default. |
| AC-Z-7 | CLI / project file browser | Run `opennori install` | The user can inspect project OpenNori registration and judge version, managed entries, active goals, Plugin Skill availability, and protocol capabilities. | Install output uses create, skip, overwrite, or update semantics; `.opennori/manifest.json` records version, managed files, active goals, Plugin state, architecture state, and capabilities. |
| AC-Z-8 | CLI | Run `opennori doctor` | The user can judge whether the project is `ready`, `needs-action`, or `broken`, and see the next recovery action. | Doctor checks `.opennori` structure, manifest consistency, active goal recoverability, packaged Plugin Skills, CLI runtime, and recovery suggestions. |
| AC-Z-9 | CLI | Preview install with `opennori install --dry-run` | The user can judge what OpenNori would create, skip, update, or overwrite before writing to the project. | Install plan lists action, kind, managed status, write intent, destructive flag, and reason; dry-run reports zero actual writes. |
| AC-Z-10 | CLI | Apply force install | The user must preview and explicitly confirm destructive install actions before files are overwritten. | Real `opennori install --force` fails without confirmation; dry-run previews destructive overwrites; confirmed force install may write. |
| AC-Z-11 | CLI | Preview and apply uninstall | The user can uninstall OpenNori entry assets without losing acceptance state by default. | Uninstall plan shows removals and preserved state; real uninstall requires confirmation; `.opennori` state is deleted only with `--include-state --confirm`. |
| AC-Z-12 | Codex Plugin / Codex Skills | Use OpenNori Plugin Skills | The agent gets focused OpenNori Skills for acceptance, evidence, Nori Profile, architecture, project health, and reporting while the user keeps using natural language. | The npm package ships `.agents/plugins/marketplace.json`, `plugins/opennori/.codex-plugin/plugin.json`, and `plugins/opennori/skills/nori*/SKILL.md`; install does not copy Skills into the project; manifest records `plugin`; doctor detects missing packaged Plugin Skills. |
| AC-Z-13 | CLI / project file browser | Establish an Architecture Baseline | The user can see what architecture the agent must follow while implementing Product AC. | `.opennori/architecture/baseline.json`, `.opennori/architecture/baseline.md`, and `.opennori/agent-guide.md` expose the baseline to agents and reviewers. |
| AC-Z-14 | CLI / project file browser | Add a project Architecture Profile | The user can extend built-in profiles with a reviewed project profile. | `opennori architecture profile --from <profile.json>` writes `.opennori/architecture/profiles/<id>.json`; `architecture profiles` lists it before built-ins. |
| AC-Z-15 | CLI / report | Challenge a baseline | The user can review evidence before an agent changes architecture. | `opennori architecture challenge` records current baseline, conflict evidence, recommendation, and user confirmation requirement. |
| AC-Z-16 | CLI / report | Record build-vs-buy decisions | The user can see whether existing dependencies, standard libraries, official SDKs, and mature OSS were checked before self-building infrastructure. | `opennori architecture build-vs-buy` records the decision under `.opennori/architecture/decisions/` and status/report summarize it. |

## Required Artifact Pair

OpenNori writes its project-local state under `.opennori/`.

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

Each active goal has:

- `<goal>.acceptance.md` for human review
- `<goal>.evidence.json` for deterministic agent/tool updates

`.opennori/manifest.json` records the project-local OpenNori registration:

- manifest schema and OpenNori protocol version
- OpenNori package version
- managed `.opennori` files and directories
- active goals recoverable from `.opennori/active`
- OpenNori Plugin and package Skill asset state
- Architecture Baseline, profile, challenge, build-vs-buy, and agent-readable surface state
- protocol capabilities exposed by this CLI

`opennori install` creates or refreshes the manifest. State-changing OpenNori commands refresh it when
`.opennori/` already exists.

`opennori install --dry-run` returns an install plan. The plan uses deterministic action semantics:

- `create`: missing OpenNori asset would be created
- `exists`: required OpenNori directory already exists
- `skip`: existing file is preserved because `--force` was not used
- `overwrite`: existing file would be overwritten because `--force` was used
- `update`: generated OpenNori state, such as the manifest, would be refreshed

Each planned action also reports `kind`, `managed`, `would_write`, `will_write`, `destructive`,
and a short human-readable reason.

Real `opennori install --force` can overwrite OpenNori-managed files, so it requires explicit confirmation.
Run `opennori install --dry-run --force` first to inspect destructive actions, then rerun with
`--confirm` only if those writes are acceptable.

`opennori uninstall --dry-run` returns an uninstall plan. By default it removes the manifest while
preserving Nori Contracts, evidence records, reports, archives, brainstorms, protocol, guide, and
architecture state. Real uninstall requires `--confirm`. Deleting the whole `.opennori` state
directory requires both `--include-state` and `--confirm`.

## OpenNori Plugin Skills

OpenNori exposes Codex Skills through its Plugin and package assets. The user should not need to
remember these Skill names; the root `nori` Skill routes natural-language requests to focused Skills:

- `nori`: root router for OpenNori turns
- `nori-acceptance`: discover AC gaps, brainstorm, draft, approve, and revise human-facing ACs
- `nori-evidence`: record reviewable evidence without forcing fixed adapters
- `nori-capability-profile`: record required Skills, preferred stacks, avoided tools, and install policy
- `nori-architecture-brainstorm`: select or create an Architecture Baseline before non-trivial implementation
- `nori-architecture-apply`: read and apply the confirmed baseline before implementation
- `nori-architecture-challenge`: raise evidence-backed requests to revise a baseline
- `nori-build-vs-buy`: record dependency/library/self-build decisions before infrastructure work
- `nori-project-health`: install, upgrade, uninstall, doctor, manifest, Plugin health, and project recoverability
- `nori-reporting`: status, report, current gap, user intervention, and changes

The package ships `.agents/plugins/marketplace.json` pointing to `./plugins/opennori`, where
`plugins/opennori/.codex-plugin/plugin.json` declares `skills: "./skills/"`. `opennori install`
writes project state under `.opennori/`; it does not copy OpenNori Skills into the user's project.
The manifest records `plugin` state, and `opennori doctor` checks whether packaged Plugin Skills are
present and whether the manifest Plugin state is stale.

When upgrading an existing OpenNori project, upgrade entry assets first, then run `opennori check`.
`check` validates active Nori Contract integrity as hard state structure, then reports
`acceptance_review` findings for vague or possibly implementation-centered ACs such as "modify
profile fields" or "show an error". These review findings are questions for the agent and user,
not hard protocol rejection. `check` also reports `architecture_check` warnings when the active goal
has no confirmed Architecture Baseline, stale agent-readable surface, or unresolved Architecture
Challenges. It reports `evidence_health` warnings when a complete-looking goal relies on stale,
broad, source-free, or non-reviewable evidence. It does not rewrite existing contracts, evidence,
reports, archives, brainstorms, or baselines. The user decides whether to revise affected criteria,
confirm assumptions, accept review risk, revise architecture, or refresh evidence.

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
- `prefer` does not block objective completion, but unknown or violated preferences become `profile_review` risk before confident completion.
- `avoid` blocks completion if violated.

Agents translate the user's natural-language preferences into profile records. Users should not
need to remember `opennori profile` commands.

## Architecture Baseline

Architecture Baseline is separate from Product AC. It is not a plan, phase list, task list, or
implementation checklist. It is sticky architecture guidance for agents and maintainers:

- selected Architecture Profile
- goal it applies to
- architecture principles and boundaries
- Architecture Checks for maintainers or agents
- preferred libraries or technologies
- avoid policy
- build-vs-buy policy
- challenge policy
- agent-readable surfaces

OpenNori includes built-in profiles and supports project profiles under:

```text
.opennori/architecture/profiles/<profile-id>.json
```

Use `opennori architecture profiles --root <project> --json` to list built-ins and project profiles.
The output is intentionally reviewable before baseline confirmation: each profile includes suitable
use cases, reference sources, architecture principles, checks, preferred libraries, avoid
boundaries, validation issues, and build-vs-buy policy.
Use `opennori architecture profile --root <project> --from <profile.json> --json` to add a reviewed
project profile. Existing profiles are not overwritten unless the agent uses `--force` after review.

Use `opennori architecture baseline --root <project> --goal "<goal>" --profile <profile-id> --json`
to preview a baseline. Preview has no side effect. After the user accepts it, rerun with `--confirm`.

Once confirmed, the baseline is written to:

- `.opennori/architecture/baseline.json`
- `.opennori/architecture/baseline.md`
- `.opennori/agent-guide.md`

Agent route files such as `AGENTS.md` or `CLAUDE.md` should point new sessions to these surfaces.
`opennori doctor` checks that the baseline exists when an active goal requires it, that the schema is
valid, and that at least one agent route references `.opennori/architecture/baseline.md`.

If project evidence conflicts with a confirmed baseline, the agent must create an Architecture
Challenge instead of silently changing stack, dependency policy, directory boundaries, state model,
or project architecture:

```bash
opennori architecture challenge --root <project> --summary "<conflict>" --evidence "<evidence>" --recommendation "<change>" --json
```

Build-vs-buy decisions are first-class architecture evidence. Before self-building infrastructure,
the agent checks current project dependencies, standard libraries, official SDKs, mature
open-source libraries, and documented reference projects:

```bash
opennori architecture build-vs-buy --root <project> --area "<area>" --need "<need>" --recommendation <reuse|buy|self-build> --summary "<decision>" --json
```

Architecture state affects completion confidence, not Product AC shape. When every required Product
AC is `passing` or `waived` but the active goal has a missing/draft/invalid/challenged baseline,
stale agent-readable architecture surface, or unhealthy build-vs-buy decisions, OpenNori reports
`objective_complete: true` with `confidence: review-risk`. It must not create synthetic ARCH
acceptance criteria or replace `current_gap` unless a real Product AC or blocking Profile item is
still incomplete.

## Status Model

- `unknown`: no user-understandable evidence exists
- `failing`: evidence shows the criterion is not satisfied
- `passing`: evidence shows the criterion is satisfied
- `blocked`: user decision or external condition required
- `waived`: user explicitly accepts the unmet criterion with a reason

The workflow ledger is complete only when every required criterion is `passing` or `waived`.
The user-facing completion answer is not confidently complete while `evidence_health` has review
findings, `profile_review` is unresolved, `architecture_review` remains, or `build_vs_buy` is
unhealthy, even if the ledger status is already `complete`.

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
`evidence_health` audits that reviewability surface without forcing an adapter taxonomy: it warns
about missing sources, missing reviewability, missing limitations, stale timestamps, and broad batch
summaries.

## Agent Rule

On every turn:

1. If the user gives a fuzzy goal or candidate AC, run `opennori discover --goal "<goal>" --root <repo> --json` before drafting.
2. Ask only the discovery questions that affect completion judgment. Do not turn discovery gaps into implementation tasks or completion evidence.
3. If the user wants to discuss, brainstorm, explore, or is not ready to define acceptance criteria, run `opennori brainstorm --idea "<idea>" --root <repo> --json`.
4. Show only candidate acceptance directions and ask the user to choose or revise a direction. Brainstorm output is not a contract or completion evidence.
5. If the user chooses a candidate, run `opennori draft --from-brainstorm <brainstorm-id> --candidate <A|B|C> --root <repo> --json`.
6. If the user starts with "use OpenNori" / "用 OpenNori 跑这个任务" and discovery gaps are answered or explicitly accepted as assumptions, run `opennori draft --goal "<goal>" --root <repo> --json`.
7. Show the draft acceptance criteria and ask the user to approve or revise them.
8. After approval, run `opennori approve --root <repo> --summary "<approval>" --json`.
9. If the user states required Skills, preferred stacks, avoided tools, install policy, or execution constraints, run `opennori profile add --root <repo> ... --json` and keep those items out of the user acceptance criteria.
10. For non-trivial goals, run `opennori architecture profiles --root <repo> --json`, preview a baseline, show it to the user, and confirm it before implementation.
11. If the user provides a preferred architecture, add it with `opennori architecture profile --root <repo> --from <profile.json> --json` before previewing the baseline.
12. Before implementing an acceptance gap, read `.opennori/architecture/baseline.md` and keep Product AC separate from Architecture Checks.
13. Before self-building infrastructure, record a build-vs-buy decision.
14. If project evidence conflicts with the baseline, run `opennori architecture challenge`; do not silently replace the baseline.
15. If the user revises a criterion later, run `opennori criterion update --root <repo> --criterion <id> ... --json`; old evidence for the changed criterion is cleared.
16. If the user asks to update an existing OpenNori project, run `opennori doctor`, use `opennori upgrade --dry-run/--confirm` for manifest/protocol/guide refreshes, then run `opennori check`; ask the user before revising any existing AC flagged by `acceptance_review`. If packaged Plugin Skills are missing, reinstall or update the OpenNori package instead of copying Skills into the project.
17. Run `opennori resume --root <repo>` or `opennori next --root <repo>` to recover the active goal and current acceptance gap from repository files.
18. Work only to produce evidence for that gap under the confirmed Architecture Baseline.
19. Add acceptance evidence with `opennori evidence add`; choose any suitable verification method, but record basis, sources, reviewability, confidence, and limitations. If existing evidence is invalid or obsolete, run `opennori evidence prune` first so stale proof does not occupy active context. Add profile compliance evidence with `opennori profile evidence` when profile items exist.
15. Run `opennori evaluate`.
16. Report acceptance state, profile compliance, and evidence, not implementation steps.

Useful commands:

- `opennori brainstorm --idea "<idea>" --root <repo>`: create selectable acceptance directions before a contract exists.
- `opennori discover --goal "<goal>" --root <repo>`: find underspecified acceptance gaps before drafting a contract.
- `opennori draft --goal "<goal>" --root <repo>`: create a draft Nori Contract that needs user approval.
- `opennori draft --from-brainstorm <brainstorm-id> --candidate <A|B|C> --root <repo>`: convert a selected brainstorm direction into a draft contract.
- `opennori approve --root <repo>`: mark the acceptance basis as approved so completion can be decided.
- `opennori criterion update --root <repo> --criterion <id> ...`: preserve a user revision as the new acceptance basis.
- `opennori evidence add --root <repo> --criterion <id> --kind <kind> --summary "<summary>" --result <passing|failing|blocked|waived> --basis <basis> --source '<json-or-label>' --reviewability "<how to review>" --limitations "<known limits>"`: attach user-understandable, reviewable evidence without forcing a fixed adapter.
- `opennori evidence prune --root <repo> --criterion <id> --reason "<reason>"`: remove invalid or obsolete evidence from an active criterion so reports and context exports only carry current proof.
- `opennori profile add --root <repo> --type <skill|stack|constraint> --name "<name>" --strength <must|prefer|avoid>`: record user execution preferences separately from ACs.
- `opennori profile evidence --root <repo> --item <item-id> --result <satisfied|violated|waived>`: record whether the agent followed the profile.
- `opennori profile show --root <repo>`: show profile compliance and blocking items.
- `opennori list --root <repo>`: list active OpenNori goals.
- `opennori install --root <repo>`: create or refresh project-local OpenNori assets and manifest.
- `opennori upgrade --root <repo>`: preview and refresh project-local OpenNori assets without rewriting active contracts or evidence.
- `opennori doctor --root <repo>`: inspect project OpenNori health and recovery actions.
- `opennori check --root <repo>`: validate active contract structure, audit active ACs for underspecified acceptance quality, surface Architecture Baseline health for the active goal, and report evidence health.
- `opennori resume --root <repo>`: recover the active goal, current gap, completion answer, and intervention state.
- `opennori status --root <repo>`: answer whether the goal is complete and whether the user needs to act.
- `opennori report --root <repo>`: generate the human acceptance report.
