import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  addEvidence,
  addProfileEvidence,
  addProfileItem,
  buildContractFromBrief,
  buildEvidenceLedger,
  completionAnswer,
  criterionStatusRows,
  currentGap,
  fail,
  findActivePairs,
  intervention,
  ok,
  pathsForGoal,
  profileCompliance,
  PROTOCOL_VERSION,
  readJson,
  recomputeWorkflowStatus,
  renderAcceptanceMarkdown,
  renderReport,
  slugify,
  syncAcceptanceMarkdown,
  validateContract,
  writeJson
} from "./core.js";

const PACKAGE_JSON = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "..", "package.json"), "utf8"));
const MANIFEST_SCHEMA_VERSION = "adaw/manifest-v1";
const REQUIRED_ADAW_DIRS = ["active", "completed", "blocked", "reports", "brainstorms"];
const ADAW_CAPABILITIES = [
  "acceptance-contract",
  "evidence-ledger",
  "reviewable-evidence",
  "skill-pack",
  "brainstorm",
  "capability-profile",
  "archive",
  "report",
  "doctor"
];
const WRITING_INSTALL_ACTIONS = new Set(["create", "overwrite", "update"]);
const WRITING_UNINSTALL_ACTIONS = new Set(["delete", "delete-tree"]);

function sameStringSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size !== rightSet.size) return false;
  return [...leftSet].every((item) => rightSet.has(item));
}

function installActionReason(action, kind) {
  if (action === "create") return `Missing ADAW ${kind} will be created.`;
  if (action === "exists") return `Required ADAW ${kind} already exists.`;
  if (action === "skip") return `Existing ADAW ${kind} is not overwritten without --force.`;
  if (action === "overwrite") return `Existing ADAW ${kind} will be overwritten because --force was provided.`;
  if (action === "update") return `ADAW ${kind} will be refreshed from current project state.`;
  return `ADAW ${kind} action: ${action}.`;
}

function enrichInstallAction(root, action, { dryRun = false } = {}) {
  const wouldWrite = WRITING_INSTALL_ACTIONS.has(action.action);
  return {
    path: relativeTo(root, action.path),
    kind: action.kind || "file",
    action: action.action,
    managed: action.managed !== false,
    would_write: wouldWrite,
    will_write: wouldWrite && !dryRun,
    destructive: action.action === "overwrite",
    reason: action.reason || installActionReason(action.action, action.kind || "file")
  };
}

function summarizeInstallPlan(actions) {
  const byAction = {};
  for (const action of actions) {
    byAction[action.action] = (byAction[action.action] || 0) + 1;
  }
  return {
    total: actions.length,
    by_action: byAction,
    would_write: actions.filter((action) => action.would_write).length,
    will_write: actions.filter((action) => action.will_write).length,
    destructive: actions.filter((action) => action.destructive).length,
    managed: actions.filter((action) => action.managed).length
  };
}

function buildInstallPlan(root, actions, { dryRun = false, force = false, requestedSkill = false } = {}) {
  const enrichedActions = actions.map((action) => enrichInstallAction(root, action, { dryRun }));
  return {
    schema_version: "adaw/install-plan-v1",
    root,
    dry_run: dryRun,
    force,
    requested_skill: requestedSkill,
    summary: summarizeInstallPlan(enrichedActions),
    actions: enrichedActions
  };
}

function uninstallActionReason(action, kind) {
  if (action === "delete") return `Existing ADAW ${kind} will be removed.`;
  if (action === "delete-tree") return `Existing ADAW ${kind} and its contents will be removed.`;
  if (action === "absent") return `ADAW ${kind} is already absent.`;
  if (action === "preserve") return `ADAW ${kind} is preserved by default.`;
  return `ADAW ${kind} action: ${action}.`;
}

function plannedDelete(root, relativePath, kind, { recursive = false, reason = undefined } = {}) {
  const target = path.join(root, relativePath);
  const exists = fs.existsSync(target);
  return {
    path: target,
    kind,
    action: exists ? (recursive ? "delete-tree" : "delete") : "absent",
    managed: true,
    recursive,
    reason
  };
}

function plannedPreserve(root, relativePath, kind, reason) {
  return {
    path: path.join(root, relativePath),
    kind,
    action: "preserve",
    managed: true,
    recursive: false,
    reason
  };
}

function enrichUninstallAction(root, action, { dryRun = false } = {}) {
  const wouldWrite = WRITING_UNINSTALL_ACTIONS.has(action.action);
  return {
    path: relativeTo(root, action.path),
    kind: action.kind || "file",
    action: action.action,
    managed: action.managed !== false,
    would_write: wouldWrite,
    will_write: wouldWrite && !dryRun,
    destructive: wouldWrite,
    recursive: Boolean(action.recursive),
    reason: action.reason || uninstallActionReason(action.action, action.kind || "file")
  };
}

function summarizeUninstallPlan(actions) {
  const byAction = {};
  for (const action of actions) {
    byAction[action.action] = (byAction[action.action] || 0) + 1;
  }
  return {
    total: actions.length,
    by_action: byAction,
    would_write: actions.filter((action) => action.would_write).length,
    will_write: actions.filter((action) => action.will_write).length,
    destructive: actions.filter((action) => action.destructive).length,
    preserved: actions.filter((action) => action.action === "preserve").length,
    managed: actions.filter((action) => action.managed).length
  };
}

function buildUninstallActions(root, { includeState = false } = {}) {
  const actions = SKILL_PACK.map((skill) => plannedDelete(root, `.agents/skills/${skill.name}/SKILL.md`, "skill"));

  if (includeState) {
    actions.push(plannedDelete(root, ".adaw", "state-directory", {
      recursive: true,
      reason: "Full ADAW state removal was requested with --include-state."
    }));
    return actions;
  }

  actions.push(
    plannedDelete(root, ".adaw/manifest.json", "manifest"),
    plannedPreserve(root, ".adaw/protocol.md", "protocol", "Protocol is preserved unless --include-state is provided."),
    plannedPreserve(root, ".adaw/active", "active-goals", "Active goals and evidence are preserved unless --include-state is provided."),
    plannedPreserve(root, ".adaw/reports", "reports", "Acceptance reports are preserved unless --include-state is provided."),
    plannedPreserve(root, ".adaw/completed", "completed-archive", "Completed archives are preserved unless --include-state is provided."),
    plannedPreserve(root, ".adaw/blocked", "blocked-archive", "Blocked archives are preserved unless --include-state is provided."),
    plannedPreserve(root, ".adaw/brainstorms", "brainstorms", "Brainstorms are preserved unless --include-state is provided.")
  );
  return actions;
}

function buildUninstallPlan(root, actions, { dryRun = false, includeState = false } = {}) {
  const enrichedActions = actions.map((action) => enrichUninstallAction(root, action, { dryRun }));
  return {
    schema_version: "adaw/uninstall-plan-v1",
    root,
    dry_run: dryRun,
    include_state: includeState,
    summary: summarizeUninstallPlan(enrichedActions),
    actions: enrichedActions
  };
}

function applyUninstallActions(actions) {
  for (const action of actions) {
    if (action.action === "delete") {
      fs.rmSync(action.path, { force: true });
    }
    if (action.action === "delete-tree") {
      fs.rmSync(action.path, { recursive: true, force: true });
    }
  }
}

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

function argValues(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && index + 1 < args.length) {
      values.push(args[index + 1]);
    }
  }
  return values;
}

function resolveRoot(args) {
  return path.resolve(argValue(args, "--root", process.cwd()));
}

function relativeTo(root, filePath) {
  return path.relative(root, filePath) || ".";
}

function parseEvidenceSource(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("{")) {
    try {
      return JSON.parse(raw);
    } catch {
      return { type: "reference", label: raw };
    }
  }
  return { type: "reference", label: raw };
}

const SKILL_PACK = [
  {
    name: "adaw",
    description: "Route ADAW work through user-centered acceptance criteria, evidence, project health, and reporting Skills.",
    body: [
      "## When to use",
      "Use when the user mentions ADAW, asks to use ADAW for a task, continue ADAW, check completion, inspect project health, define acceptance criteria, record evidence, manage capability preferences, or produce an ADAW report.",
      "",
      "## Route",
      "- Goal, brainstorm, approval, or AC revision -> use `adaw-acceptance`.",
      "- Verification, evidence sufficiency, human confirmation, waiver, or why an AC is passing -> use `adaw-evidence`.",
      "- Required Skills, preferred stacks, avoided tools, or install policy -> use `adaw-capability-profile`.",
      "- Install, uninstall, doctor, manifest, Skill sync, or project recoverability -> use `adaw-project-health`.",
      "- Status, report, current gap, completion answer, user intervention, or change summary -> use `adaw-reporting`.",
      "",
      "## Baseline",
      "At the start of each ADAW turn, run `adaw resume --root <repo> --json` or `adaw status --root <repo> --json` unless the task is only install/doctor/uninstall.",
      "If `adaw` is not on PATH, use `node /Users/jarl/code/jarlone/adaw/bin/adaw.js` with the same arguments.",
      "",
      "## Rule",
      "Progress is determined by acceptance evidence, not implementation steps.",
      "Do not make the user remember CLI syntax or internal Skill names.",
      "Do not answer complete while the acceptance basis is draft or required AC/profile evidence is missing."
    ]
  },
  {
    name: "adaw-acceptance",
    description: "Create, review, approve, and revise ADAW human-centered acceptance criteria from natural language goals.",
    body: [
      "## When to use",
      "Use when the user gives a goal, wants to brainstorm acceptance directions, approves criteria, revises completion criteria, or says the AC is wrong.",
      "",
      "## Commands",
      "- Fuzzy idea or discussion: `adaw brainstorm --idea \"<idea>\" --root <repo> --json`.",
      "- Start from a goal: `adaw draft --goal \"<goal>\" --root <repo> --json`.",
      "- Start from a chosen brainstorm candidate: `adaw draft --from-brainstorm <brainstorm-id> --candidate <A|B|C> --root <repo> --json`.",
      "- User approves criteria: `adaw approve --root <repo> --summary \"<approval>\" --json`.",
      "- User revises a criterion: `adaw criterion update --root <repo> --criterion <id> --user-story ... --measurement ... --threshold ... --json`.",
      "",
      "## Rules",
      "ACs must describe user actions or judgments, not implementation files, commands, modules, fields, tests, Skills, or technology choices.",
      "Capability preferences belong in the Capability Profile, not user ACs.",
      "Do not treat brainstorm output as an acceptance contract or completion evidence."
    ]
  },
  {
    name: "adaw-evidence",
    description: "Record and judge ADAW evidence while preserving agent freedom to choose verification methods.",
    body: [
      "## When to use",
      "Use when the user asks to record validation as evidence, asks why an AC is passing, asks whether evidence is enough, confirms or waives an AC, or wants a verification attached to ADAW.",
      "",
      "## Evidence Protocol",
      "The agent may choose any useful verification method: tests, diff, screenshots, browser checks, logs, artifacts, URLs, AW doctor, human confirmation, or another reviewable signal.",
      "When submitting evidence, explain basis, sources, reviewability, confidence, and limitations.",
      "",
      "## Command",
      "`adaw evidence add --root <repo> --criterion <id> --kind <kind> --summary \"...\" --result <passing|failing|blocked|waived> --basis <basis> --source '<json-or-label>' --reviewability \"...\" --limitations \"...\" --json`",
      "",
      "Use multiple `--source` values when one AC is supported by several signals.",
      "For high-risk passing evidence, use a strong evidence kind or explicit strong confidence only when justified.",
      "Do not force evidence into a fixed adapter taxonomy."
    ]
  },
  {
    name: "adaw-capability-profile",
    description: "Record and report ADAW execution preferences such as required Skills, preferred stacks, avoided tools, and install policy.",
    body: [
      "## When to use",
      "Use when the user says a task must use a Skill, prefers a technology stack, wants to avoid a tool/library, or requires asking before installs.",
      "",
      "## Commands",
      "- Add preference: `adaw profile add --root <repo> --type <skill|stack|constraint> --name \"<name>\" --strength <must|prefer|avoid> --purpose \"<why>\" --install-policy <existing_only|ask_before_install|allowed> --json`.",
      "- Add compliance evidence: `adaw profile evidence --root <repo> --item <item-id> --result <satisfied|violated|waived> --summary \"<evidence>\" --json`.",
      "- Show profile: `adaw profile show --root <repo> --json`.",
      "",
      "## Rules",
      "Do not turn Skills or stack preferences into user ACs.",
      "`must` and violated `avoid` items block completion unless satisfied or waived.",
      "`prefer` should be reported but should not block completion by itself."
    ]
  },
  {
    name: "adaw-project-health",
    description: "Install, uninstall, diagnose, and recover project-local ADAW assets, manifest, and Skill Pack sync.",
    body: [
      "## When to use",
      "Use when the user asks to install ADAW, uninstall ADAW, check whether ADAW is ready, diagnose broken ADAW state, inspect manifest, or sync project Skills.",
      "",
      "## Commands",
      "- Preview install: `adaw install --root <repo> --dry-run --json`.",
      "- Install Skill Pack: `adaw install --root <repo> --skill --json`.",
      "- Preview destructive install: `adaw install --root <repo> --skill --force --dry-run --json`.",
      "- Confirm destructive install: `adaw install --root <repo> --skill --force --confirm --json`.",
      "- Doctor: `adaw doctor --root <repo> --json`.",
      "- Preview uninstall: `adaw uninstall --root <repo> --dry-run --json`.",
      "- Remove entry assets while preserving state: `adaw uninstall --root <repo> --confirm --json`.",
      "- Remove all ADAW state only after explicit user acceptance: `adaw uninstall --root <repo> --include-state --confirm --json`.",
      "",
      "## Rules",
      "Always show dry-run plans before destructive writes.",
      "Default uninstall preserves active goals, evidence, reports, archives, and brainstorms."
    ]
  },
  {
    name: "adaw-reporting",
    description: "Summarize ADAW status, reports, current gaps, user intervention, and acceptance evidence for humans.",
    body: [
      "## When to use",
      "Use when the user asks whether work is complete, what remains, what they need to do, what changed, or asks for an ADAW report.",
      "",
      "## Commands",
      "- Resume: `adaw resume --root <repo> --json`.",
      "- Next gap: `adaw next --root <repo> --json`.",
      "- Status: `adaw status --root <repo> --json`.",
      "- Report: `adaw report --root <repo> --json`.",
      "- Changes: `adaw changes --root <repo> --json`.",
      "- List goals: `adaw list --root <repo> --json`.",
      "",
      "## Rules",
      "Lead with completion state, current gap, evidence basis, and required human intervention.",
      "Summarize implementation details only as supporting evidence.",
      "Never report complete unless all required ACs and blocking Capability Profile items are passing or waived."
    ]
  }
];

function skillMarkdown(skill) {
  return [
    "---",
    `name: ${skill.name}`,
    `description: ${skill.description}`,
    "---",
    "",
    ...skill.body,
    ""
  ].join("\n");
}

function exportedSkillMarkdown() {
  return skillMarkdown(SKILL_PACK[0]);
}

function skillPackMarkdowns() {
  return Object.fromEntries(SKILL_PACK.map((skill) => [skill.name, skillMarkdown(skill)]));
}

function skillPackPath(root, skillName) {
  return path.join(root, ".agents", "skills", skillName, "SKILL.md");
}

function skillPackInstallActions(root, { dryRun = false, force = false } = {}) {
  const markdowns = skillPackMarkdowns();
  return SKILL_PACK.map((skill) => writeIfSafe(
    skillPackPath(root, skill.name),
    markdowns[skill.name],
    { dryRun, force, kind: "skill" }
  ));
}

function writeIfSafe(filePath, content, { dryRun = false, force = false, kind = "file", managed = true } = {}) {
  const exists = fs.existsSync(filePath);
  const action = exists ? (force ? "overwrite" : "skip") : "create";
  if (!dryRun && (!exists || force)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  return { path: filePath, action, kind, managed };
}

function ensureDir(dirPath, { dryRun = false, kind = "directory", managed = true } = {}) {
  const exists = fs.existsSync(dirPath);
  if (!dryRun && !exists) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return { path: dirPath, action: exists ? "exists" : "create", kind, managed };
}

function protocolTemplate() {
  const source = path.resolve(import.meta.dirname, "..", ".adaw", "protocol.md");
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

function manifestPath(root) {
  return path.join(root, ".adaw", "manifest.json");
}

function fileHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function projectSkillState(root) {
  const skillPath = skillPackPath(root, "adaw");
  const exists = fs.existsSync(skillPath);
  const expectedHash = createHash("sha256").update(exportedSkillMarkdown()).digest("hex");
  const actualHash = fileHash(skillPath);
  return {
    installed: exists,
    path: relativeTo(root, skillPath),
    in_sync: exists ? actualHash === expectedHash : false,
    expected_sha256: expectedHash,
    actual_sha256: actualHash
  };
}

function projectSkillPackState(root) {
  const markdowns = skillPackMarkdowns();
  const skills = SKILL_PACK.map((skill) => {
    const skillPath = skillPackPath(root, skill.name);
    const exists = fs.existsSync(skillPath);
    const expectedHash = createHash("sha256").update(markdowns[skill.name]).digest("hex");
    const actualHash = fileHash(skillPath);
    return {
      name: skill.name,
      path: relativeTo(root, skillPath),
      installed: exists,
      in_sync: exists ? actualHash === expectedHash : false,
      expected_sha256: expectedHash,
      actual_sha256: actualHash
    };
  });
  return {
    schema_version: "adaw/skill-pack-v1",
    installed: skills.every((skill) => skill.installed),
    in_sync: skills.every((skill) => skill.installed && skill.in_sync),
    count: skills.length,
    skills
  };
}

function activeGoalSummaries(root) {
  return findActivePairs(root).map((pair) => {
    try {
      const payload = readJson(pair.evidencePath);
      return {
        goal_id: pair.goalId,
        status: payload.ledger?.status || "unknown",
        current_gap: currentGap(payload.contract, payload.ledger),
        acceptance_path: relativeTo(root, pair.acceptancePath),
        evidence_path: relativeTo(root, pair.evidencePath),
        recoverable: true
      };
    } catch (error) {
      return {
        goal_id: pair.goalId,
        status: "unreadable",
        current_gap: null,
        acceptance_path: relativeTo(root, pair.acceptancePath),
        evidence_path: relativeTo(root, pair.evidencePath),
        recoverable: false,
        error: error.message
      };
    }
  });
}

function managedFiles(root, skill = projectSkillState(root), { assumeManifestExists = false } = {}) {
  const entries = [
    { path: ".adaw/manifest.json", kind: "manifest", required: true },
    { path: ".adaw/protocol.md", kind: "protocol", required: true },
    ...REQUIRED_ADAW_DIRS.map((dir) => ({ path: `.adaw/${dir}`, kind: "directory", required: true }))
  ];
  for (const packSkill of projectSkillPackState(root).skills.filter((entry) => entry.installed)) {
    entries.push({ path: packSkill.path, kind: "skill", required: false });
  }
  return entries.map((entry) => ({
    ...entry,
    exists: entry.path === ".adaw/manifest.json" && assumeManifestExists
      ? true
      : fs.existsSync(path.join(root, entry.path))
  }));
}

function safeReadManifest(root) {
  try {
    return readJson(manifestPath(root));
  } catch {
    return null;
  }
}

function buildManifest(root, options = {}) {
  const existing = safeReadManifest(root);
  const skill = projectSkillState(root);
  const skillPack = projectSkillPackState(root);
  const now = new Date().toISOString();
  return {
    schema_version: MANIFEST_SCHEMA_VERSION,
    protocol_version: PROTOCOL_VERSION,
    adaw_version: PACKAGE_JSON.version,
    created_at: existing?.created_at || now,
    updated_at: now,
    capabilities: ADAW_CAPABILITIES,
    managed_files: managedFiles(root, skill, options),
    active_goals: activeGoalSummaries(root),
    skill,
    skill_pack: skillPack
  };
}

function writeManifest(root, { dryRun = false } = {}) {
  const target = manifestPath(root);
  const exists = fs.existsSync(target);
  const manifest = buildManifest(root, { assumeManifestExists: !dryRun || exists });
  if (!dryRun) {
    writeJson(target, manifest);
  }
  return {
    path: target,
    action: exists ? "update" : "create",
    kind: "manifest",
    managed: true,
    manifest
  };
}

function inspectActiveGoals(root) {
  const activeDir = path.join(root, ".adaw", "active");
  const details = [];
  const issues = [];
  if (!fs.existsSync(activeDir)) return { details, issues };

  const files = fs.readdirSync(activeDir);
  const evidenceFiles = files.filter((fileName) => fileName.endsWith(".evidence.json"));
  const acceptanceFiles = files.filter((fileName) => fileName.endsWith(".acceptance.md"));
  const evidenceGoalIds = new Set(evidenceFiles.map((fileName) => fileName.replace(/\.evidence\.json$/, "")));

  for (const fileName of acceptanceFiles) {
    const goalId = fileName.replace(/\.acceptance\.md$/, "");
    if (!evidenceGoalIds.has(goalId)) {
      issues.push({ goal_id: goalId, message: "Acceptance contract has no matching evidence ledger." });
    }
  }

  for (const fileName of evidenceFiles) {
    const goalId = fileName.replace(/\.evidence\.json$/, "");
    const acceptancePath = path.join(activeDir, `${goalId}.acceptance.md`);
    const evidencePath = path.join(activeDir, fileName);
    if (!fs.existsSync(acceptancePath)) {
      issues.push({ goal_id: goalId, message: "Evidence ledger has no matching acceptance contract." });
      continue;
    }
    try {
      const payload = readJson(evidencePath);
      const validationIssues = validateContract(payload.contract, payload.ledger);
      details.push({
        goal_id: goalId,
        status: payload.ledger?.status || "unknown",
        current_gap: currentGap(payload.contract, payload.ledger),
        acceptance_path: relativeTo(root, acceptancePath),
        evidence_path: relativeTo(root, evidencePath),
        recoverable: validationIssues.length === 0
      });
      for (const issue of validationIssues) {
        issues.push({ goal_id: goalId, message: issue.message, path: issue.path });
      }
    } catch (error) {
      issues.push({ goal_id: goalId, message: error.message });
    }
  }

  return { details, issues };
}

function doctorCheck(name, condition, summary, recovery = undefined, severity = "needs-action") {
  const check = { name, ok: Boolean(condition), summary };
  if (!condition && recovery) check.recovery = recovery;
  if (!condition) check.severity = severity;
  return check;
}

function doctorRecoveryActions(checks, activeIssues = []) {
  const actions = checks
    .filter((check) => !check.ok && check.recovery)
    .map((check) => ({
      check: check.name,
      severity: check.severity || "needs-action",
      action: check.recovery
    }));

  for (const issue of activeIssues) {
    actions.push({
      check: "active_goal_issue",
      severity: "broken",
      goal_id: issue.goal_id,
      path: issue.path,
      action: issue.path
        ? `Inspect .adaw/active/${issue.goal_id}.evidence.json and fix ${issue.path}: ${issue.message}`
        : `Inspect .adaw/active/${issue.goal_id}.acceptance.md and .adaw/active/${issue.goal_id}.evidence.json: ${issue.message}`
    });
  }

  return actions;
}

function doctor(root) {
  const checks = [];
  const adawDir = path.join(root, ".adaw");
  const protocolPath = path.join(root, ".adaw", "protocol.md");
  const manifestFile = manifestPath(root);
  const active = inspectActiveGoals(root);

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  checks.push(doctorCheck(
    "node_runtime",
    nodeMajor >= 20,
    `Node runtime is ${process.version}.`,
    "Use Node.js 20 or newer."
  ));
  checks.push(doctorCheck(
    "adaw_directory",
    fs.existsSync(adawDir),
    fs.existsSync(adawDir) ? ".adaw directory exists." : ".adaw directory is missing.",
    "Run adaw install --root <project> --json."
  ));

  for (const dir of REQUIRED_ADAW_DIRS) {
    const dirPath = path.join(adawDir, dir);
    checks.push(doctorCheck(
      `dir_${dir}`,
      fs.existsSync(dirPath),
      fs.existsSync(dirPath) ? `.adaw/${dir} exists.` : `.adaw/${dir} is missing.`,
      "Run adaw install --root <project> --json."
    ));
  }

  checks.push(doctorCheck(
    "protocol_file",
    fs.existsSync(protocolPath),
    fs.existsSync(protocolPath) ? ".adaw/protocol.md exists." : ".adaw/protocol.md is missing.",
    "Run adaw install --root <project> --json."
  ));

  let manifest = null;
  let manifestReadable = false;
  try {
    manifest = readJson(manifestFile);
    manifestReadable = true;
  } catch (error) {
    checks.push(doctorCheck(
      "manifest_file",
      false,
      fs.existsSync(manifestFile) ? `.adaw/manifest.json is unreadable: ${error.message}` : ".adaw/manifest.json is missing.",
      "Run adaw install --root <project> --json to create or refresh the ADAW manifest.",
      fs.existsSync(manifestFile) ? "broken" : "needs-action"
    ));
  }

  if (manifestReadable) {
    checks.push(doctorCheck(
      "manifest_file",
      manifest.schema_version === MANIFEST_SCHEMA_VERSION,
      `.adaw/manifest.json uses schema ${manifest.schema_version || "<missing>"}.`,
      "Refresh the manifest with adaw install --root <project> --json.",
      "broken"
    ));
    checks.push(doctorCheck(
      "manifest_protocol",
      manifest.protocol_version === PROTOCOL_VERSION,
      `.adaw/manifest.json records protocol ${manifest.protocol_version || "<missing>"}.`,
      "Refresh the manifest with adaw install --root <project> --json.",
      "broken"
    ));
    checks.push(doctorCheck(
      "manifest_cli_version",
      manifest.adaw_version === PACKAGE_JSON.version,
      `.adaw/manifest.json records ADAW version ${manifest.adaw_version || "<missing>"}.`,
      "Refresh the manifest with adaw install --root <project> --json."
    ));
    checks.push(doctorCheck(
      "manifest_capabilities",
      sameStringSet(manifest.capabilities, ADAW_CAPABILITIES),
      Array.isArray(manifest.capabilities) ? "Manifest protocol capabilities are readable." : "Manifest protocol capabilities are missing.",
      "Refresh the manifest with adaw install --root <project> --json."
    ));

    const currentGoals = new Set(active.details.filter((goal) => goal.recoverable).map((goal) => goal.goal_id));
    const manifestGoals = new Set((manifest.active_goals || []).map((goal) => goal.goal_id));
    const staleGoals = [
      ...[...currentGoals].filter((goalId) => !manifestGoals.has(goalId)),
      ...[...manifestGoals].filter((goalId) => !currentGoals.has(goalId))
    ];
    checks.push(doctorCheck(
      "manifest_active_goals",
      staleGoals.length === 0,
      staleGoals.length === 0 ? "Manifest active goals match recoverable active goals." : `Manifest active goals differ: ${staleGoals.join(", ")}.`,
      "Run any ADAW state-changing command, or run adaw install --root <project> --json, to refresh the manifest."
    ));

    const missingManaged = (manifest.managed_files || [])
      .filter((entry) => entry.required !== false)
      .filter((entry) => !fs.existsSync(path.join(root, entry.path)))
      .map((entry) => entry.path);
    checks.push(doctorCheck(
      "managed_files",
      missingManaged.length === 0,
      missingManaged.length === 0 ? "Required ADAW managed files are present." : `Missing managed files: ${missingManaged.join(", ")}.`,
      "Run adaw install --root <project> --json."
    ));
  }

  checks.push(doctorCheck(
    "active_goals_recoverable",
    active.issues.length === 0,
    active.issues.length === 0 ? `${active.details.length} active goal(s) are recoverable.` : `${active.issues.length} active goal issue(s) found.`,
    "Inspect active_goal_issues, fix the reported .adaw/active/<goal>.acceptance.md and .adaw/active/<goal>.evidence.json pair, then rerun adaw doctor --root <project> --json.",
    "broken"
  ));

  const skill = projectSkillState(root);
  const skillPack = projectSkillPackState(root);
  const manifestSkillInstalled = manifest?.skill?.installed === true;
  const skillOk = !skill.installed && !manifestSkillInstalled ? true : skill.installed && skill.in_sync;
  if (manifestReadable) {
    checks.push(doctorCheck(
      "manifest_skill_state",
      Boolean(manifest.skill) && manifest.skill.installed === skill.installed && manifest.skill.path === skill.path,
      "Manifest Skill state matches the project Skill location.",
      "Refresh the manifest with adaw install --root <project> --json."
    ));
  }
  checks.push(doctorCheck(
    "skill_sync",
    skillOk,
    skill.installed
      ? (skill.in_sync ? "Project ADAW Skill is installed and in sync." : "Project ADAW Skill is installed but stale.")
      : "Project ADAW Skill is not installed; this is optional unless the manifest expects it.",
    "Run adaw install --root <project> --skill --force --json."
  ));
  const manifestPackNames = new Set((manifest?.skill_pack?.skills || []).map((entry) => entry.name));
  const packNames = new Set(skillPack.skills.map((entry) => entry.name));
  const manifestPackMatches = !manifestReadable || (
    manifest?.skill_pack?.schema_version === "adaw/skill-pack-v1"
    && sameStringSet([...manifestPackNames], [...packNames])
  );
  checks.push(doctorCheck(
    "skill_pack_manifest",
    manifestPackMatches,
    manifestPackMatches ? "Manifest Skill Pack state is readable." : "Manifest Skill Pack state is missing or stale.",
    "Refresh the manifest with adaw install --root <project> --skill --json."
  ));
  const packExpected = manifest?.skill_pack?.installed === true || skillPack.skills.some((entry) => entry.installed);
  const packOk = packExpected ? skillPack.installed && skillPack.in_sync : true;
  checks.push(doctorCheck(
    "skill_pack_sync",
    packOk,
    skillPack.installed
      ? (skillPack.in_sync ? "ADAW Skill Pack is installed and in sync." : "ADAW Skill Pack is installed but stale.")
      : "ADAW Skill Pack is not installed; this is optional unless the manifest expects it.",
    "Run adaw install --root <project> --skill --force --json."
  ));

  const status = checks.every((check) => check.ok)
    ? "ready"
    : checks.some((check) => !check.ok && check.severity === "broken")
      ? "broken"
      : "needs-action";
  return {
    status,
    checks,
    recovery_actions: doctorRecoveryActions(checks, active.issues),
    active_goals: active.details,
    active_goal_issues: active.issues,
    manifest_path: manifestFile,
    skill,
    skill_pack: skillPack
  };
}

function brainstormPaths(root, brainstormId) {
  const dir = path.join(root, ".adaw", "brainstorms");
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
    filePath.startsWith(".adaw/") ||
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

function inferRootFromAcceptancePath(acceptancePath) {
  const parts = path.resolve(acceptancePath).split(path.sep);
  const adawIndex = parts.lastIndexOf(".adaw");
  if (adawIndex <= 0) return process.cwd();
  return parts.slice(0, adawIndex).join(path.sep) || path.sep;
}

function refreshManifest(root) {
  if (fs.existsSync(path.join(root, ".adaw"))) {
    writeManifest(root);
  }
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
      evidencePath,
      root: inferRootFromAcceptancePath(acceptancePath)
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
    evidencePath: pair.evidencePath,
    root
  };
}

export async function main(args) {
  const command = args[0];
  if (!command || command === "--help" || command === "-h") {
    printJson(ok({ usage: "adaw <doctor|install|uninstall|brainstorm|draft|init|list|check|approve|criterion|profile|resume|next|evidence|evaluate|status|report|changes|archive|skill>" }));
    return;
  }

  if (command === "doctor") {
    const root = resolveRoot(args);
    printJson(ok({
      name: "adaw",
      root,
      ...doctor(root),
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
    const confirmed = hasFlag(args, "--confirm");
    const requestedSkill = hasFlag(args, "--skill");
    if (force && !dryRun && !confirmed) {
      printJson(fail(
        "confirm_required",
        "Install --force may overwrite existing ADAW-managed files.",
        "Run adaw install --root <project> --dry-run --force --json first, then rerun with --confirm if the destructive actions are acceptable."
      ));
      process.exitCode = 1;
      return;
    }
    const actions = [
      ensureDir(path.join(root, ".adaw", "active"), { dryRun }),
      ensureDir(path.join(root, ".adaw", "completed"), { dryRun }),
      ensureDir(path.join(root, ".adaw", "blocked"), { dryRun }),
      ensureDir(path.join(root, ".adaw", "reports"), { dryRun }),
      ensureDir(path.join(root, ".adaw", "brainstorms"), { dryRun }),
      writeIfSafe(path.join(root, ".adaw", "protocol.md"), protocolTemplate(), { dryRun, force, kind: "protocol" })
    ];

    if (requestedSkill) {
      actions.push(...skillPackInstallActions(root, { dryRun, force }));
    }
    const manifestAction = writeManifest(root, { dryRun });
    actions.push(manifestAction);
    const installPlan = buildInstallPlan(root, actions, { dryRun, force, requestedSkill });

    printJson(ok({
      root,
      dry_run: dryRun,
      force,
      confirmed,
      install_plan: installPlan,
      actions: installPlan.actions,
      manifest: manifestAction.manifest
    }));
    return;
  }

  if (command === "uninstall") {
    const root = resolveRoot(args);
    const dryRun = hasFlag(args, "--dry-run");
    const confirmed = hasFlag(args, "--confirm");
    const includeState = hasFlag(args, "--include-state");
    const actions = buildUninstallActions(root, { includeState });
    const uninstallPlan = buildUninstallPlan(root, actions, { dryRun, includeState });

    if (!dryRun && !confirmed) {
      printJson(fail(
        "confirm_required",
        "Uninstall removes ADAW-managed project assets.",
        "Run adaw uninstall --root <project> --dry-run --json first, then rerun with --confirm if the planned removals are acceptable."
      ));
      process.exitCode = 1;
      return;
    }

    if (!dryRun) {
      applyUninstallActions(actions);
    }

    printJson(ok({
      root,
      dry_run: dryRun,
      confirmed,
      include_state: includeState,
      uninstall_plan: uninstallPlan,
      actions: uninstallPlan.actions
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
    refreshManifest(root);
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
    refreshManifest(root);
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
    refreshManifest(root);

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
    const { contract, ledger, acceptancePath, evidencePath, root } = loadPair(args);
    contract.acceptance_basis = {
      status: "approved",
      summary: argValue(args, "--summary", "User approved acceptance criteria."),
      approved_at: new Date().toISOString()
    };
    recomputeWorkflowStatus(contract, ledger);
    savePair(acceptancePath, evidencePath, contract, ledger);
    refreshManifest(root);
    printJson(ok({
      goal_id: contract.goal_id,
      acceptance_basis: contract.acceptance_basis,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger)
    }));
    return;
  }

  if (command === "criterion" && args[1] === "update") {
    const { contract, ledger, acceptancePath, evidencePath, root } = loadPair(args);
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
    refreshManifest(root);
    printJson(ok({
      goal_id: contract.goal_id,
      criterion,
      acceptance_basis: contract.acceptance_basis,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger)
    }));
    return;
  }

  if (command === "profile" && args[1] === "add") {
    const { contract, ledger, acceptancePath, evidencePath, root } = loadPair(args);
    const item = {
      id: argValue(args, "--id"),
      type: argValue(args, "--type", "constraint"),
      name: argValue(args, "--name"),
      strength: argValue(args, "--strength", "prefer"),
      purpose: argValue(args, "--purpose", ""),
      scope: argValue(args, "--scope", ""),
      install_policy: argValue(args, "--install-policy", "ask_before_install")
    };
    addProfileItem(ledger, item);
    recomputeWorkflowStatus(contract, ledger);
    savePair(acceptancePath, evidencePath, contract, ledger);
    refreshManifest(root);
    printJson(ok({
      goal_id: contract.goal_id,
      profile: ledger.capability_profile,
      compliance: profileCompliance(ledger),
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger)
    }));
    return;
  }

  if (command === "profile" && args[1] === "evidence") {
    const { contract, ledger, acceptancePath, evidencePath, root } = loadPair(args);
    const itemId = argValue(args, "--item");
    if (!itemId) throw new Error("--item is required");
    const evidence = {
      result: argValue(args, "--result", "satisfied"),
      summary: argValue(args, "--summary", ""),
      path: argValue(args, "--path")
    };
    if (!evidence.summary) throw new Error("--summary is required");
    addProfileEvidence(ledger, itemId, evidence);
    recomputeWorkflowStatus(contract, ledger);
    savePair(acceptancePath, evidencePath, contract, ledger);
    refreshManifest(root);
    printJson(ok({
      goal_id: contract.goal_id,
      item: itemId,
      compliance: profileCompliance(ledger),
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger)
    }));
    return;
  }

  if (command === "profile" && args[1] === "show") {
    const { contract, ledger } = loadPair(args);
    printJson(ok({
      goal_id: contract.goal_id,
      profile: ledger.capability_profile || { items: [], evidence: [] },
      compliance: profileCompliance(ledger),
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
    const { contract, ledger, acceptancePath, evidencePath, root } = loadPair(args);
    const criterionId = argValue(args, "--criterion");
    if (!criterionId) throw new Error("--criterion is required");
    const sources = argValues(args, "--source").map((source) => parseEvidenceSource(source)).filter(Boolean);
    const evidence = {
      kind: argValue(args, "--kind", "manual"),
      basis: argValue(args, "--basis"),
      summary: argValue(args, "--summary", ""),
      result: argValue(args, "--result", "passing"),
      confidence: argValue(args, "--confidence"),
      path: argValue(args, "--path"),
      sources,
      reviewability: argValue(args, "--reviewability"),
      limitations: argValue(args, "--limitations")
    };
    if (!evidence.summary) throw new Error("--summary is required");
    addEvidence(contract, ledger, criterionId, evidence);
    writeJson(evidencePath, { contract, ledger });
    syncAcceptanceMarkdown(acceptancePath, contract, ledger);
    refreshManifest(root);
    printJson(ok({
      goal_id: contract.goal_id,
      criterion: criterionId,
      criterion_status: ledger.criteria[criterionId].status,
      confidence: ledger.criteria[criterionId].confidence,
      latest_evidence: criterionStatusRows(contract, ledger).find((row) => row.id === criterionId)?.latest_evidence,
      gate: ledger.criteria[criterionId].evidence.at(-1)?.gate,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger)
    }));
    return;
  }

  if (command === "evaluate") {
    const { contract, ledger, acceptancePath, evidencePath, root } = loadPair(args);
    recomputeWorkflowStatus(contract, ledger);
    writeJson(evidencePath, { contract, ledger });
    syncAcceptanceMarkdown(acceptancePath, contract, ledger);
    refreshManifest(root);
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
      intervention: intervention(contract, ledger),
      criteria: criterionStatusRows(contract, ledger)
    }));
    return;
  }

  if (command === "report") {
    const { contract, ledger, root } = loadPair(args);
    const output = path.resolve(argValue(args, "--output") || pathsForGoal(root, contract.goal_id).reportPath);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, renderReport(contract, ledger));
    refreshManifest(root);
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
    const targetAcceptance = path.join(root, ".adaw", archiveDir, path.basename(acceptancePath));
    const targetEvidence = path.join(root, ".adaw", archiveDir, path.basename(evidencePath));
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
    refreshManifest(root);
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
    if (hasFlag(args, "--pack")) {
      printJson(ok({
        schema_version: "adaw/skill-pack-v1",
        skills: SKILL_PACK.map((skill) => ({
          name: skill.name,
          skill_md: skillMarkdown(skill)
        }))
      }));
      return;
    }
    const skillName = argValue(args, "--name", "adaw");
    const skill = SKILL_PACK.find((entry) => entry.name === skillName);
    if (!skill) {
      printJson(fail("unknown_skill", `Unknown ADAW Skill: ${skillName}`, `Use one of: ${SKILL_PACK.map((entry) => entry.name).join(", ")}`));
      process.exitCode = 1;
      return;
    }
    printJson(ok({ skill_name: skill.name, skill_md: skillMarkdown(skill) }));
    return;
  }

  printJson(fail("unknown_command", `Unknown command: ${args.join(" ")}`));
  process.exitCode = 2;
}
