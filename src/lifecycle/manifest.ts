import fs from "node:fs";
import path from "node:path";
import { REQUIRED_ARCHITECTURE_DIRS, architectureState } from "../architecture.ts";
import {
  PROTOCOL_VERSION,
  currentGap,
  findActivePairs,
  readJson,
  writeJson
} from "../core.ts";
import { pluginState } from "../plugin.ts";
import type {
  ActiveGoalSummary,
  Manifest,
  ManifestManagedFile,
  ManifestWriteAction,
  NoriEvidencePayload
} from "../types.ts";
import {
  MANIFEST_SCHEMA_VERSION,
  NORI_CAPABILITIES,
  PACKAGE_JSON,
  REQUIRED_NORI_DIRS,
  manifestPath,
  relativeTo
} from "./shared.ts";

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

export function managedFiles(root: string, { assumeManifestExists = false } = {}): ManifestManagedFile[] {
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
    managed_files: managedFiles(root, options),
    active_goals: activeGoals,
    plugin: pluginState(),
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
