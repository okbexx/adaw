# adaw-self Acceptance Report

## Goal

让 ADAW 成为人类用户可验收、agent 可执行、跨会话可恢复的验收驱动协议；用户通过真实工具判断目标是否达成，而不是追踪过程计划。

## Acceptance Basis

Status: approved
Summary: User agreed to the layered ADAW self acceptance criteria and the operator work direction.

## Acceptance Status

| ID | Layer | User acceptance criterion | Status | Confidence | Evidence summary |
| --- | --- | --- | --- | --- | --- |
| AC-P-1 | protocol | 作为用户，我在编辑器或文件浏览器里打开 active acceptance contract 后，能在 60 秒内看懂目标、分层验收标准、每条状态和当前缺口。 | passing | verified | test-summary: Acceptance contract renders layered ACs with status and current gap readable from process/acceptance/active/adaw-self.acceptance.md. |
| AC-P-2 | protocol | 作为用户，我运行 adaw check 后，能知道验收标准是否仍然是用户视角，而不是技术实现清单。 | passing | verified | test-summary: adaw check validates contracts and rejects implementation-detail ACs. |
| AC-P-3 | protocol | 作为用户，我运行 adaw next 或 adaw status 后，看到的是当前验收缺口和完成判断，而不是任务步骤列表。 | passing | verified | test-summary: adaw next/status return current_gap, completion, and intervention instead of process steps. |
| AC-P-4 | protocol | 作为用户，我查看高风险 AC 的状态时，能看到弱证据不能让它变成 passing。 | passing | verified | test-summary: High-risk gate downgrades weak passing evidence and accepts only strong evidence kinds or confidence. |
| AC-P-5 | protocol | 作为用户，我运行 adaw report 后，能看到目标、分层 AC 状态、证据摘要、当前缺口、是否需要我介入和结论。 | passing | verified | test-summary: adaw report renders layered AC status, evidence summary, current gap, user intervention, and conclusion. |
| AC-O-1 | operator | 作为用户，我在 Codex 对话里说“用 ADAW 跑这个任务：目标是 X”后，能看到一份待确认的人类视角验收草案。 | passing | verified | artifact: Repo-local .agents/skills/adaw/SKILL.md instructs Codex to run adaw draft when the user says '用 ADAW 跑这个任务：目标是 X'; operator smoke produced a draft acceptance contract with approval/revision next action. |
| AC-O-2 | operator | 作为用户，我在 Codex 对话里 approve 或 revise 验收标准后，能控制什么叫完成，而不是让 agent 自动决定完成定义。 | passing | verified | test-summary: adaw draft keeps acceptance_basis=draft and cannot become complete until adaw approve records user approval; tests cover draft gate and approval. |
| AC-O-3 | operator | 作为用户，我在新的 Codex 会话里说“继续 ADAW”后，agent 能恢复当前 active goal 并告诉我当前关键验收缺口。 | passing | verified | review-result: resume --root . restores adaw-self from repo files and reports current gap AC-O-3 without relying on prior chat context. |
| AC-O-4 | operator | 作为用户，我在 Codex 对话里问“现在完成了吗？”后，agent 只能基于 required AC 的状态和证据回答。 | passing | verified | test-summary: status/completion answers are computed only from required AC statuses and evidence; incomplete goals report the current unmet AC instead of complete. |
| AC-O-5 | operator | 作为用户，我在 Codex 对话里问“我需要做什么？”后，如果任务 blocked，能看到一个明确的人类动作。 | passing | verified | test-summary: blocked evidence produces status.intervention with a concrete human action, verified by blocked criteria tests. |
| AC-O-6 | operator | 作为用户，我发现新事实后在对话中修改某条 AC，agent 后续只按更新后的验收标准判断完成。 | passing | verified | test-summary: adaw criterion update records the user revision as approved acceptance basis and clears stale evidence for the changed AC. |
| AC-Z-1 | productization | 作为用户，我运行 adaw skill export 后，能得到可放入 Codex Skills 的 ADAW 使用说明。 | passing | verified | test-summary: adaw skill export emits a Codex Skill draft covering resume, next, evidence add, evaluate, status, and report. |
| AC-Z-2 | productization | 作为用户，我运行 adaw install 后，能把 ADAW 放入当前项目的可用入口，并且不会意外覆盖已有内容。 | passing | verified | test-summary: adaw install creates process assets and optional repo-local Skill while skipping existing content by default. |
| AC-Z-3 | productization | 作为用户，我在 Git 或 PR diff 中审查 agent 本轮改动后，能区分验收证据变化和实现过程噪音。 | passing | verified | test-summary: adaw changes groups acceptance artifacts separately from implementation files for review. |
| AC-Z-4 | productization | 作为用户，我运行 adaw list 后，能看到多个 active goals，并能明确选择要继续的目标。 | passing | verified | test-summary: adaw list shows multiple active goals and resume/status/report require --goal instead of random selection. |
| AC-Z-5 | productization | 作为用户，我运行归档入口后，completed 或 blocked 中保留报告，active 中不再出现这个目标。 | passing | verified | test-summary: adaw archive moves complete and blocked goals out of active while preserving contract, evidence ledger, and report. |

## Current Acceptance Gap

None. All required acceptance criteria have passing or waived evidence.

## User Intervention

No user intervention is currently required.

## Conclusion

Current status: complete
