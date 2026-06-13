import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  currentGap,
  findActivePairs,
  ok,
  PROTOCOL_VERSION,
  readJson,
  validateContract,
  writeJson
} from "./core.js";
import { SKILL_PACK, exportedSkillMarkdown, skillPackMarkdowns } from "./skills.js";
import {
  AGENT_ROUTE_END,
  AGENT_ROUTE_START,
  REQUIRED_ARCHITECTURE_DIRS,
  agentGuidePath,
  architectureDir,
  architectureState,
  renderAgentGuideMarkdown,
  renderAgentRouteMarkdown,
  renderAgentRouteSectionMarkdown
} from "./architecture.js";
import { packagePath } from "./package-root.js";
import { schemaErrorSummary, validateSchema } from "./validation.js";
import {
  buildInstallPlan,
  buildUninstallPlan,
  buildUpgradePlan,
  isWritingUpgradeAction
} from "./lifecycle/plans.js";

export {
  buildInstallPlan,
  buildUninstallPlan,
  buildUpgradePlan
};
export { applyUninstallActions, buildUninstallActions } from "./lifecycle/uninstall.js";
export { buildContextExport } from "./lifecycle/context-export.js";
export { autoProfileChecks, recordAutoProfileChecks } from "./lifecycle/profile-checks.js";

const PACKAGE_JSON = JSON.parse(fs.readFileSync(packagePath("package.json"), "utf8"));

function relativeTo(root, filePath) {
  return path.relative(root, filePath) || ".";
}

const MANIFEST_SCHEMA_VERSION = "opennori/manifest-v1";
const REQUIRED_NORI_DIRS = ["active", "completed", "blocked", "reports", "brainstorms"];
const NORI_CAPABILITIES = [
  "acceptance-contract",
  "evidence-ledger",
  "reviewable-evidence",
  "skill-pack",
  "brainstorm",
  "acceptance-discovery",
  "acceptance-quality-audit",
  "capability-profile",
  "profile-check",
  "archive",
  "bootstrap",
  "report",
  "doctor",
  "upgrade",
  "context-export",
  "architecture-baseline",
  "architecture-challenge",
  "architecture-agent-surface",
  "architecture-profile",
  "build-vs-buy"
];
function sameStringSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size !== rightSet.size) return false;
  return [...leftSet].every((item) => rightSet.has(item));
}

export function applyUpgradeActions(actions) {
  for (const action of actions) {
    if (isWritingUpgradeAction(action.action) && action.write) action.write();
  }
}

function skillPackPath(root, skillName) {
  return path.join(root, ".agents", "skills", skillName, "SKILL.md");
}

function skillPackInstallActions(root, { dryRun = false, force = false, refresh = false } = {}) {
  const markdowns = skillPackMarkdowns();
  return SKILL_PACK.map((skill) => writeGeneratedFile(
    skillPackPath(root, skill.name),
    markdowns[skill.name],
    { dryRun, force, refresh, kind: "skill" }
  ));
}

export function upgradeActions(root, { requestedSkill = false, mergeAgentRoute = false } = {}) {
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

  const agentGuide = agentGuidePath(root);
  const agentGuideContent = renderAgentGuideMarkdown();
  if (fs.existsSync(agentGuide)) {
    const currentHash = fileHash(agentGuide);
    const expectedHash = createHash("sha256").update(agentGuideContent).digest("hex");
    actions.push({
      path: agentGuide,
      action: currentHash === expectedHash ? "current" : "overwrite",
      kind: "agent-guide",
      managed: true,
      write: () => {
        fs.mkdirSync(path.dirname(agentGuide), { recursive: true });
        fs.writeFileSync(agentGuide, agentGuideContent);
      }
    });
  } else {
    actions.push({
      path: agentGuide,
      action: "missing",
      kind: "agent-guide",
      managed: true
    });
  }

  if (mergeAgentRoute) {
    for (const [agentName, routePath] of [
      ["AGENTS", path.join(root, "AGENTS.md")],
      ["CLAUDE", path.join(root, "CLAUDE.md")]
    ]) {
      const routeContent = renderAgentRouteMarkdown(agentName);
      const routeSection = renderAgentRouteSectionMarkdown();
      if (!fs.existsSync(routePath)) {
        actions.push({
          path: routePath,
          action: "missing",
          kind: "agent-route",
          managed: true
        });
        continue;
      }
      const current = fs.readFileSync(routePath, "utf8");
      const bounds = managedSectionBounds(current, AGENT_ROUTE_START, AGENT_ROUTE_END);
      const alreadyReferences = current.includes(".opennori/architecture/baseline.md");
      const merged = bounds || !alreadyReferences
        ? upsertManagedSection(current, routeSection, AGENT_ROUTE_START, AGENT_ROUTE_END)
        : current;
      actions.push({
        path: routePath,
        action: merged === current ? "current" : "merge",
        kind: "agent-route",
        managed: true,
        write: () => {
          if (!fs.existsSync(routePath)) {
            fs.mkdirSync(path.dirname(routePath), { recursive: true });
            fs.writeFileSync(routePath, routeContent);
            return;
          }
          fs.writeFileSync(routePath, upsertManagedSection(fs.readFileSync(routePath, "utf8"), routeSection, AGENT_ROUTE_START, AGENT_ROUTE_END));
        }
      });
    }
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
  const refreshesManagedAssets = actions.some((action) => action.kind !== "manifest" && isWritingUpgradeAction(action.action));
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

function managedSectionBounds(content, startMarker, endMarker) {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) return null;
  return { start, end: end + endMarker.length };
}

function upsertManagedSection(content, section, startMarker, endMarker) {
  const normalizedSection = section.endsWith("\n") ? section : `${section}\n`;
  const bounds = managedSectionBounds(content, startMarker, endMarker);
  if (bounds) {
    return `${content.slice(0, bounds.start)}${normalizedSection}${content.slice(bounds.end).replace(/^\n/, "")}`;
  }
  const trimmed = content.trimEnd();
  return `${trimmed}${trimmed ? "\n\n" : ""}${normalizedSection}`;
}

function writeAgentRoute(filePath, content, section, { dryRun = false, force = false, merge = false, kind = "agent-route", managed = true } = {}) {
  if (!merge) return writeIfSafe(filePath, content, { dryRun, force, kind, managed });
  const exists = fs.existsSync(filePath);
  if (!exists) {
    if (!dryRun) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);
    }
    return { path: filePath, action: "create", kind, managed };
  }
  const current = fs.readFileSync(filePath, "utf8");
  const bounds = managedSectionBounds(current, AGENT_ROUTE_START, AGENT_ROUTE_END);
  if (!bounds && current.includes(".opennori/architecture/baseline.md")) {
    return {
      path: filePath,
      action: "exists",
      kind,
      managed,
      reason: "Existing project agent route already references the OpenNori Architecture Baseline."
    };
  }
  const next = upsertManagedSection(current, section, AGENT_ROUTE_START, AGENT_ROUTE_END);
  const action = next === current ? "exists" : "merge";
  if (!dryRun && action === "merge") {
    fs.writeFileSync(filePath, next);
  }
  return {
    path: filePath,
    action,
    kind,
    managed,
    reason: action === "exists"
      ? "Existing project agent route already references the OpenNori Architecture Baseline."
      : undefined
  };
}

function writeGeneratedFile(filePath, content, { dryRun = false, force = false, refresh = false, kind = "file", managed = true } = {}) {
  const exists = fs.existsSync(filePath);
  if (!exists || force) return writeIfSafe(filePath, content, { dryRun, force, kind, managed });
  const currentHash = fileHash(filePath);
  const expectedHash = createHash("sha256").update(content).digest("hex");
  const action = currentHash === expectedHash ? "exists" : (refresh ? "update" : "skip");
  if (!dryRun && action === "update") {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  return {
    path: filePath,
    action,
    kind,
    managed,
    reason: action === "update"
      ? `Existing OpenNori ${kind} will be refreshed without requiring --force.`
      : undefined
  };
}

function ensureDir(dirPath, { dryRun = false, kind = "directory", managed = true } = {}) {
  const exists = fs.existsSync(dirPath);
  if (!dryRun && !exists) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return { path: dirPath, action: exists ? "exists" : "create", kind, managed };
}

function protocolTemplate() {
  const source = packagePath(".opennori", "protocol.md");
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
    { path: ".opennori/agent-guide.md", kind: "agent-guide", required: true },
    { path: "AGENTS.md", kind: "agent-route", required: false },
    { path: "CLAUDE.md", kind: "agent-route", required: false },
    ...REQUIRED_NORI_DIRS.map((dir) => ({ path: `.opennori/${dir}`, kind: "directory", required: true })),
    { path: ".opennori/architecture", kind: "directory", required: true },
    ...REQUIRED_ARCHITECTURE_DIRS.map((dir) => ({ path: `.opennori/architecture/${dir}`, kind: "directory", required: true })),
    { path: ".opennori/architecture/baseline.json", kind: "architecture-baseline", required: false },
    { path: ".opennori/architecture/baseline.md", kind: "architecture-baseline", required: false }
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

export function safeReadManifest(root) {
  try {
    return readJson(manifestPath(root));
  } catch {
    return null;
  }
}

export function buildManifest(root, options = {}) {
  const existing = safeReadManifest(root);
  const skill = projectSkillState(root);
  const skillPack = projectSkillPackState(root);
  const activeGoals = activeGoalSummaries(root);
  const architectureGoalId = activeGoals.length === 1 ? activeGoals[0].goal_id : undefined;
  const architecture = architectureState(root, architectureGoalId);
  const now = new Date().toISOString();
  return {
    schema_version: MANIFEST_SCHEMA_VERSION,
    protocol_version: PROTOCOL_VERSION,
    opennori_version: PACKAGE_JSON.version,
    created_at: existing?.created_at || now,
    updated_at: now,
    capabilities: NORI_CAPABILITIES,
    managed_files: managedFiles(root, skill, options),
    active_goals: activeGoals,
    skill,
    skill_pack: skillPack,
    architecture
  };
}

export function writeManifest(root, { dryRun = false } = {}) {
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
      const schemaResult = validateSchema("evidence-payload", payload);
      const validationIssues = validateContract(payload.contract, payload.ledger);
      details.push({
        goal_id: goalId,
        status: payload.ledger?.status || "unknown",
        current_gap: currentGap(payload.contract, payload.ledger),
        acceptance_path: relativeTo(root, acceptancePath),
        evidence_path: relativeTo(root, evidencePath),
        recoverable: schemaResult.valid && validationIssues.length === 0,
        schema_valid: schemaResult.valid
      });
      for (const error of schemaResult.errors) {
        issues.push({ goal_id: goalId, message: error.message, path: `schema${error.path}` });
      }
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

export function doctor(root) {
  const checks = [];
  const noriDir = path.join(root, ".opennori");
  const protocolPath = path.join(root, ".opennori", "protocol.md");
  const manifestFile = manifestPath(root);
  const active = inspectActiveGoals(root);
  const architecture = architectureState(root, active.details[0]?.goal_id);

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

  const architectureRoot = architectureDir(root);
  checks.push(doctorCheck(
    "dir_architecture",
    fs.existsSync(architectureRoot),
    fs.existsSync(architectureRoot) ? ".opennori/architecture exists." : ".opennori/architecture is missing.",
    "Run opennori bootstrap --root <project> --json."
  ));
  for (const dir of REQUIRED_ARCHITECTURE_DIRS) {
    const dirPath = path.join(architectureRoot, dir);
    checks.push(doctorCheck(
      `dir_architecture_${dir}`,
      fs.existsSync(dirPath),
      fs.existsSync(dirPath) ? `.opennori/architecture/${dir} exists.` : `.opennori/architecture/${dir} is missing.`,
      "Run opennori bootstrap --root <project> --json."
    ));
  }

  checks.push(doctorCheck(
    "protocol_file",
    fs.existsSync(protocolPath),
    fs.existsSync(protocolPath) ? ".opennori/protocol.md exists." : ".opennori/protocol.md is missing.",
    "Run opennori bootstrap --root <project> --json."
  ));
  const guideState = architecture.agent_surface.guide;
  checks.push(doctorCheck(
    "architecture_agent_guide",
    guideState.installed && guideState.in_sync,
    guideState.installed
      ? (guideState.in_sync ? ".opennori/agent-guide.md is installed and in sync." : ".opennori/agent-guide.md is stale.")
      : ".opennori/agent-guide.md is missing.",
    "Run opennori bootstrap --root <project> --json, or preview opennori install --root <project> --merge-agent-route --dry-run --json before confirming a refresh."
  ));
  checks.push(doctorCheck(
    "architecture_agent_surface",
    architecture.agent_surface.agents.references_baseline || architecture.agent_surface.claude.references_baseline,
    architecture.agent_surface.agents.references_baseline || architecture.agent_surface.claude.references_baseline
      ? "At least one project agent route references the Architecture Baseline."
      : "No AGENTS.md or CLAUDE.md route references .opennori/architecture/baseline.md.",
    "Preview opennori install --root <project> --merge-agent-route --dry-run --json, then confirm if the non-destructive merge is acceptable."
  ));
  const baselineRequired = active.details.length > 0;
  checks.push(doctorCheck(
    "architecture_baseline",
    !baselineRequired || architecture.decision === "valid" || architecture.decision === "challenged",
    !baselineRequired
      ? "No active goal requires an Architecture Baseline yet."
      : architecture.baseline
        ? `Architecture Baseline decision is ${architecture.decision}.`
        : "Active goal has no Architecture Baseline.",
    "Run opennori architecture baseline --root <project> --goal <goal> --confirm --json before implementation, or resolve open architecture issues.",
    architecture.decision === "invalid" ? "broken" : "needs-action"
  ));
  checks.push(doctorCheck(
    "build_vs_buy_health",
    architecture.build_vs_buy.status === "clear",
    architecture.build_vs_buy.summary,
    "Run opennori architecture build-vs-buy with current project, standard library, official SDK, open-source candidates, and self-build reason where needed.",
    architecture.build_vs_buy.status === "broken" ? "broken" : "needs-action"
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
    const manifestSchema = validateSchema("manifest", manifest);
    checks.push(doctorCheck(
      "manifest_schema",
      manifestSchema.valid,
      manifestSchema.valid
        ? ".opennori/manifest.json matches the public manifest schema."
        : `.opennori/manifest.json does not match the public manifest schema: ${schemaErrorSummary(manifestSchema)}.`,
      "Refresh the manifest with opennori bootstrap --root <project> --json.",
      "broken"
    ));
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
    "Preview opennori install --root <project> --skill --refresh-skill --dry-run --json, then rerun with --confirm if the updates are acceptable."
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
    "Preview opennori install --root <project> --skill --refresh-skill --dry-run --json, then rerun with --confirm if the updates are acceptable."
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
    skill_pack: skillPack,
    architecture
  };
}

export function refreshManifest(root) {
  if (fs.existsSync(path.join(root, ".opennori"))) {
    writeManifest(root);
  }
}

export function installActions(root, { dryRun = false, force = false, requestedSkill = false, refreshSkill = false, mergeAgentRoute = false } = {}) {
  const agentRouteSection = renderAgentRouteSectionMarkdown();
  const actions = [
    ensureDir(path.join(root, ".opennori", "active"), { dryRun }),
    ensureDir(path.join(root, ".opennori", "completed"), { dryRun }),
    ensureDir(path.join(root, ".opennori", "blocked"), { dryRun }),
    ensureDir(path.join(root, ".opennori", "reports"), { dryRun }),
    ensureDir(path.join(root, ".opennori", "brainstorms"), { dryRun }),
    ensureDir(path.join(root, ".opennori", "architecture"), { dryRun }),
    ensureDir(path.join(root, ".opennori", "architecture", "profiles"), { dryRun }),
    ensureDir(path.join(root, ".opennori", "architecture", "challenges"), { dryRun }),
    ensureDir(path.join(root, ".opennori", "architecture", "decisions"), { dryRun }),
    ensureDir(path.join(root, ".opennori", "architecture", "evidence"), { dryRun }),
    writeIfSafe(path.join(root, ".opennori", "protocol.md"), protocolTemplate(), { dryRun, force, kind: "protocol" }),
    writeIfSafe(agentGuidePath(root), renderAgentGuideMarkdown(), { dryRun, force, kind: "agent-guide" }),
    writeAgentRoute(path.join(root, "AGENTS.md"), renderAgentRouteMarkdown("AGENTS"), agentRouteSection, { dryRun, force, merge: mergeAgentRoute, kind: "agent-route", managed: true }),
    writeAgentRoute(path.join(root, "CLAUDE.md"), renderAgentRouteMarkdown("CLAUDE"), agentRouteSection, { dryRun, force, merge: mergeAgentRoute, kind: "agent-route", managed: true })
  ];

  if (requestedSkill) {
    actions.push(...skillPackInstallActions(root, { dryRun, force, refresh: refreshSkill }));
  }
  actions.push(writeManifest(root, { dryRun }));
  return actions;
}

export function bootstrap(root, { confirmed = false } = {}) {
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
    requestedSkill: true,
    refreshSkill: true,
    mergeAgentRoute: true
  });
  const installPlan = buildInstallPlan(root, actions, {
    dryRun: needsConfirm,
    force: false,
    requestedSkill: true,
    refreshSkill: true,
    mergeAgentRoute: true
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
