import { defineCommand } from "citty";
import {
  addEvidence,
  criterionStatusRows,
  currentGap,
  ok,
  syncAcceptanceMarkdown,
  writeJson
} from "../../../core.ts";
import { refreshManifest } from "../../../lifecycle.ts";
import { type ActiveGoalRuntime, runJsonCommand } from "../../runtime.ts";
import type { EvidenceBasis, EvidenceInput } from "../../../types.ts";
import { evidenceResult, evidenceSourcesFromArgs } from "./source-parsing.ts";

export const evidenceAddCommand = defineCommand({
  meta: {
    name: "add",
    description: "Record reviewable evidence for an OpenNori acceptance criterion."
  },
  args: {
    root: {
      type: "string",
      description: "Project root.",
      default: process.cwd()
    },
    goal: {
      type: "string",
      description: "Active goal id to update."
    },
    criterion: {
      type: "string",
      description: "Criterion id."
    },
    kind: {
      type: "string",
      description: "Evidence kind.",
      default: "manual"
    },
    basis: {
      type: "string",
      description: "Evidence basis."
    },
    summary: {
      type: "string",
      description: "Human-readable evidence summary.",
      default: ""
    },
    result: {
      type: "string",
      description: "passing, failing, blocked, or waived.",
      default: "passing"
    },
    confidence: {
      type: "string",
      description: "Evidence confidence."
    },
    path: {
      type: "string",
      description: "Optional artifact path."
    },
    source: {
      type: "string",
      description: "Raw evidence source, repeatable."
    },
    sourceCommand: {
      type: "string",
      description: "Command source, repeatable."
    },
    sourcePath: {
      type: "string",
      description: "Artifact source path, repeatable."
    },
    sourceUrl: {
      type: "string",
      description: "URL source, repeatable."
    },
    reviewability: {
      type: "string",
      description: "How a user can review this evidence."
    },
    limitations: {
      type: "string",
      description: "Known evidence limitations."
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ args, data }) {
    const { contract, ledger, acceptancePath, evidencePath, root } = data.loadPair();
    const criterionId = args.criterion;
    if (!criterionId) throw new Error("--criterion is required");
    const sources = evidenceSourcesFromArgs(args, data.rawArgs || []);
    const evidence: EvidenceInput = {
      kind: args.kind || "manual",
      basis: args.basis as EvidenceBasis | undefined,
      summary: args.summary || "",
      result: evidenceResult(args.result),
      confidence: args.confidence,
      path: args.path,
      sources,
      reviewability: args.reviewability,
      limitations: args.limitations
    };
    if (!evidence.summary) throw new Error("--summary is required");
    addEvidence(contract, ledger, criterionId, evidence);
    writeJson(evidencePath, { contract, ledger });
    syncAcceptanceMarkdown(acceptancePath, contract, ledger);
    refreshManifest(root);
    return ok({
      goal_id: contract.goal_id,
      criterion: criterionId,
      criterion_status: ledger.criteria[criterionId].status,
      confidence: ledger.criteria[criterionId].confidence,
      latest_evidence: criterionStatusRows(contract, ledger).find((row) => row.id === criterionId)?.latest_evidence,
      gate: ledger.criteria[criterionId].evidence.at(-1)?.gate,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger)
    });
  }
});

export async function runEvidenceAddCommand(rawArgs: string[], { loadPair }: ActiveGoalRuntime) {
  return runJsonCommand(evidenceAddCommand, rawArgs, { loadPair, rawArgs });
}
