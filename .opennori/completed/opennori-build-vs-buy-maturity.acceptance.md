# opennori-build-vs-buy-maturity Acceptance Contract

## Goal

让 OpenNori 自身形成成熟开源库和官方 SDK 优先的 build-vs-buy 工程习惯：通用基础设施在实现前必须评估当前项目依赖、标准库、官方 SDK、成熟开源库；只有许可证、维护性、安全、包体积、性能或产品边界不满足时才允许最小自研。

## Acceptance Basis

Status: approved
Summary: User approved downgrading this loop to needs-user-review because build-vs-buy evaluation must be discussed with Jarl before it can count as complete.

## Nori Profile

<none>

## User Acceptance Criteria

| ID | Layer | User acceptance criterion | Measurement | Passing threshold | Status |
| --- | --- | --- | --- | --- | --- |
| AC-1 | acceptance | 作为用户，我让 agent 用 OpenNori 推进 OpenNori 自身的通用基础设施改动时，能在 status、check、doctor 或 report 中看到 build-vs-buy 健康状态，而不是只看到 agent 说已经考虑过复用。 | 用户让 agent 运行 opennori status、opennori check、opennori doctor 或 opennori report，并查看 Architecture / build-vs-buy 区域。 | 输出显示 build-vs-buy 是 clear、needs-action 或 broken；如果某个基础设施决策缺少当前项目、标准库、官方 SDK、成熟开源库或自研理由，用户能看到具体 decision、问题和恢复动作。 | passing |
| AC-2 | acceptance | 作为用户，我查看 OpenNori 自身的架构决策时，能复查每个通用产品基础能力是否优先评估了可复用方案，而不是把用户入口、项目状态、可编辑文档和安装升级卸载体验默认手写。 | 用户打开 .opennori/architecture/decisions 下的 build-vs-buy 决策，或查看 opennori architecture show / report 输出。 | 与通用产品基础能力相关的决策记录包含 current project、standard library、official SDK、open source candidates、recommendation；recommendation 为 self-build 时还必须说明许可证、维护性、安全、包体积、性能或产品边界理由。 | passing |
| AC-3 | acceptance | 作为用户，我查看 OpenNori 自身当前报告时，能判断它哪些地方已经复用了标准库或成熟库、哪些地方仍保留最小自研，以及这些自研是否属于 OpenNori 产品语义而不是通用基础设施。 | 用户查看 opennori report、architecture show、package.json 和相关 build-vs-buy evidence。 | 报告和证据能区分复用、最小自研和待处理风险；如果 schema、Markdown 或 CLI 仍手写过重但没有充分决策证据，目标不能被判断为 complete。 | passing |

## Rule

Progress is determined by acceptance evidence, not by implementation steps.
