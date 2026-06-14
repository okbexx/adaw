import { defineCommand } from "citty";
import {
  criterionStatusRows,
  currentGap,
  ok,
  pruneCriterionEvidence,
  syncAcceptanceMarkdown,
  writeJson
} from "../../../core.ts";
import { refreshManifest } from "../../../lifecycle.ts";
import { activeGoalArgs, type ActiveGoalRuntime, runJsonCommand } from "../../runtime.ts";

export const evidencePruneCommand = defineCommand({
  meta: {
    name: "prune",
    description: "Remove invalid or obsolete evidence from an OpenNori acceptance criterion."
  },
  args: {
    ...activeGoalArgs,
    criterion: {
      type: "string",
      description: "Criterion id whose evidence is no longer valid."
    },
    reason: {
      type: "string",
      description: "Why this evidence should no longer count."
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ args, data }) {
    const { contract, ledger, acceptancePath, evidencePath, root, evidencePrune } = data.loadPair(args);
    if (!args.criterion) {
      return ok({
        goal_id: contract.goal_id,
        evidence_prune: evidencePrune || { changed: false, removed_records: 0, removed_sources: 0 },
        workflow_status: ledger.status,
        current_gap: currentGap(contract, ledger)
      });
    }

    const criterionId = String(args.criterion);
    const reason = String(args.reason || "Evidence no longer proves the current acceptance criterion.");
    const prune = pruneCriterionEvidence(contract, ledger, criterionId, { reason });
    writeJson(evidencePath, { contract, ledger });
    syncAcceptanceMarkdown(acceptancePath, contract, ledger);
    refreshManifest(root);

    return ok({
      goal_id: contract.goal_id,
      criterion: criterionId,
      evidence_prune: prune,
      criterion_status: ledger.criteria[criterionId]?.status || "unknown",
      confidence: ledger.criteria[criterionId]?.confidence || "none",
      latest_evidence: criterionStatusRows(contract, ledger, { root }).find((row) => row.id === criterionId)?.latest_evidence || null,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger)
    });
  }
});

export async function runEvidencePruneCommand(rawArgs: string[], { loadPair }: ActiveGoalRuntime) {
  return runJsonCommand(evidencePruneCommand, rawArgs, { loadPair, rawArgs });
}
