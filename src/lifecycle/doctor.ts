import fs from "node:fs";
import path from "node:path";
import {
  REQUIRED_ARCHITECTURE_DIRS,
  architectureDir,
  architectureState
} from "../architecture.ts";
import {
  PROTOCOL_VERSION,
  currentGap,
  readJson,
  validateContract
} from "../core.ts";
import { schemaErrorSummary, validateSchema } from "../validation.ts";
import {
  MANIFEST_SCHEMA_VERSION,
  NORI_CAPABILITIES,
  PACKAGE_JSON,
  REQUIRED_NORI_DIRS,
  manifestPath,
  relativeTo,
  sameStringSet
} from "./shared.ts";
import { projectSkillPackState, projectSkillState } from "./manifest.ts";
import type {
  ActiveGoalSummary,
  DoctorCheck,
  DoctorIssue,
  DoctorRecoveryAction,
  DoctorState,
  Manifest,
  NoriEvidencePayload
} from "../types.ts";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function inspectActiveGoals(root: string): { details: ActiveGoalSummary[]; issues: DoctorIssue[] } {
  const activeDir = path.join(root, ".opennori", "active");
  const details: ActiveGoalSummary[] = [];
  const issues: DoctorIssue[] = [];
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
      const payload = readJson<NoriEvidencePayload>(evidencePath);
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
      issues.push({ goal_id: goalId, message: errorMessage(error) });
    }
  }

  return { details, issues };
}

function doctorCheck(name: string, condition: boolean, summary: string, recovery?: string, severity = "needs-action"): DoctorCheck {
  const check: DoctorCheck = { name, ok: Boolean(condition), summary };
  if (!condition && recovery) check.recovery = recovery;
  if (!condition) check.severity = severity;
  return check;
}

function doctorRecoveryActions(checks: DoctorCheck[], activeIssues: DoctorIssue[] = []): DoctorRecoveryAction[] {
  const actions: DoctorRecoveryAction[] = checks
    .filter((check) => !check.ok && check.recovery)
    .map((check) => ({
      check: check.name,
      severity: check.severity || "needs-action",
      action: check.recovery || "Inspect this OpenNori doctor check and rerun opennori doctor after recovery."
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

export function doctor(root: string): DoctorState {
  const checks: DoctorCheck[] = [];
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

  let manifest: Manifest | null = null;
  let manifestReadable = false;
  try {
    manifest = readJson<Manifest>(manifestFile);
    manifestReadable = true;
  } catch (error) {
    checks.push(doctorCheck(
      "manifest_file",
      false,
      fs.existsSync(manifestFile) ? `.opennori/manifest.json is unreadable: ${errorMessage(error)}` : ".opennori/manifest.json is missing.",
      "Run opennori bootstrap --root <project> --json to preview setup or refresh the OpenNori manifest.",
      fs.existsSync(manifestFile) ? "broken" : "needs-action"
    ));
  }

  if (manifestReadable) {
    const readableManifest = manifest as Manifest;
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
      readableManifest.schema_version === MANIFEST_SCHEMA_VERSION,
      `.opennori/manifest.json uses schema ${readableManifest.schema_version || "<missing>"}.`,
      "Refresh the manifest with opennori bootstrap --root <project> --json.",
      "broken"
    ));
    checks.push(doctorCheck(
      "manifest_protocol",
      readableManifest.protocol_version === PROTOCOL_VERSION,
      `.opennori/manifest.json records protocol ${readableManifest.protocol_version || "<missing>"}.`,
      "Refresh the manifest with opennori bootstrap --root <project> --json.",
      "broken"
    ));
    checks.push(doctorCheck(
      "manifest_cli_version",
      readableManifest.opennori_version === PACKAGE_JSON.version,
      `.opennori/manifest.json records OpenNori version ${readableManifest.opennori_version || "<missing>"}.`,
      "Refresh the manifest with opennori bootstrap --root <project> --json."
    ));
    checks.push(doctorCheck(
      "manifest_capabilities",
      sameStringSet(readableManifest.capabilities, NORI_CAPABILITIES),
      Array.isArray(readableManifest.capabilities) ? "Manifest protocol capabilities are readable." : "Manifest protocol capabilities are missing.",
      "Refresh the manifest with opennori bootstrap --root <project> --json."
    ));

    const currentGoals = new Set(active.details.filter((goal) => goal.recoverable).map((goal) => goal.goal_id));
    const manifestGoals = new Set((readableManifest.active_goals || []).map((goal) => goal.goal_id));
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

    const missingManaged = (readableManifest.managed_files || [])
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
    const readableManifest = manifest as Manifest;
    checks.push(doctorCheck(
      "manifest_skill_state",
      Boolean(readableManifest.skill) && readableManifest.skill.installed === skill.installed && readableManifest.skill.path === skill.path,
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
