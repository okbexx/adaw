import { defineCommand } from "citty";
import {
  currentGap,
  inferCriterionLayer,
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

export const criterionAddCommand = defineCommand({
  meta: {
    name: "criterion-add",
    description: "Add a user acceptance criterion to an active OpenNori contract."
  },
  args: {
    ...activeGoalArgs,
    id: {
      type: "string",
      description: "New criterion id."
    },
    userStory: {
      type: "string",
      description: "Human-facing user story."
    },
    measurement: {
      type: "string",
      description: "How the user or reviewer measures this criterion."
    },
    threshold: {
      type: "string",
      description: "Passing threshold."
    },
    risk: {
      type: "string",
      description: "Risk level.",
      default: "medium"
    },
    required: {
      type: "boolean",
      description: "Whether this criterion is required.",
      default: true
    },
    summary: {
      type: "string",
      description: "Human revision summary."
    },
    json: jsonArg
  },
  run({ args, data }) {
    const { contract, ledger, acceptancePath, evidencePath, root } = data.loadPair(args);
    const criterionId = String(args.id || "").trim();
    if (!criterionId) throw new Error("--id is required");
    if (contract.criteria.some((item: AcceptanceCriterion) => item.id === criterionId)) {
      throw new Error(`Criterion already exists: ${criterionId}`);
    }

    const criterion: AcceptanceCriterion = {
      id: criterionId,
      layer: inferCriterionLayer(criterionId),
      user_story: String(args.userStory || "").trim(),
      measurement: String(args.measurement || "").trim(),
      threshold: String(args.threshold || "").trim(),
      required: args.required !== false,
      risk: String(args.risk || "medium")
    };
    contract.criteria.push(criterion);
    ledger.criteria[criterionId] = {
      status: "unknown",
      confidence: "none",
      required: criterion.required !== false,
      risk: criterion.risk || "medium",
      evidence: []
    };
    contract.acceptance_basis = {
      status: "approved",
      summary: args.summary || `User added ${criterionId}.`,
      approved_at: new Date().toISOString()
    };

    const issues = validateContract(contract, ledger);
    if (issues.length > 0) {
      contract.criteria = contract.criteria.filter((item: AcceptanceCriterion) => item.id !== criterionId);
      delete ledger.criteria[criterionId];
      return {
        ok: false,
        error: {
          type: "invalid_acceptance",
          message: "New criterion failed validation",
          fix: "Provide id, user story, measurement, and threshold"
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

export async function runCriterionAddCommand(rawArgs: string[], { loadPair }: ActiveGoalRuntime) {
  return runJsonCommand(criterionAddCommand, rawArgs, { loadPair });
}
