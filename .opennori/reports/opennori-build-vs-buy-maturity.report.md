# opennori-build-vs-buy-maturity Acceptance Report

## Decision Summary

Completion: Complete: all required acceptance criteria have passing or waived evidence.
Current gap: None. All required acceptance criteria have passing or waived evidence.
User intervention: No user intervention is currently required.
Recommended next action: This OpenNori goal is complete. If the user has asked to continue, start the next acceptance loop without waiting for another next-step prompt.
Workflow status: complete

## Goal

让 OpenNori 自身形成成熟开源库和官方 SDK 优先的 build-vs-buy 工程习惯：通用基础设施在实现前必须评估当前项目依赖、标准库、官方 SDK、成熟开源库；只有许可证、维护性、安全、包体积、性能或产品边界不满足时才允许最小自研。

## Acceptance Basis

Status: approved
Summary: User approved downgrading this loop to needs-user-review because build-vs-buy evaluation must be discussed with Jarl before it can count as complete.

## Nori Profile

<none>

## Acceptance Status

| ID | Layer | User acceptance criterion | Status | Confidence | Evidence summary | Basis | Sources | Reviewability | Limitations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AC-1 | acceptance | 作为用户，我让 agent 用 OpenNori 推进 OpenNori 自身的通用基础设施改动时，能在 status、check、doctor 或 report 中看到 build-vs-buy 健康状态，而不是只看到 agent 说已经考虑过复用。 | passing | verified | review-result: OpenNori status/check/doctor/report now expose build-vs-buy health as clear, needs-action, or broken; missing candidate fields and self-build reasons surface as build_vs_buy warnings and doctor recovery actions, while superseded historical decisions remain reviewable without counting as current health. | tool-observation | type=command, label=npm run check, command=npm run check; type=command, label=node ./bin/opennori.js check --root . --goal opennori-build-vs-buy-maturity --json, command=node ./bin/opennori.js check --root . --goal opennori-build-vs-buy-maturity --json; type=command, label=node ./bin/opennori.js doctor --root . --json, command=node ./bin/opennori.js doctor --root . --json; type=command, label=node ./bin/opennori.js status --root . --goal opennori-build-vs-buy-maturity --json, command=node ./bin/opennori.js status --root . --goal opennori-build-vs-buy-maturity --json; type=artifact, label=src/architecture.js, path=src/architecture.js; type=artifact, label=src/cli.js, path=src/cli.js; type=artifact, label=src/lifecycle.js, path=src/lifecycle.js; type=artifact, label=test/core.test.js, path=test/core.test.js | Run npm run check, then inspect architecture.build_vs_buy in status/check/report and doctor check build_vs_buy_health; the test suite includes missing-field and superseded-decision regressions. | This verifies the build-vs-buy health surface and current OpenNori self decisions; it does not mean every future infrastructure area is already migrated. |
| AC-2 | acceptance | 作为用户，我查看 OpenNori 自身的架构决策时，能复查每个通用产品基础能力是否优先评估了可复用方案，而不是把用户入口、项目状态、可编辑文档和安装升级卸载体验默认手写。 | passing | reviewed | review-result: OpenNori self architecture decisions now include active reusable-library decisions for citty, JSON Schema/Ajv, yaml frontmatter, and directory-based Skill Pack assets; obsolete parseArgs and JS-string Skill decisions are explicitly marked superseded rather than silently treated as current architecture. | artifact-review | type=command, label=node ./bin/opennori.js architecture show --root . --json, command=node ./bin/opennori.js architecture show --root . --json; type=artifact, label=.opennori/architecture/decisions/cli-command-layer-adopt-citty-for-long-term-typescript-cli.json, path=.opennori/architecture/decisions/cli-command-layer-adopt-citty-for-long-term-typescript-cli.json; type=artifact, label=.opennori/architecture/decisions/skill-pack-directory-assets.json, path=.opennori/architecture/decisions/skill-pack-directory-assets.json; type=artifact, label=.opennori/architecture/decisions/protocol-state-validation-reuse-json-schema-validator-when-contracts-grow.json, path=.opennori/architecture/decisions/protocol-state-validation-reuse-json-schema-validator-when-contracts-grow.json; type=artifact, label=.opennori/architecture/decisions/editable-markdown-parsing-keep-json-authoritative-and-revisit-micromark.json, path=.opennori/architecture/decisions/editable-markdown-parsing-keep-json-authoritative-and-revisit-micromark.json; type=artifact, label=.opennori/architecture/decisions/cli-argument-parsing-replace-growing-ad-hoc-option-scanning-with.json, path=.opennori/architecture/decisions/cli-argument-parsing-replace-growing-ad-hoc-option-scanning-with.json; type=artifact, label=.opennori/architecture/decisions/skill-pack-将-opennori-skill-pack-从-cli-入口拆到独立产品面模块.json, path=.opennori/architecture/decisions/skill-pack-将-opennori-skill-pack-从-cli-入口拆到独立产品面模块.json | Open architecture show output or the listed decision JSON files and verify current_project, standard_library, official_sdk, open_source, recommendation, status, superseded_by, and self_build_reason where applicable. | Some active decisions intentionally keep OpenNori product-domain semantics local; the current CLI implementation is still an incremental migration, not a completed citty rewrite. |
| AC-3 | acceptance | 作为用户，我查看 OpenNori 自身当前报告时，能判断它哪些地方已经复用了标准库或成熟库、哪些地方仍保留最小自研，以及这些自研是否属于 OpenNori 产品语义而不是通用基础设施。 | passing | verified | review-result: OpenNori report/status now let a user distinguish active reuse decisions, superseded historical decisions, and minimal self-build product glue; Skill Pack source of truth has moved to skills/*/SKILL.md, package dependencies now include citty/Ajv/yaml/Clack, and build-vs-buy health reports 9 active decisions plus 3 superseded decisions with no findings. | tool-observation | type=command, label=node ./bin/opennori.js report --root . --goal opennori-build-vs-buy-maturity --json, command=node ./bin/opennori.js report --root . --goal opennori-build-vs-buy-maturity --json; type=command, label=node ./bin/opennori.js architecture show --root . --json, command=node ./bin/opennori.js architecture show --root . --json; type=command, label=node ./bin/opennori.js skill export --pack --json, command=node ./bin/opennori.js skill export --pack --json; type=artifact, label=package.json, path=package.json; type=artifact, label=src/skills.js, path=src/skills.js; type=artifact, label=skills/nori/SKILL.md, path=skills/nori/SKILL.md; type=artifact, label=skills/nori-build-vs-buy/SKILL.md, path=skills/nori-build-vs-buy/SKILL.md; type=artifact, label=.opennori/reports/opennori-build-vs-buy-maturity.report.md, path=.opennori/reports/opennori-build-vs-buy-maturity.report.md | Run report and architecture show, then inspect package.json, src/skills.js, skills/*/SKILL.md, and the generated report to verify active/superseded/self-build distinctions. | This slice fixes Skill Pack asset architecture and build-vs-buy reporting; the later TypeScript/citty command-module migration and public JSON Schema validation are still future implementation slices. |

## Current Acceptance Gap

None. All required acceptance criteria have passing or waived evidence.

## Evidence Health

Status: clear
Summary: Latest evidence is reviewable enough for the current contract.

## User Intervention

No user intervention is currently required.

## Conclusion

Current status: complete

## Architecture Baseline

Architecture decision: valid
Baseline: typescript-agent-state-cli (active)
Challenge: none
Build-vs-buy: clear (9 decisions)
Agent guide: installed

Paths:
- .opennori/architecture/baseline.md
- .opennori/agent-guide.md
