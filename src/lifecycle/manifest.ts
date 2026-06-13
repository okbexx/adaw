import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { REQUIRED_ARCHITECTURE_DIRS, architectureState } from "../architecture.ts";
import {
  PROTOCOL_VERSION,
  currentGap,
  findActivePairs,
  readJson,
  writeJson
} from "../core.ts";
import { SKILL_PACK, exportedSkillMarkdown, skillPackMarkdowns } from "../skills.ts";
import { fileHash } from "./managed-files.ts";
import type {
  ActiveGoalSummary,
  Manifest,
  ManifestManagedFile,
  ManifestWriteAction,
  NoriEvidencePayload,
  ProjectSkillPackState,
  ProjectSkillState
} from "../types.ts";
import {
  MANIFEST_SCHEMA_VERSION,
  NORI_CAPABILITIES,
  PACKAGE_JSON,
  REQUIRED_NORI_DIRS,
  manifestPath,
  relativeTo,
  skillPackPath
} from "./shared.ts";

export function projectSkillState(root: string): ProjectSkillState {
  const noriSkillPath = skillPackPath(root, "nori");
  const exists = fs.existsSync(noriSkillPath);
  const expectedHash = createHash("sha256").update(exportedSkillMarkdown()).digest("hex");
  const actualHash = fileHash(noriSkillPath);
  return {
    installed: exists,
    path: relativeTo(root, noriSkillPath),
    in_sync: exists ? actualHash === expectedHash : false,
    expected_sha256: expectedHash,
    actual_sha256: actualHash
  };
}

export function projectSkillPackState(root: string): ProjectSkillPackState {
  const markdowns = skillPackMarkdowns();
  const skills = SKILL_PACK.map((skill) => {
    const noriSkillPath = skillPackPath(root, skill.name);
    const exists = fs.existsSync(noriSkillPath);
    const expectedHash = createHash("sha256").update(markdowns[skill.name] || "").digest("hex");
    const actualHash = fileHash(noriSkillPath);
    return {
      name: skill.name,
      path: relativeTo(root, noriSkillPath),
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

function activeGoalSummaries(root: string): ActiveGoalSummary[] {
  return findActivePairs(root).map((pair) => {
    try {
      const payload = readJson<NoriEvidencePayload>(pair.evidencePath);
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
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
}

export function managedFiles(root: string, skill = projectSkillState(root), { assumeManifestExists = false } = {}): ManifestManagedFile[] {
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

export function safeReadManifest(root: string): Manifest | null {
  try {
    return readJson<Manifest>(manifestPath(root));
  } catch {
    return null;
  }
}

export function buildManifest(root: string, options: { assumeManifestExists?: boolean } = {}): Manifest {
  const existing = safeReadManifest(root);
  const skill = projectSkillState(root);
  const skillPack = projectSkillPackState(root);
  const activeGoals = activeGoalSummaries(root);
  const architectureGoalId = activeGoals.length === 1 ? activeGoals[0]?.goal_id : undefined;
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

export function writeManifest(root: string, { dryRun = false } = {}): ManifestWriteAction {
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

export function refreshManifest(root: string): void {
  if (fs.existsSync(path.join(root, ".opennori"))) {
    writeManifest(root);
  }
}
