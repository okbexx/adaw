import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  addEvidence,
  buildContractFromBrief,
  buildEvidenceLedger,
  completionAnswer,
  currentGap,
  fail,
  findActivePairs,
  intervention,
  ok,
  pathsForGoal,
  readJson,
  recomputeWorkflowStatus,
  renderAcceptanceMarkdown,
  renderReport,
  slugify,
  syncAcceptanceMarkdown,
  validateContract,
  writeJson
} from "./core.js";

const BRAINSTORM_CANDIDATES = [
  {
    id: "A",
    title: "目标澄清型",
    user_value: "用户能把模糊想法收敛成一个明确目标和少量可观察验收方向。",
    suggested_goal_template: "让用户从模糊想法中选择一个明确、可验收的目标。",
    acceptance_directions: [
      "作为用户，我能在候选方向中看出每个方向解决的用户价值。",
      "作为用户，我能选择一个方向进入 ADAW draft，或要求改写方向。",
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
      "作为用户，我能选择一个方向作为正式 ADAW draft 的来源。"
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

const DEFAULT_CRITERIA = [
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

function printJson(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function argValue(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  if (index === -1 || index + 1 >= args.length) return fallback;
  return args[index + 1];
}

function hasFlag(args, name) {
  return args.includes(name);
}

function resolveRoot(args) {
  return path.resolve(argValue(args, "--root", process.cwd()));
}

function relativeTo(root, filePath) {
  return path.relative(root, filePath) || ".";
}

function exportedSkillMarkdown() {
  return [
    "---",
    "name: adaw",
    "description: Drive agent work through user-centered acceptance criteria and evidence, not exposed process plans.",
    "---",
    "",
    "## When to use",
    "Use when a task needs the agent to keep working until human-centered acceptance criteria have passing or waived evidence.",
    "",
    "## Start",
    "If the user says they want to discuss, brainstorm, explore, or are not ready to define acceptance criteria, run `adaw brainstorm --idea \"<idea>\" --root <repo> --json` and show only the candidate acceptance directions. Ask the user to choose or revise a direction.",
    "",
    "When the user says `用 ADAW 跑这个任务：目标是 X`, run `adaw draft --goal \"X\" --root <repo> --json` and show the draft acceptance criteria for approval or revision before implementation.",
    "If `adaw` is not on PATH in this workspace, use `node /Users/jarl/code/jarlone/adaw/bin/adaw.js` with the same arguments.",
    "",
    "If the user chooses a brainstorm candidate, run `adaw draft --from-brainstorm <brainstorm-id> --candidate <A|B|C> --root <repo> --json`.",
    "",
    "After the user approves the criteria, run `adaw approve --root <repo> --summary \"user approved acceptance criteria\" --json`. If the user revises a criterion, run `adaw criterion update --root <repo> --criterion <id> --user-story ... --measurement ... --threshold ... --json`.",
    "",
    "## Resume",
    "At the start of each turn, run `adaw resume --root <repo> --json` or `adaw next --root <repo> --json` to recover the active goal and current acceptance gap.",
    "",
    "## Evidence loop",
    "Work only to produce evidence for the current acceptance gap. Add evidence with `adaw evidence add`, run `adaw evaluate`, answer status with `adaw status`, and generate the user report with `adaw report`.",
    "",
    "## Rule",
    "Progress is determined by acceptance evidence, not by implementation steps.",
    "Do not answer complete while the acceptance basis is draft.",
    "Do not treat brainstorm output as an acceptance contract or completion evidence.",
    ""
  ].join("\n");
}

function writeIfSafe(filePath, content, { dryRun = false, force = false } = {}) {
  const exists = fs.existsSync(filePath);
  const action = exists ? (force ? "overwrite" : "skip") : "create";
  if (!dryRun && (!exists || force)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  return { path: filePath, action };
}

function ensureDir(dirPath, { dryRun = false } = {}) {
  const exists = fs.existsSync(dirPath);
  if (!dryRun && !exists) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return { path: dirPath, action: exists ? "exists" : "create" };
}

function protocolTemplate() {
  const source = path.resolve(import.meta.dirname, "..", "process", "development-protocols", "adaw.md");
  if (fs.existsSync(source)) return fs.readFileSync(source, "utf8");
  return [
    "# ADAW Protocol",
    "",
    "Progress is determined by human-centered acceptance evidence, not by implementation steps.",
    "",
    "Use `adaw init`, `adaw resume`, `adaw next`, `adaw evidence add`, `adaw evaluate`, `adaw status`, and `adaw report`.",
    ""
  ].join("\n");
}

function brainstormPaths(root, brainstormId) {
  const dir = path.join(root, "process", "brainstorms");
  return {
    jsonPath: path.join(dir, `${brainstormId}.json`),
    markdownPath: path.join(dir, `${brainstormId}.md`)
  };
}

function renderBrainstormMarkdown(brainstorm) {
  const lines = [
    `# ${brainstorm.id} Brainstorm`,
    "",
    "## Idea",
    "",
    brainstorm.idea,
    "",
    "## Rule",
    "",
    "This is a draft source, not an acceptance contract or completion evidence.",
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
      ...candidate.acceptance_directions.map((direction) => `- ${direction}`),
      "",
      "Risks:",
      ...candidate.risks.map((risk) => `- ${risk}`),
      ""
    );
  }

  lines.push("## Next", "", "User chooses a candidate or revises one before ADAW draft.");
  return `${lines.join("\n")}\n`;
}

function classifyChangedFile(filePath) {
  if (
    filePath.startsWith("process/acceptance/") ||
    filePath.startsWith("process/development-protocols/") ||
    filePath.startsWith("examples/")
  ) {
    return "acceptance";
  }
  return "implementation";
}

function gitChanges(root) {
  const result = spawnSync("git", ["status", "--short", "--untracked-files=all"], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    return { available: false, acceptance: [], implementation: [], raw_error: result.stderr.trim() };
  }

  const grouped = { available: true, acceptance: [], implementation: [] };
  for (const line of result.stdout.split("\n")) {
    if (!line.trim()) continue;
    const status = line.slice(0, 2).trim() || "modified";
    const rawPath = line.slice(3).trim();
    const filePath = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) : rawPath;
    grouped[classifyChangedFile(filePath)].push({ status, path: filePath });
  }
  return grouped;
}

function briefFromGoal(goal, goalId = undefined) {
  return {
    goal_id: goalId || undefined,
    goal,
    acceptance_basis: { status: "draft", summary: "Draft generated for user approval or revision." },
    criteria: DEFAULT_CRITERIA
  };
}

function buildBrainstorm(idea, explicitId = undefined) {
  const id = explicitId || slugify(idea.slice(0, 40));
  return {
    protocol_version: "adaw/brainstorm-v1",
    id,
    idea,
    status: "draft-source",
    candidates: BRAINSTORM_CANDIDATES,
    rule: "Brainstorm output is for choosing an acceptance direction. It is not a plan, an acceptance contract, or completion evidence."
  };
}

function briefFromBrainstorm(brainstorm, candidateId) {
  const candidate = brainstorm.candidates.find((item) => item.id === candidateId);
  if (!candidate) throw new Error(`Brainstorm candidate not found: ${candidateId}`);
  return {
    goal_id: slugify(`${brainstorm.id}-${candidate.id}`),
    goal: `${candidate.suggested_goal_template} 原始想法：${brainstorm.idea}`,
    acceptance_basis: {
      status: "draft",
      summary: `Draft generated from brainstorm ${brainstorm.id} candidate ${candidate.id}.`
    },
    criteria: candidate.acceptance_directions.map((direction, index) => ({
      id: `AC-${index + 1}`,
      user_story: direction,
      measurement: "用户查看 ADAW draft、报告或目标结果后作出判断。",
      threshold: "用户能直接判断是否满足，不需要阅读实现步骤。",
      risk: index === 0 ? "medium" : "low"
    }))
  };
}

function savePair(acceptancePath, evidencePath, contract, ledger) {
  writeJson(evidencePath, { contract, ledger });
  syncAcceptanceMarkdown(acceptancePath, contract, ledger);
}

function loadPair(args) {
  const explicitAcceptance = argValue(args, "--acceptance");
  const explicitEvidence = argValue(args, "--evidence");
  if (explicitAcceptance || explicitEvidence) {
    if (!explicitAcceptance || !explicitEvidence) {
      throw new Error("Both --acceptance and --evidence are required");
    }
    const acceptancePath = path.resolve(explicitAcceptance);
    const evidencePath = path.resolve(explicitEvidence);
    const payload = readJson(evidencePath);
    return {
      contract: payload.contract,
      ledger: payload.ledger,
      acceptancePath,
      evidencePath
    };
  }

  const root = resolveRoot(args);
  const goal = argValue(args, "--goal");
  const pairs = findActivePairs(root);
  const pair = goal ? pairs.find((item) => item.goalId === goal) : pairs[0];
  if (!pair) {
    throw new Error(`No active ADAW goal found under ${root}`);
  }
  if (!goal && pairs.length > 1) {
    throw new Error("Multiple active ADAW goals found. Pass --goal <goal-id> or explicit --acceptance/--evidence paths.");
  }
  const payload = readJson(pair.evidencePath);
  return {
    contract: payload.contract,
    ledger: payload.ledger,
    acceptancePath: pair.acceptancePath,
    evidencePath: pair.evidencePath
  };
}

export async function main(args) {
  const command = args[0];
  if (!command || command === "--help" || command === "-h") {
    printJson(ok({ usage: "adaw <doctor|install|brainstorm|draft|init|list|check|approve|criterion|resume|next|evidence|evaluate|status|report|changes|archive|skill>" }));
    return;
  }

  if (command === "doctor") {
    printJson(ok({
      name: "adaw",
      checks: [
        { name: "node_runtime", ok: true, version: process.version },
        { name: "json_contract", ok: true },
        { name: "acceptance_surface", ok: true }
      ],
      side_effect: "none"
    }));
    return;
  }

  if (command === "list") {
    const root = resolveRoot(args);
    const pairs = findActivePairs(root).map((pair) => {
      const payload = readJson(pair.evidencePath);
      return {
        goal_id: pair.goalId,
        status: payload.ledger?.status || "unknown",
        current_gap: currentGap(payload.contract, payload.ledger),
        acceptance_path: pair.acceptancePath,
        evidence_path: pair.evidencePath
      };
    });
    printJson(ok({ root, active_goals: pairs }));
    return;
  }

  if (command === "install") {
    const root = resolveRoot(args);
    const dryRun = hasFlag(args, "--dry-run");
    const force = hasFlag(args, "--force");
    const actions = [
      ensureDir(path.join(root, "process", "acceptance", "active"), { dryRun }),
      ensureDir(path.join(root, "process", "acceptance", "completed"), { dryRun }),
      ensureDir(path.join(root, "process", "acceptance", "blocked"), { dryRun }),
      ensureDir(path.join(root, "process", "acceptance", "reports"), { dryRun }),
      ensureDir(path.join(root, "process", "development-protocols"), { dryRun }),
      writeIfSafe(path.join(root, "process", "development-protocols", "adaw.md"), protocolTemplate(), { dryRun, force })
    ];

    if (hasFlag(args, "--skill")) {
      actions.push(writeIfSafe(path.join(root, ".agents", "skills", "adaw", "SKILL.md"), exportedSkillMarkdown(), { dryRun, force }));
    }

    printJson(ok({
      root,
      dry_run: dryRun,
      force,
      actions: actions.map((action) => ({ ...action, path: relativeTo(root, action.path) }))
    }));
    return;
  }

  if (command === "brainstorm") {
    const root = resolveRoot(args);
    const idea = String(argValue(args, "--idea", "")).trim();
    if (!idea) throw new Error("--idea is required");
    const brainstorm = buildBrainstorm(idea, argValue(args, "--id"));
    const paths = brainstormPaths(root, brainstorm.id);
    writeJson(paths.jsonPath, brainstorm);
    fs.mkdirSync(path.dirname(paths.markdownPath), { recursive: true });
    fs.writeFileSync(paths.markdownPath, renderBrainstormMarkdown(brainstorm));
    printJson(ok(
      {
        brainstorm_id: brainstorm.id,
        status: brainstorm.status,
        idea: brainstorm.idea,
        candidates: brainstorm.candidates,
        brainstorm_path: paths.jsonPath,
        markdown_path: paths.markdownPath,
        is_acceptance_contract: false
      },
      [
        { kind: "brainstorm_source", path: paths.jsonPath },
        { kind: "brainstorm_markdown", path: paths.markdownPath }
      ],
      [],
      ["Ask the user to choose or revise a candidate before running adaw draft."]
    ));
    return;
  }

  if (command === "draft") {
    const root = resolveRoot(args);
    const brainstormId = argValue(args, "--from-brainstorm");
    let brief;
    if (brainstormId) {
      const candidateId = argValue(args, "--candidate");
      if (!candidateId) throw new Error("--candidate is required with --from-brainstorm");
      brief = briefFromBrainstorm(readJson(brainstormPaths(root, brainstormId).jsonPath), candidateId);
    } else {
      const goal = String(argValue(args, "--goal", "")).trim();
      if (!goal) throw new Error("--goal is required");
      brief = briefFromGoal(goal, argValue(args, "--goal-id"));
    }
    const contract = buildContractFromBrief(brief);
    const ledger = buildEvidenceLedger(contract);
    const issues = validateContract(contract, ledger);
    if (issues.length > 0) {
      printJson({ ...fail("invalid_acceptance", "Draft does not produce a valid ADAW contract", "Rewrite ACs from the user's perspective"), issues });
      process.exitCode = 1;
      return;
    }
    const paths = pathsForGoal(root, contract.goal_id);
    fs.mkdirSync(path.dirname(paths.acceptancePath), { recursive: true });
    fs.writeFileSync(paths.acceptancePath, renderAcceptanceMarkdown(contract, ledger));
    writeJson(paths.evidencePath, { contract, ledger });
    printJson(ok(
      {
        goal_id: contract.goal_id,
        acceptance_basis: contract.acceptance_basis,
        acceptance_path: paths.acceptancePath,
        evidence_path: paths.evidencePath,
        criteria: contract.criteria,
        current_gap: currentGap(contract, ledger)
      },
      [
        { kind: "draft_acceptance_contract", path: paths.acceptancePath },
        { kind: "evidence_ledger", path: paths.evidencePath }
      ],
      [],
      ["Ask the user to approve or revise these acceptance criteria before implementation."]
    ));
    return;
  }

  if (command === "init") {
    const briefPath = path.resolve(args[1] || "");
    const root = resolveRoot(args);
    const brief = readJson(briefPath);
    const contract = buildContractFromBrief(brief);
    const ledger = buildEvidenceLedger(contract);
    const issues = validateContract(contract, ledger);
    if (issues.length > 0) {
      printJson({ ...fail("invalid_acceptance", "Brief does not produce a valid ADAW contract", "Rewrite ACs from the user's perspective"), issues });
      process.exitCode = 1;
      return;
    }

    const paths = pathsForGoal(root, contract.goal_id);
    const evidencePayload = { contract, ledger };
    fs.mkdirSync(path.dirname(paths.acceptancePath), { recursive: true });
    fs.writeFileSync(paths.acceptancePath, renderAcceptanceMarkdown(contract, ledger));
    writeJson(paths.evidencePath, evidencePayload);

    printJson(ok(
      {
        goal_id: contract.goal_id,
        acceptance_path: paths.acceptancePath,
        evidence_path: paths.evidencePath,
        current_gap: currentGap(contract, ledger)
      },
      [
        { kind: "acceptance_contract", path: paths.acceptancePath },
        { kind: "evidence_ledger", path: paths.evidencePath }
      ],
      [],
      ["Run adaw next --acceptance <path> --evidence <path> --json before choosing implementation work."]
    ));
    return;
  }

  if (command === "check") {
    const { contract, ledger } = loadPair(args);
    const issues = validateContract(contract, ledger);
    if (issues.length > 0) {
      printJson({ ...fail("invalid_acceptance", "Acceptance contract failed validation", "Fix reported issues before continuing"), issues });
      process.exitCode = 1;
      return;
    }
    printJson(ok({
      goal_id: contract.goal_id,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger),
      statuses: Object.fromEntries(Object.entries(ledger.criteria).map(([id, state]) => [id, state.status]))
    }));
    return;
  }

  if (command === "approve") {
    const { contract, ledger, acceptancePath, evidencePath } = loadPair(args);
    contract.acceptance_basis = {
      status: "approved",
      summary: argValue(args, "--summary", "User approved acceptance criteria."),
      approved_at: new Date().toISOString()
    };
    recomputeWorkflowStatus(contract, ledger);
    savePair(acceptancePath, evidencePath, contract, ledger);
    printJson(ok({
      goal_id: contract.goal_id,
      acceptance_basis: contract.acceptance_basis,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger)
    }));
    return;
  }

  if (command === "criterion" && args[1] === "update") {
    const { contract, ledger, acceptancePath, evidencePath } = loadPair(args);
    const criterionId = argValue(args, "--criterion");
    if (!criterionId) throw new Error("--criterion is required");
    const criterion = contract.criteria.find((item) => item.id === criterionId);
    if (!criterion) throw new Error(`Criterion not found: ${criterionId}`);

    const before = {
      user_story: criterion.user_story,
      measurement: criterion.measurement,
      threshold: criterion.threshold,
      risk: criterion.risk
    };
    criterion.user_story = argValue(args, "--user-story", criterion.user_story);
    criterion.measurement = argValue(args, "--measurement", criterion.measurement);
    criterion.threshold = argValue(args, "--threshold", criterion.threshold);
    criterion.risk = argValue(args, "--risk", criterion.risk);
    const changed = (
      before.user_story !== criterion.user_story ||
      before.measurement !== criterion.measurement ||
      before.threshold !== criterion.threshold ||
      before.risk !== criterion.risk
    );
    if (changed && ledger.criteria[criterionId]) {
      ledger.criteria[criterionId] = {
        status: "unknown",
        confidence: "none",
        required: criterion.required !== false,
        risk: criterion.risk || "medium",
        evidence: []
      };
    }
    contract.acceptance_basis = {
      status: "approved",
      summary: argValue(args, "--summary", `User revised ${criterionId}.`),
      approved_at: new Date().toISOString()
    };
    const issues = validateContract(contract, ledger);
    if (issues.length > 0) {
      printJson({ ...fail("invalid_acceptance", "Updated criterion failed validation", "Rewrite the criterion from the user's perspective"), issues });
      process.exitCode = 1;
      return;
    }

    recomputeWorkflowStatus(contract, ledger);
    savePair(acceptancePath, evidencePath, contract, ledger);
    printJson(ok({
      goal_id: contract.goal_id,
      criterion,
      acceptance_basis: contract.acceptance_basis,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger)
    }));
    return;
  }

  if (command === "resume") {
    const { contract, ledger, acceptancePath, evidencePath } = loadPair(args);
    printJson(ok({
      goal_id: contract.goal_id,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger),
      completion: completionAnswer(contract, ledger),
      intervention: intervention(contract, ledger),
      acceptance_path: acceptancePath,
      evidence_path: evidencePath
    }));
    return;
  }

  if (command === "next") {
    const { contract, ledger } = loadPair(args);
    printJson(ok({
      goal_id: contract.goal_id,
      current_gap: currentGap(contract, ledger),
      complete: currentGap(contract, ledger) === null
    }));
    return;
  }

  if (command === "evidence" && args[1] === "add") {
    const { contract, ledger, acceptancePath, evidencePath } = loadPair(args);
    const criterionId = argValue(args, "--criterion");
    if (!criterionId) throw new Error("--criterion is required");
    const evidence = {
      kind: argValue(args, "--kind", "manual"),
      summary: argValue(args, "--summary", ""),
      result: argValue(args, "--result", "passing"),
      confidence: argValue(args, "--confidence"),
      path: argValue(args, "--path")
    };
    if (!evidence.summary) throw new Error("--summary is required");
    addEvidence(contract, ledger, criterionId, evidence);
    writeJson(evidencePath, { contract, ledger });
    syncAcceptanceMarkdown(acceptancePath, contract, ledger);
    printJson(ok({
      goal_id: contract.goal_id,
      criterion: criterionId,
      criterion_status: ledger.criteria[criterionId].status,
      confidence: ledger.criteria[criterionId].confidence,
      gate: ledger.criteria[criterionId].evidence.at(-1)?.gate,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger)
    }));
    return;
  }

  if (command === "evaluate") {
    const { contract, ledger, acceptancePath, evidencePath } = loadPair(args);
    recomputeWorkflowStatus(contract, ledger);
    writeJson(evidencePath, { contract, ledger });
    syncAcceptanceMarkdown(acceptancePath, contract, ledger);
    printJson(ok({
      goal_id: contract.goal_id,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger)
    }));
    return;
  }

  if (command === "status") {
    const { contract, ledger } = loadPair(args);
    printJson(ok({
      goal_id: contract.goal_id,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger),
      completion: completionAnswer(contract, ledger),
      intervention: intervention(contract, ledger)
    }));
    return;
  }

  if (command === "report") {
    const { contract, ledger } = loadPair(args);
    const output = path.resolve(argValue(args, "--output") || pathsForGoal(resolveRoot(args), contract.goal_id).reportPath);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, renderReport(contract, ledger));
    printJson(ok(
      { goal_id: contract.goal_id, report_path: output, workflow_status: ledger.status },
      [{ kind: "acceptance_report", path: output }]
    ));
    return;
  }

  if (command === "changes") {
    const root = resolveRoot(args);
    const pairs = findActivePairs(root).map((pair) => {
      const payload = readJson(pair.evidencePath);
      return {
        goal_id: pair.goalId,
        workflow_status: payload.ledger?.status || "unknown",
        current_gap: currentGap(payload.contract, payload.ledger)
      };
    });
    printJson(ok({
      root,
      active_goals: pairs,
      changed_files: gitChanges(root)
    }));
    return;
  }

  if (command === "archive") {
    const root = resolveRoot(args);
    const { contract, ledger, acceptancePath, evidencePath } = loadPair(args);
    recomputeWorkflowStatus(contract, ledger);
    if (ledger.status !== "complete" && ledger.status !== "blocked") {
      printJson(fail("not_archivable", `Goal ${contract.goal_id} is ${ledger.status}`, "Only complete or blocked ADAW goals can be archived."));
      process.exitCode = 1;
      return;
    }

    const archiveDir = ledger.status === "complete" ? "completed" : "blocked";
    const targetAcceptance = path.join(root, "process", "acceptance", archiveDir, path.basename(acceptancePath));
    const targetEvidence = path.join(root, "process", "acceptance", archiveDir, path.basename(evidencePath));
    const reportPath = pathsForGoal(root, contract.goal_id).reportPath;
    for (const target of [targetAcceptance, targetEvidence]) {
      if (fs.existsSync(target) && !hasFlag(args, "--force")) {
        printJson(fail("archive_target_exists", `Archive target exists: ${relativeTo(root, target)}`, "Pass --force or move the existing archive file."));
        process.exitCode = 1;
        return;
      }
    }

    writeJson(evidencePath, { contract, ledger });
    syncAcceptanceMarkdown(acceptancePath, contract, ledger);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, renderReport(contract, ledger));
    fs.mkdirSync(path.dirname(targetAcceptance), { recursive: true });
    fs.renameSync(acceptancePath, targetAcceptance);
    fs.renameSync(evidencePath, targetEvidence);
    printJson(ok(
      {
        goal_id: contract.goal_id,
        archived_as: archiveDir,
        acceptance_path: targetAcceptance,
        evidence_path: targetEvidence,
        report_path: reportPath
      },
      [
        { kind: "archived_acceptance_contract", path: targetAcceptance },
        { kind: "archived_evidence_ledger", path: targetEvidence },
        { kind: "acceptance_report", path: reportPath }
      ]
    ));
    return;
  }

  if (command === "skill" && args[1] === "export") {
    printJson(ok({ skill_md: exportedSkillMarkdown() }));
    return;
  }

  printJson(fail("unknown_command", `Unknown command: ${args.join(" ")}`));
  process.exitCode = 2;
}
