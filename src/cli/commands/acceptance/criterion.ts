import { defineCommand } from "citty";
import {
  currentGap,
  ok,
  recomputeWorkflowStatus,
  syncAcceptanceMarkdown,
  validateContract,
  writeJson
} from "../../../core.ts";
import { refreshManifest } from "../../../lifecycle.ts";
import { activeGoalArgs, type ActiveGoalRuntime, runJsonCommand } from "../../runtime.ts";
import type { AcceptanceCriterion } from "../../../types.ts";
import { jsonArg, rootArg } from "./shared.ts";

export const criterionUpdateCommand = defineCommand({
  meta: {
    name: "criterion-update",
    description: "Update a user acceptance criterion and clear stale evidence when the criterion changes."
  },
  args: {
    ...activeGoalArgs,
    criterion: {
      type: "string",
      description: "Criterion id to update."
    },
    userStory: {
      type: "string",
      description: "Updated human-facing user story."
    },
    measurement: {
      type: "string",
      description: "Updated measurement."
    },
    threshold: {
      type: "string",
      description: "Updated passing threshold."
    },
    risk: {
      type: "string",
      description: "Updated risk level."
    },
    summary: {
      type: "string",
      description: "Human revision summary."
    },
    json: jsonArg
  },
  run({ args, data }) {
    const { contract, ledger, acceptancePath, evidencePath, root } = data.loadPair(args);
    const criterionId = args.criterion;
    if (!criterionId) throw new Error("--criterion is required");
    const criterion = contract.criteria.find((item: AcceptanceCriterion) => item.id === criterionId);
    if (!criterion) throw new Error(`Criterion not found: ${criterionId}`);

    const before = {
      user_story: criterion.user_story,
      measurement: criterion.measurement,
      threshold: criterion.threshold,
      risk: criterion.risk
    };
    criterion.user_story = args.userStory || criterion.user_story;
    criterion.measurement = args.measurement || criterion.measurement;
    criterion.threshold = args.threshold || criterion.threshold;
    criterion.risk = args.risk || criterion.risk;
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
      summary: args.summary || `User revised ${criterionId}.`,
      approved_at: new Date().toISOString()
    };
    const issues = validateContract(contract, ledger);
    if (issues.length > 0) {
      return {
        ok: false,
        error: {
          type: "invalid_acceptance",
          message: "Updated criterion failed validation",
          fix: "Rewrite the criterion from the user's perspective"
        },
        issues
      };
    }

    recomputeWorkflowStatus(contract, ledger);
    writeJson(evidencePath, { contract, ledger });
    syncAcceptanceMarkdown(acceptancePath, contract, ledger);
    refreshManifest(root);
    return ok({
      goal_id: contract.goal_id,
      criterion,
      acceptance_basis: contract.acceptance_basis,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger)
    });
  }
});

export async function runCriterionUpdateCommand(rawArgs: string[], { loadPair }: ActiveGoalRuntime) {
  return runJsonCommand(criterionUpdateCommand, rawArgs, { loadPair });
}
