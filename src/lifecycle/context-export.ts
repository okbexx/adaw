import fs from "node:fs";
import {
  completionAnswer,
  criterionStatusRows,
  currentGap,
  evidenceHealth,
  intervention,
  nextRecommendation,
  pathsForGoal,
  profileCompliance,
  readJson
} from "../core.ts";
import { architectureState } from "../architecture.ts";
import { safeReadManifest } from "./manifest.ts";
import { manifestPath, relativeTo } from "./shared.ts";
import type { ContextExport, NoriEvidencePayload } from "../types.ts";

export function buildContextExport(root: string, pair: { acceptancePath: string; evidencePath: string }): ContextExport {
  const payload = readJson<NoriEvidencePayload>(pair.evidencePath);
  const contract = payload.contract;
  const ledger = payload.ledger;
  const reportPath = pathsForGoal(root, contract.goal_id).reportPath;
  const recommendation = nextRecommendation(contract, ledger);
  const architecture = architectureState(root, contract.goal_id);
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
    evidence_health: evidenceHealth(contract, ledger),
    next_recommendation: recommendation,
    criteria: criterionStatusRows(contract, ledger),
    capability_profile: ledger.capability_profile || { items: [], evidence: [] },
    capability_compliance: profileCompliance(ledger),
    architecture,
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
