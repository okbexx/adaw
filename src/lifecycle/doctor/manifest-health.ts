import fs from "node:fs";
import path from "node:path";
import {
  PROTOCOL_VERSION,
  readJson
} from "../../core.ts";
import { schemaErrorSummary, validateSchema } from "../../validation.ts";
import {
  MANIFEST_SCHEMA_VERSION,
  NORI_CAPABILITIES,
  PACKAGE_JSON,
  manifestPath,
  sameStringSet
} from "../shared.ts";
import type {
  ActiveGoalSummary,
  DoctorCheck,
  Manifest
} from "../../types.ts";
import { doctorCheck, errorMessage } from "./shared.ts";

export type ManifestInspection = {
  manifest: Manifest | null;
  manifestReadable: boolean;
  manifestFile: string;
  checks: DoctorCheck[];
};

export function inspectManifestHealth(root: string, activeGoals: ActiveGoalSummary[]): ManifestInspection {
  const checks: DoctorCheck[] = [];
  const manifestFile = manifestPath(root);
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
      "Run opennori init --root <project> --json to preview project initialization, or npx opennori setup to install the full capability bundle.",
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
      "Refresh the manifest with opennori init --root <project> --confirm --json.",
      "broken"
    ));
    checks.push(doctorCheck(
      "manifest_file",
      readableManifest.schema_version === MANIFEST_SCHEMA_VERSION,
      `.opennori/manifest.json uses schema ${readableManifest.schema_version || "<missing>"}.`,
      "Refresh the manifest with opennori init --root <project> --confirm --json.",
      "broken"
    ));
    checks.push(doctorCheck(
      "manifest_protocol",
      readableManifest.protocol_version === PROTOCOL_VERSION,
      `.opennori/manifest.json records protocol ${readableManifest.protocol_version || "<missing>"}.`,
      "Refresh the manifest with opennori init --root <project> --confirm --json.",
      "broken"
    ));
    checks.push(doctorCheck(
      "manifest_cli_version",
      readableManifest.opennori_version === PACKAGE_JSON.version,
      `.opennori/manifest.json records OpenNori version ${readableManifest.opennori_version || "<missing>"}.`,
      "Refresh the manifest with opennori init --root <project> --confirm --json."
    ));
    checks.push(doctorCheck(
      "manifest_capabilities",
      sameStringSet(readableManifest.capabilities, NORI_CAPABILITIES),
      Array.isArray(readableManifest.capabilities) ? "Manifest protocol capabilities are readable." : "Manifest protocol capabilities are missing.",
      "Refresh the manifest with opennori init --root <project> --confirm --json."
    ));

    const currentGoals = new Set(activeGoals.filter((goal) => goal.recoverable).map((goal) => goal.goal_id));
    const manifestGoals = new Set((readableManifest.active_goals || []).map((goal) => goal.goal_id));
    const staleGoals = [
      ...[...currentGoals].filter((goalId) => !manifestGoals.has(goalId)),
      ...[...manifestGoals].filter((goalId) => !currentGoals.has(goalId))
    ];
    checks.push(doctorCheck(
      "manifest_active_goals",
      staleGoals.length === 0,
      staleGoals.length === 0 ? "Manifest active goals match recoverable active goals." : `Manifest active goals differ: ${staleGoals.join(", ")}.`,
      "Run any OpenNori state-changing command, or run opennori init --root <project> --confirm --json, to refresh the manifest."
    ));

    const missingManaged = (readableManifest.managed_files || [])
      .filter((entry) => entry.required !== false)
      .filter((entry) => !fs.existsSync(path.join(root, entry.path)))
      .map((entry) => entry.path);
    checks.push(doctorCheck(
      "managed_files",
      missingManaged.length === 0,
      missingManaged.length === 0 ? "Required OpenNori managed files are present." : `Missing managed files: ${missingManaged.join(", ")}.`,
      "Run opennori init --root <project> --json to preview project initialization, or npx opennori setup to install the full capability bundle."
    ));
  }

  return {
    manifest,
    manifestReadable,
    manifestFile,
    checks
  };
}
