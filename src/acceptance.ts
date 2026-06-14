import { slugify } from "./core/shared.ts";
import type {
  AcceptanceCriterion,
  AcceptanceDiscovery,
  AcceptanceDiscoveryGap,
  AcceptanceQualityAudit,
  AcceptanceQualityFinding,
  Brainstorm,
  BrainstormCandidate,
  NoriBrief,
  NoriContract
} from "./types.ts";

const BRAINSTORM_CANDIDATES: BrainstormCandidate[] = [
  {
    id: "A",
    title: "目标澄清型",
    user_value: "用户能把模糊想法收敛成一个明确目标和少量可观察验收方向。",
    suggested_goal_template: "让用户从模糊想法中选择一个明确、可验收的目标。",
    acceptance_directions: [
      "作为用户，我能在候选方向中看出每个方向解决的用户价值。",
      "作为用户，我能选择一个方向进入 OpenNori draft，或要求改写方向。",
      "作为用户，我能判断候选方向没有要求我阅读技术说明。"
    ],
    risks: ["目标仍然太泛，无法生成可验收 AC。"]
  },
  {
    id: "B",
    title: "方案取舍型",
    user_value: "用户能比较几种产品形态，并选择哪一种进入正式验收。",
    suggested_goal_template: "让用户比较多个可验收产品形态，并选择一个进入执行。",
    acceptance_directions: [
      "作为用户，我能看到每个方向对应的使用入口和判断方式。",
      "作为用户，我能比较方向之间的取舍，而不是阅读实现计划。",
      "作为用户，我能选择一个方向作为正式 OpenNori draft 的来源。"
    ],
    risks: ["候选项可能变成技术方案比较，需要退回用户价值和验收方式。"]
  },
  {
    id: "C",
    title: "风险识别型",
    user_value: "用户能先看见哪些验收点需要强证据、人工确认或外部条件。",
    suggested_goal_template: "让用户识别完成判断中的高风险验收点。",
    acceptance_directions: [
      "作为用户，我能看到哪些方向需要更强证据才能说完成。",
      "作为用户，我能知道哪些风险需要人工确认或外部条件。",
      "作为用户，我能决定先验证风险还是直接进入 draft。"
    ],
    risks: ["风险讨论可能扩散成过程计划，需要保持在完成判断和证据强度上。"]
  }
];

export const DEFAULT_CRITERIA: AcceptanceCriterion[] = [
  {
    id: "AC-1",
    user_story: "作为用户，我使用目标系统完成核心操作后，能判断目标结果是否已经达成。",
    measurement: "用户执行核心操作并查看结果。",
    threshold: "结果能被用户直接判断为达成或未达成；不需要阅读实现说明。",
    risk: "medium"
  },
  {
    id: "AC-2",
    user_story: "作为用户，我查看结果状态后，能知道还缺什么或我需要做什么。",
    measurement: "用户查看状态、报告或界面反馈。",
    threshold: "反馈说明当前缺口或人类动作，不把过程步骤当作完成依据。",
    risk: "medium"
  },
  {
    id: "AC-3",
    user_story: "作为用户，我重新打开项目或会话后，能继续从同一个验收状态推进。",
    measurement: "用户恢复任务并查看当前验收状态。",
    threshold: "恢复信息包含目标、当前状态、当前缺口和可继续的入口。",
    risk: "high"
  }
];

const DISCOVERY_GAPS: AcceptanceDiscoveryGap[] = [
  {
    id: "missing-field-scope",
    patterns: ["设置", "资料", "个人资料", "profile", "settings", "字段", "field"],
    question: "本轮用户可以修改或查看哪些具体字段？哪些字段明确不在范围内？",
    why: "没有字段范围，用户无法判断修改能力是否完整。"
  },
  {
    id: "missing-validation-rule",
    patterns: ["修改", "输入", "保存", "上传", "表单", "edit", "input", "save", "upload", "form"],
    question: "每个可输入内容的有效规则是什么，例如长度、必填、格式、文件类型或大小？",
    why: "没有校验规则，失败和边界输入无法验收。"
  },
  {
    id: "missing-success-signal",
    patterns: ["保存", "提交", "创建", "更新", "完成", "save", "submit", "create", "update"],
    question: "操作成功后，用户会看到什么明确反馈或结果变化？",
    why: "没有成功反馈，用户无法判断操作是否真的完成。"
  },
  {
    id: "missing-persistence-scope",
    patterns: ["保存", "刷新", "重新打开", "重新登录", "持久", "save", "refresh", "reload", "reopen", "login", "persist"],
    question: "结果需要在刷新、重新打开、重新登录或跨设备后仍然存在吗？",
    why: "没有持久化范围，完成判断会在当前页面和真实保存之间摇摆。"
  },
  {
    id: "missing-failure-case",
    patterns: ["失败", "错误", "提示", "网络", "权限", "error", "fail", "failure", "invalid", "permission", "network"],
    question: "哪些失败情况必须覆盖，用户分别应该看到什么提示或保留什么原状态？",
    why: "没有失败场景，错误体验可能被一句“有提示”掩盖。"
  },
  {
    id: "missing-out-of-scope-boundary",
    patterns: ["页面", "页", "设置", "功能", "支持", "完成", "page", "feature", "support", "complete"],
    question: "哪些相关能力明确不属于本轮完成范围？",
    why: "没有范围边界，agent 可能扩大实现，也可能漏掉用户真正期待的部分。"
  },
  {
    id: "missing-user-entry",
    patterns: ["使用", "打开", "查看", "进入", "run", "open", "view", "use", "entry"],
    question: "用户从哪个入口开始操作，最终在哪里查看结果？",
    why: "没有用户入口，AC 容易变成内部状态而不是可执行验收。"
  },
  {
    id: "missing-review-method",
    patterns: ["判断", "验收", "完成", "review", "accept", "done", "complete"],
    question: "用户或评审者应该用什么可复查方式判断这条 AC 通过？",
    why: "没有复查方式，完成判断会退化成 agent 自我总结。"
  }
];

const USER_OPERATION_TERMS = [
  "运行",
  "打开",
  "查看",
  "选择",
  "阅读",
  "询问",
  "确认",
  "比较",
  "检查",
  "审查",
  "预览",
  "安装",
  "卸载",
  "归档",
  "添加",
  "修改",
  "提出",
  "触发",
  "执行",
  "创建",
  "run",
  "open",
  "view",
  "select",
  "read",
  "ask",
  "confirm",
  "compare",
  "review",
  "preview",
  "install",
  "uninstall",
  "archive",
  "add",
  "update",
  "check"
];

const USER_OUTCOME_TERMS = [
  "能",
  "看到",
  "显示",
  "输出",
  "返回",
  "包含",
  "结果",
  "状态",
  "缺口",
  "反馈",
  "报告",
  "摘要",
  "入口",
  "建议",
  "知道",
  "判断",
  "确认",
  "区分",
  "理解",
  "提示",
  "展示",
  "保留",
  "标明",
  "说明",
  "指出",
  "回答",
  "可复查",
  "可执行",
  "不需要",
  "不会",
  "不能",
  "不创建",
  "can",
  "see",
  "show",
  "output",
  "include",
  "result",
  "status",
  "gap",
  "report",
  "summary",
  "entry",
  "action",
  "return",
  "understand",
  "decide",
  "confirm",
  "distinguish",
  "explain",
  "answer",
  "review"
];

const IMPLEMENTATION_DETAIL_TERMS = [
  "acceptance.json",
  "evidence.json",
  "plan.md",
  "json",
  "schema",
  "script",
  "file exists",
  "脚本",
  "命令",
  "计划",
  "实现步骤"
];

const IMPLEMENTATION_ONLY_PHRASES = [
  "文件存在",
  "字段存在",
  "命令执行成功",
  "测试通过",
  "用例通过",
  "模块实现",
  "接口实现",
  "函数实现",
  "组件实现",
  "schema 校验通过",
  "json 字段",
  "manifest 字段",
  "file exists",
  "field exists",
  "tests pass",
  "test passes",
  "module implemented",
  "function implemented",
  "schema passes"
];

const NEGATION_TERMS = ["不能", "不应", "不是", "不得", "避免", "cannot", "must not", "should not", "reject"];

function sentenceHasSpecifics(text: unknown, terms: string[]): boolean {
  const value = String(text || "").toLowerCase();
  return terms.some((term) => value.includes(term.toLowerCase()));
}

function includesAny(text: unknown, terms: string[]): boolean {
  const value = String(text || "").toLowerCase();
  return terms.some((term) => value.includes(term.toLowerCase()));
}

function looksImplementationOnly(text: unknown): boolean {
  const value = String(text || "");
  if (includesAny(value, NEGATION_TERMS)) return false;
  if (includesAny(value, USER_OPERATION_TERMS) && includesAny(value, USER_OUTCOME_TERMS)) return false;
  return includesAny(value, IMPLEMENTATION_ONLY_PHRASES);
}

export function discoverAcceptanceGaps(text: string, { fallback = false, allowedIds = null as Set<string> | null } = {}): AcceptanceDiscoveryGap[] {
  const lowered = text.toLowerCase();
  const gaps = DISCOVERY_GAPS
    .filter((gap) => !allowedIds || allowedIds.has(gap.id))
    .filter((gap) => (gap.patterns || []).some((pattern) => lowered.includes(pattern.toLowerCase())))
    .filter((gap) => {
      if (gap.id === "missing-field-scope") return !sentenceHasSpecifics(text, ["昵称", "头像", "简介", "邮箱", "手机号", "字段范围", "field scope", "name", "avatar", "bio", "email", "phone"]);
      if (gap.id === "missing-validation-rule") return !sentenceHasSpecifics(text, ["长度", "必填", "格式", "大小", "类型", "字符", "校验规则", "validation", "required", "format", "length", "size", "type"]);
      if (gap.id === "missing-success-signal") return !sentenceHasSpecifics(text, ["成功", "保存成功", "成功反馈", "result", "success"]);
      if (gap.id === "missing-persistence-scope") return !sentenceHasSpecifics(text, ["刷新", "重新打开", "重新登录", "跨设备", "refresh", "reload", "reopen", "login"]);
      if (gap.id === "missing-failure-case") return !sentenceHasSpecifics(text, ["网络", "权限", "无效", "错误码", "保留原", "失败场景", "network", "permission", "invalid"]);
      if (gap.id === "missing-out-of-scope-boundary") return !sentenceHasSpecifics(text, ["不在范围", "不包含", "本轮不", "范围边界", "out of scope", "exclude"]);
      if (gap.id === "missing-user-entry") return !sentenceHasSpecifics(text, ["设置页", "登录页", "report", "dashboard", "页面", "page"]);
      if (gap.id === "missing-review-method") return !sentenceHasSpecifics(text, ["截图", "浏览器", "报告", "测试", "review", "screenshot", "browser", "report"]);
      return true;
    });

  if (gaps.length > 0 || !fallback) return gaps;
  return [
    {
      id: "missing-review-method",
      question: "用户或评审者应该用什么可复查方式判断这个目标完成？",
      why: "OpenNori 需要先知道完成判断方式，才能形成真正可验收的 AC。"
    }
  ];
}

function discoveryGap(gapId: string): AcceptanceDiscoveryGap | undefined {
  return DISCOVERY_GAPS.find((gap) => gap.id === gapId);
}

export function discoverAcceptance(goal: string, explicitId: string | undefined = undefined): AcceptanceDiscovery {
  const text = String(goal || "").trim();
  const selectedGaps = discoverAcceptanceGaps(text, { fallback: true });

  return {
    protocol_version: "opennori/discovery-v1",
    id: explicitId || slugify(text.slice(0, 40) || "acceptance-discovery"),
    goal: text,
    status: selectedGaps.length > 0 ? "needs-user-answers" : "ready-for-draft",
    is_acceptance_contract: false,
    gaps: selectedGaps.map((gap, index) => ({
      id: gap.id,
      question: gap.question,
      why: gap.why,
      priority: index < 3 ? "must-answer" : "can-default"
    })),
    next: "Ask the must-answer questions before drafting a Nori Contract. Use assumptions only when the user accepts them."
  };
}

export function reviewAcceptanceQuality(contract: NoriContract): AcceptanceQualityAudit {
  const findings: AcceptanceQualityFinding[] = [];
  for (const [index, criterion] of (contract.criteria || []).entries()) {
    const triggerText = [
      criterion.user_story,
      criterion.threshold
    ].filter(Boolean).join("\n");
    const fullText = [
      criterion.user_story,
      criterion.measurement,
      criterion.threshold
    ].filter(Boolean).join("\n");
    const addFinding = (gapId: string, overrides: Partial<AcceptanceQualityFinding> = {}) => {
      const gap = discoveryGap(gapId);
      if (!gap) return;
      findings.push({
        criterion_id: criterion.id,
        path: `criteria[${index}]`,
        gap_id: gap.id,
        question: gap.question,
        why: gap.why,
        message: overrides.message || gap.why,
        agent_guidance: overrides.agent_guidance || "Ask the user or record an explicit assumption before treating this criterion as confidently complete.",
        source: "heuristic",
        severity: "needs-user-review",
        ...overrides
      });
    };

    const addCustomFinding = (gapId: string, field: string, question: string, why: string, message: string) => {
      findings.push({
        criterion_id: criterion.id,
        path: `criteria[${index}].${field}`,
        gap_id: gapId,
        question,
        why,
        message,
        agent_guidance: "Use this as a review signal, not a hard rejection. Clarify with the user or rewrite the criterion only after user confirmation.",
        source: "heuristic",
        severity: "needs-user-review"
      });
    };

    const userStory = String(criterion.user_story || "");
    if (userStory && !userStory.startsWith("作为用户") && !userStory.toLowerCase().startsWith("as a user")) {
      addCustomFinding(
        "user-perspective-format",
        "user_story",
        "这条 AC 是否确实从最终用户或评审者的操作/判断出发？",
        "AC 不必机械套用固定句式，但 agent 需要确认它表达的是人类用户可执行的操作或判断。",
        "Acceptance criterion does not use the usual user-perspective wording."
      );
    }

    const implementationTerms = IMPLEMENTATION_DETAIL_TERMS.filter((term) => userStory.toLowerCase().includes(term.toLowerCase()));
    if (implementationTerms.length > 0) {
      addCustomFinding(
        "possible-implementation-detail",
        "user_story",
        "这些技术词是否是用户实际会看到/操作的内容，还是应该移到证据、Profile 或 Architecture Baseline？",
        "技术词可能是产品表面，也可能是实现细节；需要 agent 结合上下文判断，不能由代码直接拒绝。",
        `Acceptance criterion contains possible implementation detail terms: ${implementationTerms.join(", ")}.`
      );
    }

    const measurement = String(criterion.measurement || "");
    if (measurement && !includesAny(measurement, USER_OPERATION_TERMS)) {
      addCustomFinding(
        "measurement-review-method-unclear",
        "measurement",
        "用户或评审者具体通过什么入口、操作或审查动作判断这条 AC？",
        "measurement 缺少明显的用户操作或复查动作，agent 需要确认验收入口，而不是把它当结构错误。",
        "Measurement may not describe a user operation or review action."
      );
    }

    const threshold = String(criterion.threshold || "");
    if (threshold && !includesAny(threshold, USER_OUTCOME_TERMS)) {
      addCustomFinding(
        "threshold-user-outcome-unclear",
        "threshold",
        "通过时用户会看到什么结果、反馈或可作出什么判断？",
        "threshold 缺少明显的用户可观察结果，agent 需要澄清完成判断。",
        "Passing threshold may not describe a user-observable outcome or judgment."
      );
    }

    for (const [field, value] of Object.entries({ measurement, threshold })) {
      if (looksImplementationOnly(value)) {
        addCustomFinding(
          "implementation-only-completion-signal",
          field,
          "这个完成信号如何映射到用户可见结果？如果只是测试、文件或模块状态，应作为 evidence 或 architecture/profile 证据，而不是用户 AC。",
          "实现层信号可以成为证据，但通常不能单独代表用户验收完成。",
          `${field} looks like an implementation-only completion signal.`
        );
      }
    }

    const vagueEditableProfile = sentenceHasSpecifics(triggerText, [
      "修改个人资料",
      "修改资料",
      "修改字段",
      "编辑个人资料",
      "编辑资料",
      "edit profile",
      "update profile",
      "modify fields",
      "edit fields"
    ]);
    if (vagueEditableProfile && !sentenceHasSpecifics(fullText, ["昵称", "头像", "简介", "邮箱", "手机号", "字段范围", "field scope", "name", "avatar", "bio", "email", "phone"])) {
      addFinding("missing-field-scope");
    }
    if (vagueEditableProfile && !sentenceHasSpecifics(fullText, ["长度", "必填", "格式", "大小", "类型", "字符", "校验规则", "validation", "required", "format", "length", "size", "type"])) {
      addFinding("missing-validation-rule");
    }

    const mentionsSave = sentenceHasSpecifics(triggerText, ["保存", "提交", "save", "submit"]);
    if (mentionsSave && !sentenceHasSpecifics(fullText, ["保存成功", "成功反馈", "成功提示", "显示成功", "报告显示", "result", "success"])) {
      addFinding("missing-success-signal");
    }
    if (mentionsSave && !sentenceHasSpecifics(fullText, ["刷新", "重新打开", "重新登录", "跨设备", "refresh", "reload", "reopen", "login"])) {
      addFinding("missing-persistence-scope");
    }

    const vagueFailure = sentenceHasSpecifics(triggerText, [
      "失败时有提示",
      "失败提示",
      "有提示",
      "错误提示",
      "show an error",
      "error message"
    ]);
    if (vagueFailure && !sentenceHasSpecifics(fullText, ["网络", "权限", "无效", "错误码", "保留原", "失败场景", "network", "permission", "invalid"])) {
      addFinding("missing-failure-case");
    }

    const broadSettingsScope = sentenceHasSpecifics(triggerText, ["设置页", "个人资料", "settings page"]);
    if (broadSettingsScope && !sentenceHasSpecifics(fullText, ["不在范围", "不包含", "本轮不", "范围边界", "out of scope", "exclude"])) {
      addFinding("missing-out-of-scope-boundary");
    }
  }

  return {
    status: findings.length > 0 ? "needs-user-review" : "clear",
    summary: findings.length > 0
      ? `${findings.length} acceptance quality gap(s) may need user review.`
      : "No underspecified acceptance gaps found.",
    findings
  };
}

export const auditAcceptanceQuality = reviewAcceptanceQuality;

export function renderDiscoveryMarkdown(discovery: AcceptanceDiscovery): string {
  const lines = [
    `# ${discovery.id} Acceptance Discovery`,
    "",
    "## Goal",
    "",
    discovery.goal,
    "",
    "## Rule",
    "",
    "This is an acceptance discovery source, not a Nori Contract, process plan, or completion evidence.",
    "",
    "## Acceptance Gaps",
    ""
  ];

  for (const gap of discovery.gaps) {
    lines.push(
      `### ${gap.id}`,
      "",
      `Priority: ${gap.priority}`,
      "",
      `Question: ${gap.question}`,
      "",
      `Why it matters: ${gap.why}`,
      ""
    );
  }

  lines.push("## Next", "", discovery.next);
  return `${lines.join("\n")}\n`;
}

export function renderBrainstormMarkdown(brainstorm: Brainstorm): string {
  const lines = [
    `# ${brainstorm.id} Brainstorm`,
    "",
    "## Idea",
    "",
    brainstorm.idea,
    "",
    "## Rule",
    "",
    "This is a draft source, not a Nori Contract or completion evidence.",
    "",
    "## Candidates",
    ""
  ];

  for (const candidate of brainstorm.candidates) {
    lines.push(
      `### ${candidate.id}. ${candidate.title}`,
      "",
      `User value: ${candidate.user_value}`,
      "",
      "Acceptance directions:",
      ...candidate.acceptance_directions.map((direction: string) => `- ${direction}`),
      "",
      "Risks:",
      ...candidate.risks.map((risk: string) => `- ${risk}`),
      ""
    );
  }

  lines.push("## Next", "", "User chooses a candidate or revises one before OpenNori draft.");
  return `${lines.join("\n")}\n`;
}

export function briefFromGoal(goal: string, goalId: string | undefined = undefined): NoriBrief {
  return {
    goal_id: goalId || undefined,
    goal,
    acceptance_basis: { status: "draft", summary: "Draft generated for user approval or revision." },
    criteria: DEFAULT_CRITERIA
  };
}

export function buildBrainstorm(idea: string, explicitId: string | undefined = undefined): Brainstorm {
  const id = explicitId || slugify(idea.slice(0, 40));
  return {
    protocol_version: "opennori/brainstorm-v1",
    id,
    idea,
    status: "draft-source",
    candidates: BRAINSTORM_CANDIDATES,
    rule: "Brainstorm output is for choosing an acceptance direction. It is not a plan, a Nori Contract, or completion evidence."
  };
}

export function briefFromBrainstorm(brainstorm: Brainstorm, candidateId: string): NoriBrief {
  const candidate = brainstorm.candidates.find((item) => item.id === candidateId);
  if (!candidate) throw new Error(`Brainstorm candidate not found: ${candidateId}`);
  return {
    goal_id: slugify(`${brainstorm.id}-${candidate.id}`),
    goal: `${candidate.suggested_goal_template} 原始想法：${brainstorm.idea}`,
    acceptance_basis: {
      status: "draft",
      summary: `Draft generated from brainstorm ${brainstorm.id} candidate ${candidate.id}.`
    },
    criteria: candidate.acceptance_directions.map((direction: string, index: number) => ({
      id: `AC-${index + 1}`,
      user_story: direction,
      measurement: "用户查看 OpenNori draft、报告或目标结果后作出判断。",
      threshold: "用户能直接判断是否满足，不需要阅读实现步骤。",
      risk: index === 0 ? "medium" : "low"
    }))
  };
}
