# opennori-self Acceptance Contract

## Goal

让 OpenNori 从只保存目标、AC、证据、报告的验收工具，升级为能先确立 Architecture Baseline，并让 agent 在后续实现 AC 时持续沿用该技术架构的验收驱动产品；用户不仅能判断产品目标是否完成，也能判断交付物是否按确认过的优秀技术架构完成。

## Acceptance Basis

Status: approved
Summary: User clarified OpenNori must be presented and operated as one coupled capability bundle, not split into Plugin, Skills, and CLI as separable user paths.

## Nori Profile

<none>

## User Acceptance Criteria

| ID | Layer | User acceptance criterion | Measurement | Passing threshold | Status |
| --- | --- | --- | --- | --- | --- |
| AC-P-1 | protocol | 作为用户，我在编辑器或文件浏览器里打开 active Nori Contract 后，能在 60 秒内看懂目标、分层验收标准、每条状态和当前缺口。 | 打开 .opennori/active/<goal>.acceptance.md 并阅读。 | 不读聊天历史、不读实现说明，60 秒内能判断任务在验收层面的状态和下一条缺口。 | passing |
| AC-P-2 | protocol | 作为用户，我运行 opennori check 后，能知道验收标准是否仍然需要人类视角复核，而不是被技术实现清单静默当成完成。 | 对当前 active goal 或故意包含实现词、测试通过、字段存在等表达的验收草案运行 opennori check。 | check 只对 contract/ledger 结构完整性做硬失败；对可能偏离用户视角、过于含糊或实现中心的 AC 输出 acceptance_review findings、warnings 和 agent_guidance，提醒 agent 与用户确认、修订、记录假设或接受 review risk。 | passing |
| AC-P-3 | protocol | 作为用户，我运行 opennori next 或 opennori status 后，看到的是当前验收缺口和完成判断，而不是任务步骤列表。 | 运行 opennori next/status 并查看返回的 current_gap、completion 和 intervention。 | 输出默认回答“当前差哪条 AC、是否完成、是否需要人类动作”，不把过程任务当作主线。 | passing |
| AC-P-4 | protocol | 作为用户，我查看高风险 AC 的状态时，能看到弱证据不能让它变成 passing。 | 给 high risk AC 添加弱 passing 证据，再查看 status 或 report。 | 高风险 passing 不能只由 agent 自我总结证明；缺少强证据时必须保持 failing、unknown 或 blocked。 | passing |
| AC-P-5 | protocol | 作为用户，我运行 opennori report 后，能看到目标、分层 AC 状态、证据摘要、当前缺口、是否需要我介入和结论。 | 运行 opennori report 或让 Codex 生成 OpenNori 报告。 | 报告默认围绕验收状态和证据组织，不把过程任务当作主线。 | passing |
| AC-P-6 | protocol | 作为用户，我查看 OpenNori 报告时，能知道每条通过、阻塞或豁免的 AC 是基于什么证据判断的。 | 给 AC 添加不同来源的证据后运行 opennori report 或 opennori status。 | 报告或状态输出展示证据摘要、判断基础、证据强度和剩余限制；不会只显示 agent 自我结论。 | passing |
| AC-P-7 | protocol | 作为用户，我不需要限制 agent 使用哪种取证工具，但我能复查 agent 引用的证据来源。 | 让 agent 用任意验证方式完成一条 AC，并查看该 AC 的证据来源。 | 证据来源可以是命令、产物、URL、截图、diff、人类确认或其他引用；每个来源都包含用户可理解的 label 或复查线索。 | passing |
| AC-P-8 | protocol | 作为用户，我能区分证据是来自工具观察、人类确认、产物审查、协议校验，还是 agent 的判断。 | 给不同 basis 的证据运行 status/report。 | 输出明确展示证据 basis；agent 判断可以记录，但不会伪装成工具验证或人类确认。 | passing |
| AC-P-9 | protocol | 作为用户，我能看到证据的复查方式和限制，而不是只看到通过结论。 | 添加带复查说明和限制说明的证据后运行 report。 | 报告展示 reviewability 和 limitations；限制不会被隐藏在实现日志里。 | passing |
| AC-P-10 | protocol | 作为用户，我能看到一条 AC 可以由多个证据来源共同支撑，而不要求 agent 把它们拆成固定适配器。 | 为一条 AC 添加包含多个来源的证据后查看 evidence record 和 report。 | 同一条证据可以包含多个 sources；报告能合并展示这些来源，并保留 agent 的自由取证空间。 | passing |
| AC-P-11 | protocol | 作为用户，我在 Codex 对话中说“把这次验证作为证据”后，agent 能按 OpenNori 结构记录，而不要求我记住 CLI 参数。 | 查看 OpenNori Skill 导出的证据记录说明，并检查 agent 使用自然语言到 CLI 的映射。 | Skill 明确要求 agent 自由选择验证方式，但记录证据时说明 basis、sources、reviewability、confidence 和 limitations。 | passing |
| AC-P-12 | protocol | 作为用户，我运行 opennori check 或让 agent 升级已使用 OpenNori 的项目后，能发现现有 active contract 里过于含糊的 AC，并知道这是需要讨论的 review risk，而不是协议硬拒绝。 | 对已有 active goal 中包含“修改字段”“失败时有提示”或实现中心表达的 Nori Contract 运行 opennori check；再对结构正确且包含具体用户操作、字段范围、反馈和判断方式的 contract 运行 check。 | check 在不改写历史 contract/evidence 的前提下输出 acceptance_review findings、warnings 和下一步建议；弱 AC 会标出缺少的字段范围、校验规则、成功反馈、失败场景或范围边界；具体 AC 不产生 review finding；结构合法的 contract 不会只因启发式词表而 invalid。 | passing |
| AC-P-13 | protocol | 作为用户，我打开 opennori report 后，能先看到完成结论、当前缺口和是否需要我介入，再查看详细 AC 表格。 | 运行 opennori report 并阅读报告顶部内容，再向下查看 Acceptance Status 表格。 | 报告在详细表格前显示 Decision Summary，包含 completion、current gap、user intervention 和 workflow status；blocked 报告也先显示需要用户采取的动作。 | passing |
| AC-O-1 | operator | 作为用户，我在 Codex 对话里说“用 OpenNori 跑这个任务：目标是 X”后，能看到一份待确认的人类视角验收草案。 | 在 Codex 对话中查看 agent 返回的验收草案。 | 草案只描述用户通过工具执行操作后能完成的判断或动作；用户能直接 approve 或 revise。 | passing |
| AC-O-2 | operator | 作为用户，我在 Codex 对话里 approve 或 revise 验收标准后，能控制什么叫完成，而不是让 agent 自动决定完成定义。 | 查看 active Nori Contract 中是否反映用户确认后的验收标准。 | agent 在用户确认前不能进入 complete 判断；用户修改过的 AC 会成为后续状态判断依据。 | passing |
| AC-O-3 | operator | 作为用户，我在新的 Codex 会话里说“继续 OpenNori”后，agent 能恢复当前 active goal 并告诉我当前关键验收缺口。 | 在新会话触发 OpenNori 恢复流程，观察 agent 返回内容。 | 不依赖旧聊天上下文；能返回 goal id、当前状态、当前关键缺口和下一条需要证据的 AC。 | passing |
| AC-O-4 | operator | 作为用户，我在 Codex 对话里问“现在完成了吗？”后，agent 只能基于 required AC 的状态和证据回答。 | 向 agent 询问完成状态并检查回答依据。 | 只有 required AC 全部 passing 或 waived 时才能回答 complete；否则必须指出未通过或 blocked 的 AC。 | passing |
| AC-O-5 | operator | 作为用户，我在 Codex 对话里问“我需要做什么？”后，如果任务 blocked，能看到一个明确的人类动作。 | 制造或查看 blocked 状态下的 OpenNori 报告或 agent 回复。 | blocked 说明必须是用户可执行动作，例如确认取舍、提供权限、批准成本或选择方案，而不是技术日志。 | passing |
| AC-O-6 | operator | 作为用户，我发现新事实后在对话中修改某条 AC，agent 后续只按更新后的验收标准判断完成。 | 用户提出 AC 修改后，查看 active contract、status 和 report。 | 更新后的 AC 成为后续 completion 和 current_gap 的唯一验收依据；旧标准不会继续被当成完成条件。 | passing |
| AC-O-7 | operator | 作为用户，我说“OpenNori 先头脑风暴：想法 X”后，能看到几个可选择的验收方向，而不需要记住 CLI 用法。 | 在 Codex 对话中触发 brainstorm，查看 agent 展示的候选方向。 | 候选项围绕用户价值、可观察验收方式和风险组织；用户能选择或改写方向进入 draft；brainstorm 输出不能被当作 Nori Contract 或完成证据。 | passing |
| AC-O-8 | operator | 作为用户，我在 Codex 对话里声明必须使用某个 Skill、偏好某个技术栈或避免某个工具后，agent 能记录这些偏好并在完成前告诉我是否遵守。 | 在 Codex 对话中提出能力偏好后，查看 active contract、status 或 report 中的 Nori Profile。 | 用户不需要记住 CLI；must 或 avoid 的违反会阻止 complete，prefer 会被展示但不阻止 complete；这些偏好不会被写成用户 AC。 | passing |
| AC-Z-1 | productization | 作为用户，我获取 OpenNori 包后，我的 agent 能通过 Codex Plugin 发现 OpenNori Skills，而不需要我记住内部 Skill 名或手动查找能力入口。 | 查看 Codex Plugin manifest、package Skills、README 和 opennori doctor 输出。 | 包内包含 .codex-plugin/plugin.json 且 skills 指向 ./skills/；nori 总入口和子 Skills 说明自然语言路由；doctor 报告 plugin_manifest、plugin_skills 和 manifest_plugin_state；用户能判断 Plugin Skills 可用。 | passing |
| AC-Z-2 | productization | 作为用户，我运行 opennori install 后，能把 OpenNori 放入当前项目的可用入口，并且不会意外覆盖已有内容。 | 在一个已有项目中运行安装入口并查看安装结果。 | 安装前能看到将创建或跳过的入口；已有内容默认不被覆盖；失败时说明用户需要做什么。 | passing |
| AC-Z-3 | productization | 作为用户，我在 Git 或 PR diff 中审查 agent 本轮改动后，能区分验收证据变化和实现过程噪音。 | 查看本轮 diff 或报告变更摘要。 | 默认摘要围绕 AC 状态变化、证据变化和用户影响组织；实现过程只作为附属证据出现。 | passing |
| AC-Z-4 | productization | 作为用户，我运行 opennori list 后，能看到多个 active goals，并能明确选择要继续的目标。 | 创建多个 active goals 后运行 opennori list，并用 --goal 指定 resume/status/report 的目标。 | 多个目标不会被 agent 随机选择；用户能看见目标列表、状态、当前缺口和对应路径。 | passing |
| AC-Z-5 | productization | 作为用户，我运行归档入口后，completed 或 blocked 中保留报告，active 中不再出现这个目标。 | 对 complete 或 blocked goal 执行归档，再运行 opennori list 并打开归档产物。 | 归档不会丢失 Nori Contract、evidence record 或 report；active 列表只显示仍需推进的目标。 | passing |
| AC-Z-6 | productization | 作为用户，我在项目目录运行 OpenNori 后，能看到 OpenNori 状态集中在 .opennori 目录里，而不是散落到通用 process 目录。 | 运行 opennori install、draft、brainstorm、report 或 archive 后查看项目目录。 | OpenNori 默认只把协议、active goal、报告、归档和 brainstorm 写入 .opennori；不创建 process/acceptance 或 process/development-protocols。 | passing |
| AC-Z-7 | productization | 作为用户，我运行 opennori install 后，能看到当前项目的 OpenNori 接入登记信息，并判断版本、托管入口、active goals、Plugin Skill 状态和协议能力是否可信。 | 运行 opennori install --dry-run 或 opennori install 后查看输出和 .opennori/manifest.json。 | 输出包含 create、skip、overwrite 或 update 语义；manifest 说明 OpenNori 版本、managed files、active goals、plugin 状态、architecture 状态和协议能力；已有用户内容默认不被覆盖。 | passing |
| AC-Z-8 | productization | 作为用户，我运行 opennori doctor 后，能判断当前项目是 ready、needs-action 还是 broken，并知道下一步修复动作。 | 在已安装项目、缺少接入登记的项目、Plugin 资产异常或 active goal 异常的项目中运行 opennori doctor。 | 输出包含整体健康状态、逐项检查结果、active goal 可恢复性、packaged Plugin Skill 状态、manifest plugin state 和可执行的 recovery 建议。 | passing |
| AC-Z-9 | productization | 作为用户，我预览 OpenNori 安装时，能判断每个项目入口会被创建、跳过、更新还是覆盖，并确认 dry-run 不会写入项目。 | 运行 opennori install --dry-run，查看 install plan，再检查项目文件是否未被写入。 | install plan 对每个入口显示 action、kind、managed、would_write、will_write、destructive 和 reason；dry-run 下 will_write 为 0；覆盖类动作必须被标记为 destructive。 | passing |
| AC-Z-10 | productization | 作为用户，我执行可能覆盖已有 OpenNori 入口的安装时，必须先看到预览并显式确认，才能真正写入项目。 | 在已有 OpenNori 入口的项目中运行 opennori install --force、opennori install --force --dry-run 和确认后的安装。 | 未确认的真实 --force 安装会失败并提示先 dry-run；dry-run 可展示 destructive overwrite；只有带显式确认的 --force 才会执行覆盖写入。 | passing |
| AC-Z-11 | productization | 作为用户，我卸载 OpenNori 前，能预览将移除什么，并确认默认卸载不会丢失 active goals、证据、报告或归档。 | 在已安装且有 active goal 的项目中运行 opennori uninstall --dry-run、未确认 uninstall、确认 uninstall 和 include-state uninstall。 | 默认 uninstall plan 标明 entry assets 会被移除、验收状态会被 preserve；未确认真实卸载会失败；确认后只移除入口资产；只有显式 --include-state --confirm 才会删除 .opennori 状态目录。 | passing |
| AC-Z-12 | productization | 作为用户，我安装或获取 OpenNori 后，agent 能通过一组职责清晰的 OpenNori Plugin Skills，把自然语言请求稳定映射到验收发现、架构基线、证据、能力偏好、项目健康、报告和下一轮候选目标，而不需要我记住 Skill 名或 CLI 参数。 | 查看 .codex-plugin/plugin.json、plugins/opennori/skills/nori*/SKILL.md、opennori doctor、opennori status/report/context export，以及典型自然语言场景下的 Skill 路由说明。 | Skill Pack 不只是命令清单：每个 Skill 都包含触发语义、agent 应先读取的状态、用户回复形态、状态写入边界、handoff 到其他 Skill 的条件和误用防护；总入口能处理继续、完成判断、记录证据、能力偏好、架构优先、项目健康和 candidate_goals；所有 Skill 都保持 Plugin-first，不要求项目内 Skill copy/sync，不把 architecture/profile/build-vs-buy/candidate_goals 写成 Product AC 或过程计划。 | passing |
| AC-Z-13 | productization | 作为用户，我运行 opennori doctor 后，如果项目状态不健康，能直接看到一组可执行恢复动作。 | 分别制造缺失 manifest、stale manifest、缺失 package Plugin assets 和损坏 active goal 的项目，然后运行 opennori doctor。 | doctor 输出 status、失败 check、active_goal_issues、Plugin asset health 和 recovery_actions；recovery_actions 说明要运行的 OpenNori 命令或要检查的 .opennori/active 文件位置。 | passing |
| AC-Z-14 | productization | 作为用户，我让 agent 继续一个已经完成的 OpenNori goal 时，不需要每轮都追问下一步是什么；agent 能看到少量可开启下一份 Nori Contract 的人类目标候选。 | 运行 opennori resume、opennori status、opennori next、opennori report 和 context export，查看 complete goal 的 next_recommendation。 | 已完成且无 review risk 的 goal 输出 ready-for-next-loop，并包含 candidate_goals；每个候选包含 goal、user_value、acceptance_directions 和 risks，帮助 agent 进入下一轮 AC discovery，但不呈现为 phase、plan 或 task list。 | passing |
| AC-Z-15 | productization | 作为用户，我让 agent 记录验收证据时，不需要 agent 为常见来源手写复杂结构。 | 运行 opennori evidence add，分别使用 --source-command、--source-path、--source-url 和自由 --source 记录证据，再查看 status/report。 | 证据来源能显示为 command、artifact、url 或自由 reference；report/status 中仍保留 basis、reviewability、limitations 和 confidence。 | passing |
| AC-Z-16 | productization | 作为用户，我通过 npm 获取 OpenNori 后，能用 opennori 或 npx opennori 这个短入口开始，而不需要理解 install、root、dry-run、confirm 或内部 Skill 参数。 | 在全新临时项目中运行 opennori 或 npx opennori 等价入口，再确认 bootstrap 后运行 opennori doctor。 | npm 包只提供 opennori 这个 bin；短入口默认展示首次接入 preview 且不写入项目；显式确认后只创建 .opennori 状态；不会向项目写入 package Skill assets；doctor 为 ready。 | passing |
| AC-Z-17 | productization | 作为用户，我第一次打开 README 或官网 Quick Start 时，能看到短到可以直接复制的 npx opennori 入口，而不是一串内部安装参数。 | 阅读 README Try It 和官网首屏 Quick Start / Start 区域。 | README 和官网第一眼 Quick Start 展示 npx opennori；更详细的 opennori bootstrap、install、dry-run、confirm 只作为 agent 或高级用户的底层安全路径出现。 | passing |
| AC-A-1 | architecture | 作为用户，我用自然语言告诉 agent 一个非平凡目标后，能先看到 Product AC 和 Architecture Baseline，让我判断要完成什么以及准备按什么技术架构完成。 | 在 OpenNori Skill 指引下查看 draft/discover 输出和 architecture baseline preview。 | 用户能在实现开始前分别确认 Product AC 和 Architecture Baseline；baseline 不呈现为阶段计划或任务列表。 | passing |
| AC-A-2 | architecture | 作为用户，我确认 Architecture Baseline 后，新开的 agent session 能通过 OpenNori Plugin Skills 和 .opennori 状态识别这条架构约束，并知道后续实现必须沿用它。 | 在新会话中查看 OpenNori Plugin Skills、.opennori/agent-guide.md、architecture baseline、可选 agent route 和 architecture show/status 输出。 | 用户能判断新 session 不依赖旧聊天上下文也能通过 Plugin Skills 或 .opennori 状态找到架构约束；报告明确提示 agent 应提出 challenge 而不是静默替换。 | passing |
| AC-A-3 | architecture | 作为用户，我可以选择 OpenNori 内置优秀架构 profile，也可以声明自己的项目架构 profile，并让它影响 baseline 和完成判断。 | 运行 architecture profiles、architecture profile --from 和 architecture baseline --profile。 | 内置 profile 和项目 profile 都能列出；项目 profile 可生成 baseline；技术偏好不会被写成 Product AC。 | passing |
| AC-A-4 | architecture | 作为用户，当 agent 认为 baseline 不适合当前项目时，我看到明确 Architecture Challenge，而不是 agent 静默改架构。 | 运行 opennori architecture challenge 后查看 status/report 和 challenge 文件。 | challenge 展示当前 baseline、项目证据、冲突说明、建议修正和是否需要用户确认。 | passing |
| AC-A-5 | architecture | 作为用户，我查看 status/report 时，能看到 Product decision 和 Architecture decision 分开呈现。 | 运行 opennori status、opennori report 和 context export。 | 输出分别展示产品 AC 状态、Architecture Baseline 状态、open challenges、build-vs-buy decisions、当前缺口和下一步证据。 | passing |
| AC-A-6 | architecture | 作为用户，我运行 doctor/check 时，能知道 Architecture Baseline 是否可用、Plugin Skills 是否随包可用、manifest 是否记录该能力，以及项目提示是否过期。 | 运行 opennori doctor/check，并查看缺失 baseline、缺失 Plugin assets、manifest stale 或项目提示过期时的输出。 | doctor/check 返回 ready、needs-action 或 broken，并显示用户能执行或交给 agent 执行的恢复建议；恢复建议不要求把 OpenNori Skills 复制进用户项目。 | passing |
| AC-A-7 | architecture | 作为用户，我在 agent 准备自研基础设施前，能看到它已经比较过可复用选择，并说明为什么仍要自研或复用。 | 查看 architecture build-vs-buy 输出、architecture decisions 记录、status 或 report。 | 报告能让我判断 agent 是否检查过项目现有依赖、标准库、官方方案、成熟开源方案和自研理由；自研不能只有口头总结。 | passing |
| AC-A-8 | architecture | 作为用户，我查看 OpenNori 自身 dogfood 状态时，能知道 Architecture Baseline 已建立，但后续架构修复是否真的完成不能被最小可运行结果误报。 | 查看 OpenNori 自身 status/report、Architecture Baseline、build-vs-buy decision、代码结构审查和后续架构修复证据。 | 报告能清楚显示 baseline 已建立、当前仍有哪些架构风险或未完成缺口；如果核心结构仍未完成修复，目标不能显示 complete。 | passing |
| AC-A-9 | architecture | 作为用户，我打开 README 或官网时，能理解 OpenNori 同时提供产品验收、架构基线、Plugin Skills、证据和完成判断，而不是过程模板工具。 | 阅读 README、官网首页、protocol 和 OpenNori Skills。 | 用户能看到 Architecture Baseline、Architecture Challenge、build-vs-buy、Plugin Skills、项目 profile 和 Product AC 分离的说明与用例。 | passing |
| AC-A-10 | architecture | 作为用户，我能在一个非 OpenNori 核心仓库里，按新的 Plugin-first 边界完整跑通自然语言目标、Product AC、Architecture Baseline、执行、证据、报告和完成判断。 | 选择一个非 OpenNori 核心仓库，使用当前 OpenNori 从目标到报告跑完；过程中只通过 Plugin Skills 和 .opennori 状态驱动 OpenNori 能力。 | 报告同时呈现产品完成状态、架构健康状态、Plugin package 能力、证据、未解决风险和是否需要用户确认；用户不需要记住 CLI 参数；doctor/check 不依赖项目内 Skill 资产副本。 | passing |
| AC-Z-18 | productization | 作为用户，我第一次阅读 OpenNori 的 README、官网或 Plugin 说明时，理解 OpenNori 是一个 agent capability bundle：Codex Plugin 负责分发发现，packaged Skills 负责 agent 行为协议，opennori CLI 负责确定性状态读写，.opennori 负责项目状态；我不会被引导把 Plugin、Skills 或 CLI 当成三种可拆开的独立产品路径。 | 阅读 README Install/Quick Start、官网 Start 区域、Plugin longDescription、nori/nori-project-health Skills、protocol，并检查测试对主路径文案和 Skill 边界的断言。 | 用户主路径表达为安装和使用 OpenNori capability bundle；CLI 被说明为 Skills 使用的 deterministic state layer 和高级/CI 入口，而不是与 Plugin 并列的替代使用方式；文档和 Skill 明确不要继续使用半残模式，缺 Plugin/Skills/CLI/state 任一关键能力时应通过 doctor/health 引导补齐；测试防止重新出现 Choose one path、Try CLI once、Pin CLI to this project 这类拆分心智。 | passing |

## Rule

Progress is determined by acceptance evidence, not by implementation steps.
