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
- `skills/nori*/SKILL.md`
- `.codex-plugin/plugin.json` if present

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

When changing Skill behavior, update package-local `skills/nori*/SKILL.md` and Plugin metadata first.
Do not add compatibility shims for old `adaw`, `nori`, `opennori skill export`, `install --skill`, or `refresh-skill` entry points.
