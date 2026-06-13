import fs from "node:fs";
import path from "node:path";
import {
  currentGap,
  readJson,
  validateContract
} from "../../core.ts";
import { validateSchema } from "../../validation.ts";
import { relativeTo } from "../shared.ts";
import type {
  ActiveGoalSummary,
  DoctorIssue,
  NoriEvidencePayload
} from "../../types.ts";
import { errorMessage } from "./shared.ts";

export type ActiveGoalInspection = {
  details: ActiveGoalSummary[];
  issues: DoctorIssue[];
};

export function inspectActiveGoals(root: string): ActiveGoalInspection {
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
