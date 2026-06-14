# AGENTS Project Instructions

## OpenNori

OpenNori is a Plugin-first / Skill-driven / CLI-state-backed acceptance product.
Keep these layers separate:

- Codex Plugin / Skills: agent discovery and natural-language routing.
- `opennori` CLI: deterministic state reads/writes and JSON/report output.
- `.opennori/`: project-local contracts, evidence, profiles, architecture, and reports.

Do not implement project-local Skill copying, Skill Pack install/sync, or `.agents/skills` as product behavior. The product goal is for a user agent to get OpenNori through Codex Plugin/Skill discovery, then use the CLI only as the deterministic state layer.

Before implementing a non-trivial change, read:

- `.opennori/active/*.acceptance.md`
- `.opennori/architecture/baseline.md`
- `.opennori/agent-guide.md`
- `plugins/opennori/skills/nori*/SKILL.md`
- `plugins/opennori/.codex-plugin/plugin.json`
- `.agents/plugins/marketplace.json`

Follow the Architecture Baseline while completing Product AC.
If the baseline conflicts with project evidence, create an Architecture Challenge instead of silently replacing it.

When multiple active OpenNori goals exist, pass an explicit `--goal` instead of choosing implicitly.

OpenNori product changes must preserve the original acceptance loop:

```text
user natural-language goal
  -> OpenNori Skill helps the agent draft and confirm human-centered AC
  -> CLI writes .opennori state and evidence
  -> agent works from current acceptance gaps
  -> user judges completion from status/report
```

Do not turn architecture choices, Skills, technology stacks, hooks, AW exports, or implementation tasks into user AC. They can influence Nori Profile, Architecture Baseline, evidence risk, or recovery guidance, but Product AC must remain human-visible operations or judgments.

Keep hard validation and subjective review separate:

- Code may hard-fail objective integrity problems: schema shape, protocol version, required fields, duplicate ids, contract/ledger mismatch, invalid enums, stale managed files, missing local artifacts, or destructive actions without explicit confirmation.
- Code must not hard-fail subjective product judgments such as "this AC feels like implementation detail", "this evidence may be weak", or "this architecture may not be ideal".
- Subjective findings belong in `acceptance_review`, `evidence_health`, `review_risks`, questions, assumptions, waivers, or human confirmation prompts.
- The agent decides how to act on those review signals; the user remains the final judge of whether the goal is accepted.

When changing Skill behavior, update package-local `plugins/opennori/skills/nori*/SKILL.md`, `plugins/opennori/.codex-plugin/plugin.json`, and marketplace metadata first.
Do not add compatibility shims for old `adaw`, `nori`, `opennori skill export`, `install --skill`, or `refresh-skill` entry points.
