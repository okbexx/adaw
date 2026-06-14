import { defineCommand } from "citty";
import { reviewAcceptanceQuality } from "../../../acceptance.ts";
import { architectureState } from "../../../architecture.ts";
import {
  completionAnswer,
  criterionStatusRows,
  currentGap,
  evidenceHealth,
  intervention,
  nextRecommendation,
  ok,
  recomputeWorkflowStatus,
  syncAcceptanceMarkdown,
  writeJson
} from "../../../core.ts";
import { refreshManifest } from "../../../lifecycle.ts";
import { activeGoalArgs, type ActiveGoalRuntime, runJsonCommand } from "../../runtime.ts";
import { jsonArg, rootArg } from "./shared.ts";

export const nextCommand = defineCommand({
  meta: {
    name: "next",
    description: "Show the next OpenNori acceptance gap or loop recommendation."
  },
  args: {
    ...activeGoalArgs,
    json: jsonArg
  },
  run({ args, data }) {
    const { contract, ledger, root } = data.loadPair(args);
    const gap = currentGap(contract, ledger);
    const recommendation = nextRecommendation(contract, ledger, { root });
    return ok({
      goal_id: contract.goal_id,
      current_gap: gap,
      complete: gap === null,
      next_recommendation: recommendation
    }, [], [], recommendation.actions);
  }
});

export async function runNextCommand(rawArgs: string[], { loadPair }: ActiveGoalRuntime) {
  return runJsonCommand(nextCommand, rawArgs, { loadPair });
}

export const resumeCommand = defineCommand({
  meta: {
    name: "resume",
    description: "Resume the active OpenNori goal with completion state and next actions."
  },
  args: {
    ...activeGoalArgs,
    json: jsonArg
  },
  run({ args, data }) {
    const { contract, ledger, acceptancePath, evidencePath, root } = data.loadPair(args);
    const architecture = architectureState(root, contract.goal_id);
    const recommendation = nextRecommendation(contract, ledger, { root, architecture });
    return ok({
      goal_id: contract.goal_id,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger),
      completion: completionAnswer(contract, ledger, { root, architecture }),
      intervention: intervention(contract, ledger),
      acceptance_review: reviewAcceptanceQuality(contract),
      evidence_health: evidenceHealth(contract, ledger, { root }),
      architecture,
      next_recommendation: recommendation,
      acceptance_path: acceptancePath,
      evidence_path: evidencePath
    }, [], [], recommendation.actions);
  }
});

export async function runResumeCommand(rawArgs: string[], { loadPair }: ActiveGoalRuntime) {
  return runJsonCommand(resumeCommand, rawArgs, { loadPair });
}

export const statusCommand = defineCommand({
  meta: {
    name: "status",
    description: "Show the current OpenNori goal, acceptance status, evidence health, and completion decision."
  },
  args: {
    ...activeGoalArgs,
    json: jsonArg
  },
  run({ args, data }) {
    const { contract, ledger, root } = data.loadPair(args);
    const architecture = architectureState(root, contract.goal_id);
    const recommendation = nextRecommendation(contract, ledger, { root, architecture });
    return ok({
      goal_id: contract.goal_id,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger),
      completion: completionAnswer(contract, ledger, { root, architecture }),
      intervention: intervention(contract, ledger),
      acceptance_review: reviewAcceptanceQuality(contract),
      evidence_health: evidenceHealth(contract, ledger, { root }),
      architecture,
      next_recommendation: recommendation,
      criteria: criterionStatusRows(contract, ledger, { root })
    }, [], [], recommendation.actions);
  }
});

export async function runStatusCommand(rawArgs: string[], { loadPair }: ActiveGoalRuntime) {
  return runJsonCommand(statusCommand, rawArgs, { loadPair });
}

export const evaluateCommand = defineCommand({
  meta: {
    name: "evaluate",
    description: "Recompute the current OpenNori workflow status from recorded acceptance evidence."
  },
  args: {
    ...activeGoalArgs,
    json: jsonArg
  },
  run({ args, data }) {
    const { contract, ledger, acceptancePath, evidencePath, root } = data.loadPair(args);
    recomputeWorkflowStatus(contract, ledger);
    writeJson(evidencePath, { contract, ledger });
    syncAcceptanceMarkdown(acceptancePath, contract, ledger);
    refreshManifest(root);
    return ok({
      goal_id: contract.goal_id,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger)
    });
  }
});

export async function runEvaluateCommand(rawArgs: string[], { loadPair }: ActiveGoalRuntime) {
  return runJsonCommand(evaluateCommand, rawArgs, { loadPair });
}
