# adaw-self Acceptance Report

## Goal

让 ADAW 成为人类用户可验收、agent 可执行、跨会话可恢复的验收驱动协议；用户通过真实工具判断目标是否达成，而不是追踪过程计划。

## Acceptance Basis

Status: approved
Summary: User agreed to the layered ADAW self acceptance criteria.

## Capability Profile

| ID | Type | Name | Strength | Compliance | Purpose |
| --- | --- | --- | --- | --- | --- |
| constraint-profile-stays-out-of-user-acs | constraint | profile-stays-out-of-user-acs | must | satisfied | Capability Profile records agent execution preferences without turning them into user acceptance criteria. |

## Acceptance Status

| ID | Layer | User acceptance criterion | Status | Confidence | Evidence summary |
| --- | --- | --- | --- | --- | --- |
| AC-P-1 | protocol | 作为用户，我在编辑器或文件浏览器里打开 active acceptance contract 后，能在 60 秒内看懂目标、分层验收标准、每条状态和当前缺口。 | passing | verified | test-summary: Acceptance contract renders goal, Capability Profile, layered ACs, status, and current gap in .adaw/active/adaw-self.acceptance.md. |
| AC-P-2 | protocol | 作为用户，我运行 adaw check 后，能知道验收标准是否仍然是用户视角，而不是技术实现清单。 | passing | verified | test-summary: adaw check validates contracts and rejects implementation-detail ACs. |
| AC-P-3 | protocol | 作为用户，我运行 adaw next 或 adaw status 后，看到的是当前验收缺口和完成判断，而不是任务步骤列表。 | passing | verified | test-summary: adaw next/status return current_gap, completion, and intervention instead of process steps. |
| AC-P-4 | protocol | 作为用户，我查看高风险 AC 的状态时，能看到弱证据不能让它变成 passing。 | passing | verified | test-summary: High-risk gate downgrades weak passing evidence and accepts only strong evidence kinds or confidence. |
| AC-P-5 | protocol | 作为用户，我运行 adaw report 后，能看到目标、分层 AC 状态、证据摘要、当前缺口、是否需要我介入和结论。 | passing | verified | test-summary: adaw report renders layered AC status, Capability Profile, evidence summary, current gap, user intervention, and conclusion. |
| AC-O-1 | operator | 作为用户，我在 Codex 对话里说“用 ADAW 跑这个任务：目标是 X”后，能看到一份待确认的人类视角验收草案。 | passing | verified | artifact: Repo-local .agents/skills/adaw/SKILL.md instructs Codex to run adaw draft when the user says '用 ADAW 跑这个任务：目标是 X'. |
| AC-O-2 | operator | 作为用户，我在 Codex 对话里 approve 或 revise 验收标准后，能控制什么叫完成，而不是让 agent 自动决定完成定义。 | passing | verified | test-summary: adaw draft keeps acceptance_basis=draft and cannot become complete until adaw approve records user approval; tests cover draft gate and approval. |
| AC-O-3 | operator | 作为用户，我在新的 Codex 会话里说“继续 ADAW”后，agent 能恢复当前 active goal 并告诉我当前关键验收缺口。 | passing | verified | review-result: resume --root . restores adaw-self from .adaw files and reports current gap without relying on prior chat context. |
| AC-O-4 | operator | 作为用户，我在 Codex 对话里问“现在完成了吗？”后，agent 只能基于 required AC 的状态和证据回答。 | passing | verified | test-summary: status/completion answers are computed only from required AC statuses, profile compliance, and evidence; incomplete goals report the current unmet AC instead of complete. |
| AC-O-5 | operator | 作为用户，我在 Codex 对话里问“我需要做什么？”后，如果任务 blocked，能看到一个明确的人类动作。 | passing | verified | test-summary: blocked evidence and profile blockers produce status.intervention with a concrete human action. |
| AC-O-6 | operator | 作为用户，我发现新事实后在对话中修改某条 AC，agent 后续只按更新后的验收标准判断完成。 | passing | verified | test-summary: adaw criterion update records the user revision as approved acceptance basis and clears stale evidence for the changed AC. |
| AC-O-7 | operator | 作为用户，我说“ADAW 先头脑风暴：想法 X”后，能看到几个可选择的验收方向，而不需要记住 CLI 用法。 | passing | verified | test-summary: adaw brainstorm creates selectable acceptance directions under .adaw/brainstorms, not a process plan; Skill tells Codex to invoke it from natural language and not treat output as contract or completion evidence. |
| AC-O-8 | operator | 作为用户，我在 Codex 对话里声明必须使用某个 Skill、偏好某个技术栈或避免某个工具后，agent 能记录这些偏好并在完成前告诉我是否遵守。 | passing | verified | test-summary: Capability Profile records user-declared Skills/stacks/constraints separately from ACs; must/avoid compliance affects completion and appears in status/report. |
| AC-Z-1 | productization | 作为用户，我运行 adaw skill export 后，能得到可放入 Codex Skills 的 ADAW 使用说明。 | passing | verified | test-summary: adaw skill export emits a Codex Skill draft covering setup, doctor, destructive install preview, uninstall preview, brainstorm, draft, approve, criterion update, profile, resume, next, evidence, evaluate, status, and report. |
| AC-Z-2 | productization | 作为用户，我运行 adaw install 后，能把 ADAW 放入当前项目的可用入口，并且不会意外覆盖已有内容。 | passing | verified | test-summary: adaw install creates .adaw assets, optional repo-local Skill, manifest, and a structured install plan while skipping existing content by default. |
| AC-Z-3 | productization | 作为用户，我在 Git 或 PR diff 中审查 agent 本轮改动后，能区分验收证据变化和实现过程噪音。 | passing | verified | test-summary: adaw changes groups .adaw acceptance artifacts separately from implementation files for review. |
| AC-Z-4 | productization | 作为用户，我运行 adaw list 后，能看到多个 active goals，并能明确选择要继续的目标。 | passing | verified | test-summary: adaw list shows multiple active goals from .adaw/active and resume/status/report require --goal instead of random selection. |
| AC-Z-5 | productization | 作为用户，我运行归档入口后，completed 或 blocked 中保留报告，active 中不再出现这个目标。 | passing | verified | test-summary: adaw archive moves complete and blocked goals out of .adaw/active while preserving contract, evidence ledger, and report. |
| AC-Z-6 | productization | 作为用户，我在项目目录运行 ADAW 后，能看到 ADAW 状态集中在 .adaw 目录里，而不是散落到通用 process 目录。 | passing | verified | test-summary: Default ADAW writes target .adaw/protocol.md, .adaw/manifest.json, .adaw/active, .adaw/reports, .adaw/completed, .adaw/blocked, and .adaw/brainstorms; tests assert install does not create process/. |
| AC-Z-7 | productization | 作为用户，我运行 adaw install 后，能看到当前项目的 ADAW 接入登记信息，并判断版本、托管入口、active goals 和 Skill 状态是否可信。 | passing | verified | test-summary: install dry-run and install output expose structured actions and .adaw/manifest.json records version, managed files, active goals, Skill state, and capabilities. |
| AC-Z-8 | productization | 作为用户，我运行 adaw doctor 后，能判断当前项目是 ready、needs-action 还是 broken，并知道下一步修复动作。 | passing | verified | test-summary: doctor reports ready, needs-action, and broken states, detects stale manifest version/capabilities, and includes checks for structure, manifest, active goal recoverability, Skill sync, runtime, and recovery actions. |
| AC-Z-9 | productization | 作为用户，我预览 ADAW 安装时，能判断每个项目入口会被创建、跳过、更新还是覆盖，并确认 dry-run 不会写入项目。 | passing | verified | test-summary: install dry-run returns install_plan actions with action, kind, managed, would_write, will_write, destructive, and reason; tests assert dry-run writes nothing and force overwrite is destructive. |
| AC-Z-10 | productization | 作为用户，我执行可能覆盖已有 ADAW 入口的安装时，必须先看到预览并显式确认，才能真正写入项目。 | passing | verified | test-summary: Real install --force fails without --confirm, force dry-run previews destructive overwrite, and force --confirm performs the overwrite only after explicit confirmation. |
| AC-Z-11 | productization | 作为用户，我卸载 ADAW 前，能预览将移除什么，并确认默认卸载不会丢失 active goals、证据、报告或归档。 | passing | verified | test-summary: uninstall dry-run returns uninstall_plan, default uninstall preserves active goals/evidence/reports/archives, unconfirmed uninstall fails, and --include-state --confirm is required to remove .adaw state. |

## Current Acceptance Gap

None. All required acceptance criteria have passing or waived evidence.

## User Intervention

No user intervention is currently required.

## Conclusion

Current status: complete
