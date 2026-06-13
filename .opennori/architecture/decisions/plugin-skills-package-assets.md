# plugin-skills-package-assets Build-vs-Buy Decision

Area: plugin-skills
Need: Ship OpenNori Skills as Codex Plugin package assets instead of hard-coded JavaScript strings or project-local copies
Recommendation: self-build
Status: active

## Summary

Use the OpenAI/Codex Skill directory shape as the source of truth: skills/<name>/SKILL.md with YAML frontmatter, exposed through .codex-plugin/plugin.json and read by a thin runtime module for Plugin state, manifest, and doctor checks.

## Candidates Checked

- Current project: OpenNori ships .codex-plugin/plugin.json and package-local skills/*/SKILL.md assets; src/skills.ts reads package assets and src/plugin.ts reports Plugin state without copying Skills into user projects.
- Standard library: Node fs/path can discover and read package-local Skill assets; no template engine is needed for static Skill content.
- Official SDK: OpenAI/Codex Skill authoring convention is directory-based SKILL.md with optional references/scripts/assets, which defines the asset shape even though no SDK is needed to read local files.
- Open source: superpowers, vibecode-pro-max-kit, ECC, and compound-engineering-plugin demonstrate directory Skill assets and plugin/component packaging boundaries; OpenNori borrows the asset shape without adopting process-centered install/sync.

## Self-build Reason

The local reader is small OpenNori product glue around first-party Skill content; generic plugin registries or template systems would add maintenance and package surface without improving the acceptance loop.
