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
  nextRecommendation,
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
const MANIFEST_SCHEMA_VERSION = "opennori/manifest-v1";
const REQUIRED_NORI_DIRS = ["active", "completed", "blocked", "reports", "brainstorms"];
const NORI_CAPABILITIES = [
  "acceptance-contract",
  "evidence-ledger",
  "reviewable-evidence",
  "skill-pack",
  "brainstorm",
  "capability-profile",
  "profile-check",
  "archive",
  "bootstrap",
  "report",
  "doctor",
  "upgrade",
  "context-export"
];
const WRITING_INSTALL_ACTIONS = new Set(["create", "overwrite", "update"]);
const WRITING_UNINSTALL_ACTIONS = new Set(["delete", "delete-tree"]);
const WRITING_UPGRADE_ACTIONS = new Set(["update", "overwrite"]);

function sameStringSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size !== rightSet.size) return false;
  return [...leftSet].every((item) => rightSet.has(item));
}

function installActionReason(action, kind) {
  if (action === "create") return `Missing OpenNori ${kind} will be created.`;
  if (action === "exists") return `Required OpenNori ${kind} already exists.`;
  if (action === "skip") return `Existing OpenNori ${kind} is not overwritten without --force.`;
  if (action === "overwrite") return `Existing OpenNori ${kind} will be overwritten because --force was provided.`;
  if (action === "update") return `OpenNori ${kind} will be refreshed from current project state.`;
  return `OpenNori ${kind} action: ${action}.`;
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
    schema_version: "opennori/install-plan-v1",
    root,
    dry_run: dryRun,
    force,
    requested_skill: requestedSkill,
    summary: summarizeInstallPlan(enrichedActions),
    actions: enrichedActions
  };
}

function uninstallActionReason(action, kind) {
  if (action === "delete") return `Existing OpenNori ${kind} will be removed.`;
  if (action === "delete-tree") return `Existing OpenNori ${kind} and its contents will be removed.`;
  if (action === "absent") return `OpenNori ${kind} is already absent.`;
  if (action === "preserve") return `OpenNori ${kind} is preserved by default.`;
  return `OpenNori ${kind} action: ${action}.`;
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

function upgradeActionReason(action, kind) {
  if (action === "current") return `OpenNori ${kind} is already current.`;
  if (action === "update") return `OpenNori ${kind} will be refreshed to the current CLI version.`;
  if (action === "overwrite") return `OpenNori ${kind} will be overwritten to refresh generated OpenNori assets.`;
  if (action === "missing") return `OpenNori ${kind} is missing; run install before upgrade.`;
  return `OpenNori ${kind} action: ${action}.`;
}

function enrichUpgradeAction(root, action, { dryRun = false } = {}) {
  const wouldWrite = WRITING_UPGRADE_ACTIONS.has(action.action);
  return {
    path: relativeTo(root, action.path),
    kind: action.kind || "file",
    action: action.action,
    managed: action.managed !== false,
    would_write: wouldWrite,
    will_write: wouldWrite && !dryRun,
    destructive: action.action === "overwrite",
    from_version: action.from_version,
    to_version: action.to_version,
    reason: action.reason || upgradeActionReason(action.action, action.kind || "file")
  };
}

function summarizeUpgradePlan(actions) {
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

function buildUpgradePlan(root, actions, { dryRun = false, requestedSkill = false } = {}) {
  const enrichedActions = actions.map((action) => enrichUpgradeAction(root, action, { dryRun }));
  return {
    schema_version: "opennori/upgrade-plan-v1",
    root,
    dry_run: dryRun,
    requested_skill: requestedSkill,
    summary: summarizeUpgradePlan(enrichedActions),
    actions: enrichedActions
  };
}

function applyUpgradeActions(actions) {
  for (const action of actions) {
    if (WRITING_UPGRADE_ACTIONS.has(action.action) && action.write) action.write();
  }
}

function buildContextExport(root, pair) {
  const payload = readJson(pair.evidencePath);
  const contract = payload.contract;
  const ledger = payload.ledger;
  const reportPath = pathsForGoal(root, contract.goal_id).reportPath;
  const recommendation = nextRecommendation(contract, ledger);
  return {
    schema_version: "opennori/context-export-v1",
    exported_at: new Date().toISOString(),
    root,
    goal_id: contract.goal_id,
    goal: contract.goal,
    acceptance_basis: contract.acceptance_basis || { status: "draft" },
    workflow_status: ledger.status,
    current_gap: currentGap(contract, ledger),
    completion: completionAnswer(contract, ledger),
    intervention: intervention(contract, ledger),
    next_recommendation: recommendation,
    criteria: criterionStatusRows(contract, ledger),
    capability_profile: ledger.capability_profile || { items: [], evidence: [] },
    capability_compliance: profileCompliance(ledger),
    paths: {
      acceptance: relativeTo(root, pair.acceptancePath),
      evidence: relativeTo(root, pair.evidencePath),
      report: relativeTo(root, reportPath),
      report_exists: fs.existsSync(reportPath),
      manifest: relativeTo(root, manifestPath(root))
    },
    manifest: safeReadManifest(root)
  };
}

function buildUninstallActions(root, { includeState = false } = {}) {
  const actions = SKILL_PACK.map((skill) => plannedDelete(root, `.agents/skills/${skill.name}/SKILL.md`, "skill"));

  if (includeState) {
    actions.push(plannedDelete(root, ".opennori", "state-directory", {
      recursive: true,
      reason: "Full OpenNori state removal was requested with --include-state."
    }));
    return actions;
  }

  actions.push(
    plannedDelete(root, ".opennori/manifest.json", "manifest"),
    plannedPreserve(root, ".opennori/protocol.md", "protocol", "Protocol is preserved unless --include-state is provided."),
    plannedPreserve(root, ".opennori/active", "active-goals", "Active goals and evidence are preserved unless --include-state is provided."),
    plannedPreserve(root, ".opennori/reports", "reports", "Acceptance reports are preserved unless --include-state is provided."),
    plannedPreserve(root, ".opennori/completed", "completed-archive", "Completed archives are preserved unless --include-state is provided."),
    plannedPreserve(root, ".opennori/blocked", "blocked-archive", "Blocked archives are preserved unless --include-state is provided."),
    plannedPreserve(root, ".opennori/brainstorms", "brainstorms", "Brainstorms are preserved unless --include-state is provided.")
  );
  return actions;
}

function buildUninstallPlan(root, actions, { dryRun = false, includeState = false } = {}) {
  const enrichedActions = actions.map((action) => enrichUninstallAction(root, action, { dryRun }));
  return {
    schema_version: "opennori/uninstall-plan-v1",
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

function printText(line = "") {
  process.stdout.write(`${line}\n`);
}

function argValue(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  if (index === -1 || index + 1 >= args.length) return fallback;
  return args[index + 1];
}

function hasFlag(args, name) {
  return args.includes(name);
}

function wantsJson(args) {
  return hasFlag(args, "--json");
}

function isInteractive(args) {
  return !wantsJson(args) && process.stdin.isTTY && process.stdout.isTTY;
}

const CLI_NAME = "opennori";
const TOP_LEVEL_USAGE = `${CLI_NAME} <bootstrap|doctor|install|upgrade|uninstall|brainstorm|draft|init|list|check|approve|criterion|profile|resume|next|evidence|evaluate|status|report|context|changes|archive|skill>`;

function wantsHelp(args) {
  return args.includes("--help") || args.includes("-h");
}

function usageFor(args) {
  const [command, subcommand] = args;
  if (!command || command === "--help" || command === "-h") return TOP_LEVEL_USAGE;
  if (command === "bootstrap") return `${CLI_NAME} bootstrap --root <project> [--confirm] [--json]`;
  if (command === "install") return `${CLI_NAME} install --root <project> [--skill] [--dry-run] [--force] [--confirm] [--json]`;
  if (command === "upgrade") return `${CLI_NAME} upgrade --root <project> [--skill] [--dry-run] [--confirm] [--json]`;
  if (command === "uninstall") return `${CLI_NAME} uninstall --root <project> [--include-state] [--dry-run] [--confirm] [--json]`;
  if (command === "doctor") return `${CLI_NAME} doctor --root <project> [--json]`;
  if (command === "brainstorm") return `${CLI_NAME} brainstorm --idea "<idea>" --root <project> [--id <id>] [--json]`;
  if (command === "draft") return `${CLI_NAME} draft --goal "<goal>" --root <project> [--goal-id <id>] [--json]`;
  if (command === "init") return `${CLI_NAME} init <brief.json> --root <project> [--json]`;
  if (command === "criterion" && subcommand === "update") return `${CLI_NAME} criterion update --root <project> --criterion <id> --user-story ... --measurement ... --threshold ... [--json]`;
  if (command === "profile" && subcommand === "add") return `${CLI_NAME} profile add --root <project> --type <skill|stack|constraint> --name <name> --strength <must|prefer|avoid> --purpose <purpose> [--json]`;
  if (command === "profile" && subcommand === "evidence") return `${CLI_NAME} profile evidence --root <project> --item <item-id> --result <satisfied|violated|waived> --summary <summary> [--json]`;
  if (command === "profile") return `${CLI_NAME} profile <add|evidence|show|check> --root <project> [--json]`;
  if (command === "evidence" && subcommand === "add") return `${CLI_NAME} evidence add --root <project> --criterion <id> --kind <kind> --summary <summary> --result <passing|failing|blocked|waived> [--json]`;
  if (command === "evidence") return `${CLI_NAME} evidence add --root <project> --criterion <id> --kind <kind> --summary <summary> --result <passing|failing|blocked|waived> [--json]`;
  if (command === "context" && subcommand === "export") return `${CLI_NAME} context export --root <project> [--json]`;
  if (command === "context") return `${CLI_NAME} context export --root <project> [--json]`;
  if (command === "skill" && subcommand === "export") return `${CLI_NAME} skill export [--pack] [--json]`;
  if (command === "skill") return `${CLI_NAME} skill export [--pack] [--json]`;
  if (["list", "check", "approve", "resume", "next", "evaluate", "status", "report", "changes", "archive"].includes(command)) {
    return `${CLI_NAME} ${command} --root <project> [--goal <goal-id>] [--json]`;
  }
  return TOP_LEVEL_USAGE;
}

function describeBootstrapAction(action) {
  if (action.action === "create") return `create ${action.path}`;
  if (action.action === "skip") return `keep existing ${action.path}`;
  if (action.action === "exists") return `already exists ${action.path}`;
  if (action.action === "update") return `update ${action.path}`;
  if (action.action === "overwrite") return `overwrite ${action.path}`;
  return `${action.action} ${action.path}`;
}

function printBootstrapPreview(payload) {
  const data = payload.data;
  printText("");
  printText("OpenNori project setup");
  printText(`Project: ${data.root}`);
  printText("");

  if (data.status === "ready") {
    printText("OpenNori is already ready in this project.");
    printText("Next: tell your agent the goal and ask it to use OpenNori.");
    return;
  }

  printText("This will prepare OpenNori for this project:");
  for (const action of data.install_plan.actions.filter((item) => item.would_write).slice(0, 8)) {
    printText(`- ${describeBootstrapAction(action)}`);
  }
  const remaining = data.install_plan.summary.would_write - Math.min(data.install_plan.summary.would_write, 8);
  if (remaining > 0) printText(`- plus ${remaining} more OpenNori project assets`);
  printText("");
  printText("No files have been written yet.");
}

function printBootstrapResult(payload) {
  const data = payload.data;
  printText("");
  if (data.status === "installed") {
    printText("OpenNori installed.");
    printText(`Created or refreshed ${data.install_plan.summary.will_write} project assets.`);
    printText("Next: tell your agent the goal and ask it to use OpenNori.");
    return;
  }
  if (data.status === "ready") {
    printText("OpenNori is ready.");
    printText("Next: tell your agent the goal and ask it to use OpenNori.");
    return;
  }
  printText(data.next || "OpenNori bootstrap finished.");
}

async function promptConfirm(message) {
  process.stdout.write(`${message} [y/N] `);
  return new Promise((resolve) => {
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", (chunk) => {
      process.stdin.pause();
      resolve(/^y(es)?$/i.test(String(chunk).trim()));
    });
  });
}

async function runBootstrap(args) {
  const root = resolveRoot(args);
  const confirmed = hasFlag(args, "--confirm");

  if (!isInteractive(args)) {
    printJson(bootstrap(root, { confirmed }));
    return;
  }

  if (confirmed) {
    printBootstrapResult(bootstrap(root, { confirmed: true }));
    return;
  }

  const preview = bootstrap(root, { confirmed: false });
  printBootstrapPreview(preview);
  if (preview.data.status === "ready") return;

  const shouldInstall = await promptConfirm("Install OpenNori here?");
  if (!shouldInstall) {
    printText("");
    printText("No changes made.");
    return;
  }

  printBootstrapResult(bootstrap(root, { confirmed: true }));
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

function evidenceSourcesFromArgs(args) {
  const sources = argValues(args, "--source").map((source) => parseEvidenceSource(source)).filter(Boolean);
  for (const command of argValues(args, "--source-command")) {
    sources.push({ type: "command", label: command, command });
  }
  for (const sourcePath of argValues(args, "--source-path")) {
    sources.push({ type: "artifact", label: sourcePath, path: sourcePath });
  }
  for (const url of argValues(args, "--source-url")) {
    sources.push({ type: "url", label: url, url });
  }
  return sources;
}

const SKILL_PACK = [
  {
    name: "nori",
    description: "Route OpenNori work through user-centered acceptance criteria, evidence, project health, and reporting Skills.",
    body: [
      "## When to use",
      "Use when the user mentions OpenNori, asks to use OpenNori for a task, continue OpenNori, check completion, inspect project health, define acceptance criteria, record evidence, manage capability preferences, or produce an OpenNori report.",
      "",
      "## Route",
      "- Goal, brainstorm, approval, or AC revision -> use `nori-acceptance`.",
      "- Verification, evidence sufficiency, human confirmation, waiver, or why an AC is passing -> use `nori-evidence`.",
      "- Required Skills, preferred stacks, avoided tools, or install policy -> use `nori-capability-profile`.",
      "- Install, uninstall, doctor, manifest, Skill sync, or project recoverability -> use `nori-project-health`.",
      "- Status, report, current gap, completion answer, user intervention, or change summary -> use `nori-reporting`.",
      "",
      "## Baseline",
      "At the start of each OpenNori turn, run `opennori bootstrap --root <repo> --json` if project readiness is unknown; otherwise run `opennori resume --root <repo> --json` or `opennori status --root <repo> --json`.",
      "If bootstrap returns `needs_confirm`, show the preview briefly and ask the user before rerunning with `--confirm`.",
      "Use `next_recommendation` and top-level `next_actions` to continue the OpenNori loop; do not make the user repeatedly ask what the next step is.",
      "If `opennori` is not on PATH, use the installed package binary such as `node ./node_modules/opennori/bin/opennori.js` or this repository's `node ./bin/opennori.js` with the same arguments.",
      "",
      "## Rule",
      "Progress is determined by acceptance evidence, not implementation steps.",
      "Do not make the user remember CLI syntax or internal Skill names.",
      "Do not answer complete while the acceptance basis is draft or required AC/profile evidence is missing."
    ]
  },
  {
    name: "nori-acceptance",
    description: "Create, review, approve, and revise OpenNori human-centered acceptance criteria from natural language goals.",
    body: [
      "## When to use",
      "Use when the user gives a goal, wants to brainstorm acceptance directions, approves criteria, revises completion criteria, or says the AC is wrong.",
      "",
      "## Commands",
      "- Fuzzy idea or discussion: `opennori brainstorm --idea \"<idea>\" --root <repo> --json`.",
      "- Start from a goal: `opennori draft --goal \"<goal>\" --root <repo> --json`.",
      "- Start from a chosen brainstorm candidate: `opennori draft --from-brainstorm <brainstorm-id> --candidate <A|B|C> --root <repo> --json`.",
      "- User approves criteria: `opennori approve --root <repo> --summary \"<approval>\" --json`.",
      "- User revises a criterion: `opennori criterion update --root <repo> --criterion <id> --user-story ... --measurement ... --threshold ... --json`.",
      "",
      "## Rules",
      "ACs must describe user actions or judgments, not implementation files, commands, modules, fields, tests, Skills, or technology choices.",
      "Capability preferences belong in the Nori Profile, not user ACs.",
      "Do not treat brainstorm output as a Nori Contract or completion evidence."
    ]
  },
  {
    name: "nori-evidence",
    description: "Record and judge OpenNori evidence while preserving agent freedom to choose verification methods.",
    body: [
      "## When to use",
      "Use when the user asks to record validation as evidence, asks why an AC is passing, asks whether evidence is enough, confirms or waives an AC, or wants a verification attached to OpenNori.",
      "",
      "## Evidence Protocol",
      "The agent may choose any useful verification method: tests, diff, screenshots, browser checks, logs, artifacts, URLs, AW doctor, human confirmation, or another reviewable signal.",
      "When submitting evidence, explain basis, sources, reviewability, confidence, and limitations.",
      "",
      "## Command",
      "`opennori evidence add --root <repo> --criterion <id> --kind <kind> --summary \"...\" --result <passing|failing|blocked|waived> --basis <basis> --source '<json-or-label>' --source-command '<command>' --source-path '<path>' --source-url '<url>' --reviewability \"...\" --limitations \"...\" --json`",
      "",
      "Use multiple source flags when one AC is supported by several signals; prefer typed `--source-command`, `--source-path`, or `--source-url` when they fit, and use raw `--source` for anything else.",
      "For high-risk passing evidence, use a strong evidence kind or explicit strong confidence only when justified.",
      "Do not force evidence into a fixed adapter taxonomy."
    ]
  },
  {
    name: "nori-capability-profile",
    description: "Record and report OpenNori execution preferences such as required Skills, preferred stacks, avoided tools, and install policy.",
    body: [
      "## When to use",
      "Use when the user says a task must use a Skill, prefers a technology stack, wants to avoid a tool/library, or requires asking before installs.",
      "",
      "## Commands",
      "- Add preference: `opennori profile add --root <repo> --type <skill|stack|constraint> --name \"<name>\" --strength <must|prefer|avoid> --purpose \"<why>\" --install-policy <existing_only|ask_before_install|allowed> --json`.",
      "- Add compliance evidence: `opennori profile evidence --root <repo> --item <item-id> --result <satisfied|violated|waived> --summary \"<evidence>\" --json`.",
      "- Show profile: `opennori profile show --root <repo> --json`.",
      "",
      "## Rules",
      "Do not turn Skills or stack preferences into user ACs.",
      "`must` and violated `avoid` items block completion unless satisfied or waived.",
      "`prefer` should be reported but should not block completion by itself."
    ]
  },
  {
    name: "nori-project-health",
    description: "Install, uninstall, diagnose, and recover project-local OpenNori assets, manifest, and Skill Pack sync.",
    body: [
      "## When to use",
      "Use when the user asks to install OpenNori, uninstall OpenNori, check whether OpenNori is ready, diagnose broken OpenNori state, inspect manifest, or sync project Skills.",
      "",
      "## Commands",
      "- Short readiness / first-time preview: `opennori bootstrap --root <repo> --json`.",
      "- Confirm first-time setup after user approval: `opennori bootstrap --root <repo> --confirm --json`.",
      "- Preview install: `opennori install --root <repo> --dry-run --json`.",
      "- Install Skill Pack: `opennori install --root <repo> --skill --json`.",
      "- Preview destructive install: `opennori install --root <repo> --skill --force --dry-run --json`.",
      "- Confirm destructive install: `opennori install --root <repo> --skill --force --confirm --json`.",
      "- Doctor: `opennori doctor --root <repo> --json`.",
      "- Preview uninstall: `opennori uninstall --root <repo> --dry-run --json`.",
      "- Remove entry assets while preserving state: `opennori uninstall --root <repo> --confirm --json`.",
      "- Remove all OpenNori state only after explicit user acceptance: `opennori uninstall --root <repo> --include-state --confirm --json`.",
      "",
      "## Rules",
      "Always show dry-run plans before destructive writes.",
      "Default uninstall preserves active goals, evidence, reports, archives, and brainstorms."
    ]
  },
  {
    name: "nori-reporting",
    description: "Summarize OpenNori status, reports, current gaps, user intervention, and acceptance evidence for humans.",
    body: [
      "## When to use",
      "Use when the user asks whether work is complete, what remains, what they need to do, what changed, or asks for an OpenNori report.",
      "",
      "## Commands",
      "- Resume: `opennori resume --root <repo> --json`.",
      "- Next gap: `opennori next --root <repo> --json`.",
      "- Status: `opennori status --root <repo> --json`.",
      "- Report: `opennori report --root <repo> --json`.",
      "- Changes: `opennori changes --root <repo> --json`.",
      "- List goals: `opennori list --root <repo> --json`.",
      "",
      "## Rules",
      "Lead with completion state, current gap, evidence basis, and required human intervention.",
      "After reporting, follow `next_recommendation` / `next_actions` when the user has asked to continue, instead of asking the user what the next step is.",
      "Summarize implementation details only as supporting evidence.",
      "Never report complete unless all required ACs and blocking Nori Profile items are passing or waived."
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

function upgradeActions(root, { requestedSkill = false } = {}) {
  const existingManifest = safeReadManifest(root);
  const actions = [];
  const protocolPath = path.join(root, ".opennori", "protocol.md");
  const protocolContent = protocolTemplate();

  if (existingManifest) {
    actions.push({
      path: manifestPath(root),
      action: existingManifest.opennori_version === PACKAGE_JSON.version && sameStringSet(existingManifest.capabilities, NORI_CAPABILITIES)
        ? "current"
        : "update",
      kind: "manifest",
      managed: true,
      from_version: existingManifest.opennori_version,
      to_version: PACKAGE_JSON.version,
      write: () => writeManifest(root)
    });
  } else {
    actions.push({
      path: manifestPath(root),
      action: "missing",
      kind: "manifest",
      managed: true,
      to_version: PACKAGE_JSON.version
    });
  }

  if (fs.existsSync(protocolPath)) {
    const currentHash = fileHash(protocolPath);
    const expectedHash = createHash("sha256").update(protocolContent).digest("hex");
    actions.push({
      path: protocolPath,
      action: currentHash === expectedHash ? "current" : "overwrite",
      kind: "protocol",
      managed: true,
      write: () => {
        fs.mkdirSync(path.dirname(protocolPath), { recursive: true });
        fs.writeFileSync(protocolPath, protocolContent);
      }
    });
  } else {
    actions.push({
      path: protocolPath,
      action: "missing",
      kind: "protocol",
      managed: true
    });
  }

  if (requestedSkill) {
    const markdowns = skillPackMarkdowns();
    for (const skill of SKILL_PACK) {
      const target = skillPackPath(root, skill.name);
      if (!fs.existsSync(target)) {
        actions.push({ path: target, action: "missing", kind: "skill", managed: true });
        continue;
      }
      const expectedHash = createHash("sha256").update(markdowns[skill.name]).digest("hex");
      const currentHash = fileHash(target);
      actions.push({
        path: target,
        action: currentHash === expectedHash ? "current" : "overwrite",
        kind: "skill",
        managed: true,
        write: () => {
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, markdowns[skill.name]);
        }
      });
    }
  }

  const manifestAction = actions.find((action) => action.kind === "manifest");
  const refreshesManagedAssets = actions.some((action) => action.kind !== "manifest" && WRITING_UPGRADE_ACTIONS.has(action.action));
  if (manifestAction && manifestAction.action === "current" && refreshesManagedAssets) {
    manifestAction.action = "update";
    manifestAction.reason = "OpenNori manifest will be refreshed after managed assets are upgraded.";
  }

  return actions;
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
  const source = path.resolve(import.meta.dirname, "..", ".opennori", "protocol.md");
  if (fs.existsSync(source)) return fs.readFileSync(source, "utf8");
  return [
    "# OpenNori Protocol",
    "",
    "Progress is determined by human-centered acceptance evidence, not by implementation steps.",
    "",
    "Use `opennori init`, `opennori resume`, `opennori next`, `opennori evidence add`, `opennori evaluate`, `opennori status`, and `opennori report`.",
    ""
  ].join("\n");
}

function manifestPath(root) {
  return path.join(root, ".opennori", "manifest.json");
}

function fileHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function projectSkillState(root) {
  const skillPath = skillPackPath(root, "nori");
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
    schema_version: "opennori/skill-pack-v1",
    installed: skills.every((skill) => skill.installed),
    in_sync: skills.every((skill) => skill.installed && skill.in_sync),
    count: skills.length,
    skills
  };
}

function skillSearchPaths(name) {
  const home = process.env.HOME || "";
  return [
    path.join(home, ".agents", "skills", name, "SKILL.md"),
    path.join(home, ".codex", "skills", name, "SKILL.md")
  ].filter(Boolean);
}

function stackIsPresent(root, name) {
  const packageJsonPath = path.join(root, "package.json");
  if (!fs.existsSync(packageJsonPath)) return null;
  try {
    const packageJson = readJson(packageJsonPath);
    const dependencySets = [
      packageJson.dependencies,
      packageJson.devDependencies,
      packageJson.peerDependencies,
      packageJson.optionalDependencies
    ].filter(Boolean);
    return dependencySets.some((dependencies) => Object.prototype.hasOwnProperty.call(dependencies, name));
  } catch {
    return null;
  }
}

function autoProfileChecks(root, ledger) {
  const items = ledger.capability_profile?.items || [];
  return items.map((item) => {
    if (item.type === "skill") {
      const paths = skillSearchPaths(item.name);
      const foundPath = paths.find((candidate) => fs.existsSync(candidate));
      const result = foundPath ? (item.strength === "avoid" ? "violated" : "satisfied") : (item.strength === "avoid" ? "satisfied" : "unknown");
      return {
        item_id: item.id,
        type: item.type,
        name: item.name,
        strength: item.strength,
        result,
        basis: "local-skill-path",
        summary: foundPath
          ? `Skill ${item.name} is available at ${foundPath}.`
          : `Skill ${item.name} was not found in the standard local Skill paths.`,
        sources: paths.map((candidate) => ({ type: "artifact", label: candidate, path: candidate, exists: fs.existsSync(candidate) })),
        can_auto_record: result !== "unknown"
      };
    }

    if (item.type === "stack") {
      const present = stackIsPresent(root, item.name);
      if (present === true) {
        return {
          item_id: item.id,
          type: item.type,
          name: item.name,
          strength: item.strength,
          result: item.strength === "avoid" ? "violated" : "satisfied",
          basis: "package-json",
          summary: `Stack ${item.name} is present in package.json dependencies.`,
          sources: [{ type: "artifact", label: "package.json", path: path.join(root, "package.json") }],
          can_auto_record: true
        };
      }
      if (present === false) {
        return {
          item_id: item.id,
          type: item.type,
          name: item.name,
          strength: item.strength,
          result: item.strength === "avoid" ? "satisfied" : "unknown",
          basis: "package-json",
          summary: `Stack ${item.name} is not present in package.json dependencies.`,
          sources: [{ type: "artifact", label: "package.json", path: path.join(root, "package.json") }],
          can_auto_record: item.strength === "avoid"
        };
      }
      return {
        item_id: item.id,
        type: item.type,
        name: item.name,
        strength: item.strength,
        result: "unknown",
        basis: "package-json-unavailable",
        summary: "No readable package.json was available for automatic stack checks.",
        sources: [],
        can_auto_record: false
      };
    }

    return {
      item_id: item.id,
      type: item.type,
      name: item.name,
      strength: item.strength,
      result: "unknown",
      basis: "agent-or-human-review-required",
      summary: "Constraint items require agent evidence, human confirmation, or waiver.",
      sources: [],
      can_auto_record: false
    };
  });
}

function recordAutoProfileChecks(ledger, checks) {
  for (const check of checks.filter((entry) => entry.can_auto_record)) {
    const item = ledger.capability_profile?.items?.find((entry) => entry.id === check.item_id);
    const latest = item?.evidence?.at(-1);
    if (latest?.result === check.result && latest?.summary === check.summary) continue;
    addProfileEvidence(ledger, check.item_id, {
      result: check.result,
      summary: check.summary,
      path: check.sources?.[0]?.path
    });
  }
  return ledger;
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
    { path: ".opennori/manifest.json", kind: "manifest", required: true },
    { path: ".opennori/protocol.md", kind: "protocol", required: true },
    ...REQUIRED_NORI_DIRS.map((dir) => ({ path: `.opennori/${dir}`, kind: "directory", required: true }))
  ];
  for (const packSkill of projectSkillPackState(root).skills.filter((entry) => entry.installed)) {
    entries.push({ path: packSkill.path, kind: "skill", required: false });
  }
  return entries.map((entry) => ({
    ...entry,
    exists: entry.path === ".opennori/manifest.json" && assumeManifestExists
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
    opennori_version: PACKAGE_JSON.version,
    created_at: existing?.created_at || now,
    updated_at: now,
    capabilities: NORI_CAPABILITIES,
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
  const activeDir = path.join(root, ".opennori", "active");
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
      issues.push({ goal_id: goalId, message: "Acceptance contract has no matching evidence record." });
    }
  }

  for (const fileName of evidenceFiles) {
    const goalId = fileName.replace(/\.evidence\.json$/, "");
    const acceptancePath = path.join(activeDir, `${goalId}.acceptance.md`);
    const evidencePath = path.join(activeDir, fileName);
    if (!fs.existsSync(acceptancePath)) {
      issues.push({ goal_id: goalId, message: "Evidence ledger has no matching Nori Contract." });
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
        ? `Inspect .opennori/active/${issue.goal_id}.evidence.json and fix ${issue.path}: ${issue.message}`
        : `Inspect .opennori/active/${issue.goal_id}.acceptance.md and .opennori/active/${issue.goal_id}.evidence.json: ${issue.message}`
    });
  }

  return actions;
}

function doctor(root) {
  const checks = [];
  const noriDir = path.join(root, ".opennori");
  const protocolPath = path.join(root, ".opennori", "protocol.md");
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
    "opennori_directory",
    fs.existsSync(noriDir),
    fs.existsSync(noriDir) ? ".opennori directory exists." : ".opennori directory is missing.",
    "Run opennori bootstrap --root <project> --json."
  ));

  for (const dir of REQUIRED_NORI_DIRS) {
    const dirPath = path.join(noriDir, dir);
    checks.push(doctorCheck(
      `dir_${dir}`,
      fs.existsSync(dirPath),
      fs.existsSync(dirPath) ? `.opennori/${dir} exists.` : `.opennori/${dir} is missing.`,
      "Run opennori bootstrap --root <project> --json."
    ));
  }

  checks.push(doctorCheck(
    "protocol_file",
    fs.existsSync(protocolPath),
    fs.existsSync(protocolPath) ? ".opennori/protocol.md exists." : ".opennori/protocol.md is missing.",
    "Run opennori bootstrap --root <project> --json."
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
      fs.existsSync(manifestFile) ? `.opennori/manifest.json is unreadable: ${error.message}` : ".opennori/manifest.json is missing.",
      "Run opennori bootstrap --root <project> --json to preview setup or refresh the OpenNori manifest.",
      fs.existsSync(manifestFile) ? "broken" : "needs-action"
    ));
  }

  if (manifestReadable) {
    checks.push(doctorCheck(
      "manifest_file",
      manifest.schema_version === MANIFEST_SCHEMA_VERSION,
      `.opennori/manifest.json uses schema ${manifest.schema_version || "<missing>"}.`,
      "Refresh the manifest with opennori bootstrap --root <project> --json.",
      "broken"
    ));
    checks.push(doctorCheck(
      "manifest_protocol",
      manifest.protocol_version === PROTOCOL_VERSION,
      `.opennori/manifest.json records protocol ${manifest.protocol_version || "<missing>"}.`,
      "Refresh the manifest with opennori bootstrap --root <project> --json.",
      "broken"
    ));
    checks.push(doctorCheck(
      "manifest_cli_version",
      manifest.opennori_version === PACKAGE_JSON.version,
      `.opennori/manifest.json records OpenNori version ${manifest.opennori_version || "<missing>"}.`,
      "Refresh the manifest with opennori bootstrap --root <project> --json."
    ));
    checks.push(doctorCheck(
      "manifest_capabilities",
      sameStringSet(manifest.capabilities, NORI_CAPABILITIES),
      Array.isArray(manifest.capabilities) ? "Manifest protocol capabilities are readable." : "Manifest protocol capabilities are missing.",
      "Refresh the manifest with opennori bootstrap --root <project> --json."
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
      "Run any OpenNori state-changing command, or run opennori bootstrap --root <project> --json, to refresh the manifest."
    ));

    const missingManaged = (manifest.managed_files || [])
      .filter((entry) => entry.required !== false)
      .filter((entry) => !fs.existsSync(path.join(root, entry.path)))
      .map((entry) => entry.path);
    checks.push(doctorCheck(
      "managed_files",
      missingManaged.length === 0,
      missingManaged.length === 0 ? "Required OpenNori managed files are present." : `Missing managed files: ${missingManaged.join(", ")}.`,
      "Run opennori bootstrap --root <project> --json."
    ));
  }

  checks.push(doctorCheck(
    "active_goals_recoverable",
    active.issues.length === 0,
    active.issues.length === 0 ? `${active.details.length} active goal(s) are recoverable.` : `${active.issues.length} active goal issue(s) found.`,
    "Inspect active_goal_issues, fix the reported .opennori/active/<goal>.acceptance.md and .opennori/active/<goal>.evidence.json pair, then rerun opennori doctor --root <project> --json.",
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
      "Refresh the manifest with opennori bootstrap --root <project> --json."
    ));
  }
  checks.push(doctorCheck(
    "skill_sync",
    skillOk,
    skill.installed
      ? (skill.in_sync ? "Project OpenNori Skill is installed and in sync." : "Project OpenNori Skill is installed but stale.")
      : "Project OpenNori Skill is not installed; this is optional unless the manifest expects it.",
    "Run opennori install --root <project> --skill --force --json."
  ));
  const manifestPackNames = new Set((manifest?.skill_pack?.skills || []).map((entry) => entry.name));
  const packNames = new Set(skillPack.skills.map((entry) => entry.name));
  const manifestPackMatches = !manifestReadable || (
    manifest?.skill_pack?.schema_version === "opennori/skill-pack-v1"
    && sameStringSet([...manifestPackNames], [...packNames])
  );
  checks.push(doctorCheck(
    "skill_pack_manifest",
    manifestPackMatches,
    manifestPackMatches ? "Manifest Skill Pack state is readable." : "Manifest Skill Pack state is missing or stale.",
    "Refresh the manifest with opennori install --root <project> --skill --json."
  ));
  const packExpected = manifest?.skill_pack?.installed === true || skillPack.skills.some((entry) => entry.installed);
  const packOk = packExpected ? skillPack.installed && skillPack.in_sync : true;
  checks.push(doctorCheck(
    "skill_pack_sync",
    packOk,
    skillPack.installed
      ? (skillPack.in_sync ? "OpenNori Skill Pack is installed and in sync." : "OpenNori Skill Pack is installed but stale.")
      : "OpenNori Skill Pack is not installed; this is optional unless the manifest expects it.",
    "Run opennori install --root <project> --skill --force --json."
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
  const dir = path.join(root, ".opennori", "brainstorms");
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
      ...candidate.acceptance_directions.map((direction) => `- ${direction}`),
      "",
      "Risks:",
      ...candidate.risks.map((risk) => `- ${risk}`),
      ""
    );
  }

  lines.push("## Next", "", "User chooses a candidate or revises one before OpenNori draft.");
  return `${lines.join("\n")}\n`;
}

function classifyChangedFile(filePath) {
  if (
    filePath.startsWith(".opennori/") ||
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
    protocol_version: "opennori/brainstorm-v1",
    id,
    idea,
    status: "draft-source",
    candidates: BRAINSTORM_CANDIDATES,
    rule: "Brainstorm output is for choosing an acceptance direction. It is not a plan, a Nori Contract, or completion evidence."
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
      measurement: "用户查看 OpenNori draft、报告或目标结果后作出判断。",
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
  const noriIndex = parts.lastIndexOf(".opennori");
  if (noriIndex <= 0) return process.cwd();
  return parts.slice(0, noriIndex).join(path.sep) || path.sep;
}

function refreshManifest(root) {
  if (fs.existsSync(path.join(root, ".opennori"))) {
    writeManifest(root);
  }
}

function installActions(root, { dryRun = false, force = false, requestedSkill = false } = {}) {
  const actions = [
    ensureDir(path.join(root, ".opennori", "active"), { dryRun }),
    ensureDir(path.join(root, ".opennori", "completed"), { dryRun }),
    ensureDir(path.join(root, ".opennori", "blocked"), { dryRun }),
    ensureDir(path.join(root, ".opennori", "reports"), { dryRun }),
    ensureDir(path.join(root, ".opennori", "brainstorms"), { dryRun }),
    writeIfSafe(path.join(root, ".opennori", "protocol.md"), protocolTemplate(), { dryRun, force, kind: "protocol" })
  ];

  if (requestedSkill) {
    actions.push(...skillPackInstallActions(root, { dryRun, force }));
  }
  actions.push(writeManifest(root, { dryRun }));
  return actions;
}

function bootstrap(root, { confirmed = false } = {}) {
  const health = doctor(root);
  if (health.status === "ready") {
    return ok({
      root,
      status: "ready",
      confirmed,
      side_effect: "none",
      doctor: health,
      next: "OpenNori is ready. Continue from opennori resume/status, brainstorm, or draft based on the user's goal."
    });
  }

  const hasState = fs.existsSync(path.join(root, ".opennori"));
  const needsConfirm = !confirmed;
  const actions = installActions(root, {
    dryRun: needsConfirm,
    force: false,
    requestedSkill: true
  });
  const installPlan = buildInstallPlan(root, actions, {
    dryRun: needsConfirm,
    force: false,
    requestedSkill: true
  });
  const next = needsConfirm
    ? "Show this preview to the user and ask for confirmation before writing OpenNori project assets."
    : "OpenNori project assets are installed. Continue with the user's goal.";

  return ok(
    {
      root,
      status: needsConfirm ? "needs_confirm" : "installed",
      confirmed,
      existing_state: hasState,
      install_plan: installPlan,
      actions: installPlan.actions,
      doctor: needsConfirm ? health : doctor(root),
      next
    },
    [],
    hasState && health.status === "broken"
      ? ["Existing OpenNori state was not ready before bootstrap; review doctor output after install."]
      : [],
    [next]
  );
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
    throw new Error(`No active OpenNori goal found under ${root}`);
  }
  if (!goal && pairs.length > 1) {
    throw new Error("Multiple active OpenNori goals found. Pass --goal <goal-id> or explicit --acceptance/--evidence paths.");
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
    printJson(ok({ usage: TOP_LEVEL_USAGE, side_effect: "none" }));
    return;
  }

  if (wantsHelp(args)) {
    printJson(ok({ command: [command, args[1]].filter(Boolean).join(" "), usage: usageFor(args), side_effect: "none" }));
    return;
  }

  if (command === "bootstrap") {
    await runBootstrap(args);
    return;
  }

  if (command === "doctor") {
    const root = resolveRoot(args);
    printJson(ok({
      name: "opennori",
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
        "Install --force may overwrite existing OpenNori-managed files.",
        "Run opennori install --root <project> --dry-run --force --json first, then rerun with --confirm if the destructive actions are acceptable."
      ));
      process.exitCode = 1;
      return;
    }
    const actions = installActions(root, { dryRun, force, requestedSkill });
    const manifestAction = actions.find((action) => action.kind === "manifest");
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
        "Uninstall removes OpenNori-managed project assets.",
        "Run opennori uninstall --root <project> --dry-run --json first, then rerun with --confirm if the planned removals are acceptable."
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

  if (command === "upgrade") {
    const root = resolveRoot(args);
    const dryRun = hasFlag(args, "--dry-run");
    const confirmed = hasFlag(args, "--confirm");
    const requestedSkill = hasFlag(args, "--skill");
    const actions = upgradeActions(root, { requestedSkill });
    const upgradePlan = buildUpgradePlan(root, actions, { dryRun, requestedSkill });

    if (!dryRun && !confirmed) {
      printJson(fail(
        "confirm_required",
        "Upgrade refreshes OpenNori manifest, protocol, and optionally Skill Pack assets.",
        "Run opennori upgrade --root <project> --dry-run --json first, then rerun with --confirm if the planned updates are acceptable."
      ));
      process.exitCode = 1;
      return;
    }

    if (!dryRun && actions.some((action) => action.action === "missing")) {
      printJson(fail(
        "install_required",
        "Upgrade found missing OpenNori entry assets.",
        "Run opennori install --root <project> --dry-run --json before upgrading missing assets."
      ));
      process.exitCode = 1;
      return;
    }

    if (!dryRun) {
      applyUpgradeActions(actions);
      writeManifest(root);
    }

    printJson(ok({
      root,
      dry_run: dryRun,
      confirmed,
      upgrade_plan: upgradePlan,
      actions: upgradePlan.actions,
      manifest: dryRun ? buildManifest(root) : safeReadManifest(root)
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
      ["Ask the user to choose or revise a candidate before running opennori draft."]
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
      printJson({ ...fail("invalid_acceptance", "Draft does not produce a valid OpenNori contract", "Rewrite ACs from the user's perspective"), issues });
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
      printJson({ ...fail("invalid_acceptance", "Brief does not produce a valid OpenNori contract", "Rewrite ACs from the user's perspective"), issues });
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
      ["Run opennori next --acceptance <path> --evidence <path> --json before choosing implementation work."]
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

  if (command === "profile" && args[1] === "check") {
    const { contract, ledger, acceptancePath, evidencePath, root } = loadPair(args);
    const record = hasFlag(args, "--record");
    const checks = autoProfileChecks(root, ledger);
    if (record) {
      recordAutoProfileChecks(ledger, checks);
      recomputeWorkflowStatus(contract, ledger);
      savePair(acceptancePath, evidencePath, contract, ledger);
      refreshManifest(root);
    }
    printJson(ok({
      goal_id: contract.goal_id,
      recorded: record,
      checks,
      profile: ledger.capability_profile || { items: [], evidence: [] },
      compliance: profileCompliance(ledger),
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger)
    }));
    return;
  }

  if (command === "resume") {
    const { contract, ledger, acceptancePath, evidencePath } = loadPair(args);
    const recommendation = nextRecommendation(contract, ledger);
    printJson(ok({
      goal_id: contract.goal_id,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger),
      completion: completionAnswer(contract, ledger),
      intervention: intervention(contract, ledger),
      next_recommendation: recommendation,
      acceptance_path: acceptancePath,
      evidence_path: evidencePath
    }, [], [], recommendation.actions));
    return;
  }

  if (command === "next") {
    const { contract, ledger } = loadPair(args);
    const recommendation = nextRecommendation(contract, ledger);
    printJson(ok({
      goal_id: contract.goal_id,
      current_gap: currentGap(contract, ledger),
      complete: currentGap(contract, ledger) === null,
      next_recommendation: recommendation
    }, [], [], recommendation.actions));
    return;
  }

  if (command === "evidence" && args[1] === "add") {
    const { contract, ledger, acceptancePath, evidencePath, root } = loadPair(args);
    const criterionId = argValue(args, "--criterion");
    if (!criterionId) throw new Error("--criterion is required");
    const sources = evidenceSourcesFromArgs(args);
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
    const recommendation = nextRecommendation(contract, ledger);
    printJson(ok({
      goal_id: contract.goal_id,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger),
      completion: completionAnswer(contract, ledger),
      intervention: intervention(contract, ledger),
      next_recommendation: recommendation,
      criteria: criterionStatusRows(contract, ledger)
    }, [], [], recommendation.actions));
    return;
  }

  if (command === "report") {
    const { contract, ledger, root } = loadPair(args);
    const output = path.resolve(argValue(args, "--output") || pathsForGoal(root, contract.goal_id).reportPath);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, renderReport(contract, ledger));
    refreshManifest(root);
    const recommendation = nextRecommendation(contract, ledger);
    printJson(ok(
      { goal_id: contract.goal_id, report_path: output, workflow_status: ledger.status, next_recommendation: recommendation },
      [{ kind: "acceptance_report", path: output }],
      [],
      recommendation.actions
    ));
    return;
  }

  if (command === "context" && args[1] === "export") {
    const root = resolveRoot(args);
    const goal = argValue(args, "--goal");
    const pairs = findActivePairs(root);
    const pair = goal ? pairs.find((item) => item.goalId === goal) : pairs[0];
    if (!pair) throw new Error(`No active OpenNori goal found under ${root}`);
    if (!goal && pairs.length > 1) {
      throw new Error("Multiple active OpenNori goals found. Pass --goal <goal-id>.");
    }
    const context = buildContextExport(root, pair);
    const output = argValue(args, "--output");
    if (output) {
      const outputPath = path.resolve(output);
      writeJson(outputPath, context);
      printJson(ok(
        { ...context, output_path: outputPath },
        [{ kind: "opennori_context_export", path: outputPath }],
        [],
        context.next_recommendation.actions
      ));
      return;
    }
    printJson(ok(context, [], [], context.next_recommendation.actions));
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
      printJson(fail("not_archivable", `Goal ${contract.goal_id} is ${ledger.status}`, "Only complete or blocked OpenNori goals can be archived."));
      process.exitCode = 1;
      return;
    }

    const archiveDir = ledger.status === "complete" ? "completed" : "blocked";
    const targetAcceptance = path.join(root, ".opennori", archiveDir, path.basename(acceptancePath));
    const targetEvidence = path.join(root, ".opennori", archiveDir, path.basename(evidencePath));
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
        schema_version: "opennori/skill-pack-v1",
        skills: SKILL_PACK.map((skill) => ({
          name: skill.name,
          skill_md: skillMarkdown(skill)
        }))
      }));
      return;
    }
    const skillName = argValue(args, "--name", "nori");
    const skill = SKILL_PACK.find((entry) => entry.name === skillName);
    if (!skill) {
      printJson(fail("unknown_skill", `Unknown OpenNori Skill: ${skillName}`, `Use one of: ${SKILL_PACK.map((entry) => entry.name).join(", ")}`));
      process.exitCode = 1;
      return;
    }
    printJson(ok({ skill_name: skill.name, skill_md: skillMarkdown(skill) }));
    return;
  }

  printJson(fail("unknown_command", `Unknown command: ${args.join(" ")}`));
  process.exitCode = 2;
}
