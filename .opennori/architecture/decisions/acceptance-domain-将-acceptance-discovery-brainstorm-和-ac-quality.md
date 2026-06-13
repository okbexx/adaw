# acceptance-domain-将-acceptance-discovery-brainstorm-和-ac-quality Build-vs-Buy Decision

Area: acceptance-domain
Need: 将 acceptance discovery、brainstorm 和 AC quality audit 从 CLI 入口拆到领域模块
Recommendation: self-build

## Summary

Acceptance discovery、brainstorm 和 AC quality audit 是 OpenNori 的核心产品领域逻辑，当前由 src/acceptance.ts 承载，CLI command modules 只负责参数和状态读写。

## Candidates Checked

- Current project: src/acceptance.ts 已拥有 BRAINSTORM_CANDIDATES、DEFAULT_CRITERIA、DISCOVERY_GAPS、auditAcceptanceQuality 等规则；src/cli/commands/acceptance.ts 负责命令入口；test/core.test.js 与 test/cli-commands.test.js 覆盖 discovery、brainstorm 和 quality audit。
- Standard library: Node.js ESM 模块足够承载常量和纯函数；无需新增运行时依赖。
- Official SDK: 无官方 SDK 适用；这是 OpenNori 产品领域规则。
- Open source: 成熟 NLP/validation 库会增加复杂度，且不能替代 OpenNori 对人类视角 AC 的产品判断；TK 参考强调 Skill/产品面和确定性核心分离。

## Self-build Reason

规则小、可测试、属于 OpenNori 核心语义；抽成领域模块比新增依赖更直接，后续若规则复杂再重新评估 schema/NLP 库。
