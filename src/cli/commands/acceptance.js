import { defineCommand } from "citty";
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
  validateContract,
  writeJson
} from "../../core.js";
import { architectureState } from "../../architecture.js";
import { refreshManifest } from "../../lifecycle.js";
import { runJsonCommand } from "../runtime.js";

export const nextCommand = defineCommand({
  meta: {
    name: "next",
    description: "Show the next OpenNori acceptance gap or loop recommendation."
  },
  args: {
    root: {
      type: "string",
      description: "Project root.",
      default: process.cwd()
    },
    goal: {
      type: "string",
      description: "Active goal id to inspect."
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ data }) {
    const { contract, ledger } = data.loadPair();
    const gap = currentGap(contract, ledger);
    const recommendation = nextRecommendation(contract, ledger);
    return ok({
      goal_id: contract.goal_id,
      current_gap: gap,
      complete: gap === null,
      next_recommendation: recommendation
    }, [], [], recommendation.actions);
  }
});

export async function runNextCommand(rawArgs, { loadPair }) {
  return runJsonCommand(nextCommand, rawArgs, { loadPair });
}

export const resumeCommand = defineCommand({
  meta: {
    name: "resume",
    description: "Resume the active OpenNori goal with completion state and next actions."
  },
  args: {
    root: {
      type: "string",
      description: "Project root.",
      default: process.cwd()
    },
    goal: {
      type: "string",
      description: "Active goal id to inspect."
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ data }) {
    const { contract, ledger, acceptancePath, evidencePath, root } = data.loadPair();
    const recommendation = nextRecommendation(contract, ledger);
    return ok({
      goal_id: contract.goal_id,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger),
      completion: completionAnswer(contract, ledger),
      intervention: intervention(contract, ledger),
      evidence_health: evidenceHealth(contract, ledger),
      architecture: architectureState(root, contract.goal_id),
      next_recommendation: recommendation,
      acceptance_path: acceptancePath,
      evidence_path: evidencePath
    }, [], [], recommendation.actions);
  }
});

export async function runResumeCommand(rawArgs, { loadPair }) {
  return runJsonCommand(resumeCommand, rawArgs, { loadPair });
}

export const statusCommand = defineCommand({
  meta: {
    name: "status",
    description: "Show the current OpenNori goal, acceptance status, evidence health, and completion decision."
  },
  args: {
    root: {
      type: "string",
      description: "Project root.",
      default: process.cwd()
    },
    goal: {
      type: "string",
      description: "Active goal id to inspect."
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ data }) {
    const { contract, ledger, root } = data.loadPair();
    const recommendation = nextRecommendation(contract, ledger);
    return ok({
      goal_id: contract.goal_id,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger),
      completion: completionAnswer(contract, ledger),
      intervention: intervention(contract, ledger),
      evidence_health: evidenceHealth(contract, ledger),
      architecture: architectureState(root, contract.goal_id),
      next_recommendation: recommendation,
      criteria: criterionStatusRows(contract, ledger)
    }, [], [], recommendation.actions);
  }
});

export async function runStatusCommand(rawArgs, { loadPair }) {
  return runJsonCommand(statusCommand, rawArgs, { loadPair });
}

export const evaluateCommand = defineCommand({
  meta: {
    name: "evaluate",
    description: "Recompute the current OpenNori workflow status from recorded acceptance evidence."
  },
  args: {
    root: {
      type: "string",
      description: "Project root.",
      default: process.cwd()
    },
    goal: {
      type: "string",
      description: "Active goal id to evaluate."
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ data }) {
    const { contract, ledger, acceptancePath, evidencePath, root } = data.loadPair();
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

export async function runEvaluateCommand(rawArgs, { loadPair }) {
  return runJsonCommand(evaluateCommand, rawArgs, { loadPair });
}

export const approveCommand = defineCommand({
  meta: {
    name: "approve",
    description: "Mark the current OpenNori acceptance criteria as user-approved."
  },
  args: {
    root: {
      type: "string",
      description: "Project root.",
      default: process.cwd()
    },
    goal: {
      type: "string",
      description: "Active goal id to approve."
    },
    summary: {
      type: "string",
      description: "Human approval summary.",
      default: "User approved acceptance criteria."
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ args, data }) {
    const { contract, ledger, acceptancePath, evidencePath, root } = data.loadPair();
    contract.acceptance_basis = {
      status: "approved",
      summary: args.summary || "User approved acceptance criteria.",
      approved_at: new Date().toISOString()
    };
    recomputeWorkflowStatus(contract, ledger);
    writeJson(evidencePath, { contract, ledger });
    syncAcceptanceMarkdown(acceptancePath, contract, ledger);
    refreshManifest(root);
    return ok({
      goal_id: contract.goal_id,
      acceptance_basis: contract.acceptance_basis,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger)
    });
  }
});

export async function runApproveCommand(rawArgs, { loadPair }) {
  return runJsonCommand(approveCommand, rawArgs, { loadPair });
}

export const criterionUpdateCommand = defineCommand({
  meta: {
    name: "criterion-update",
    description: "Update a user acceptance criterion and clear stale evidence when the criterion changes."
  },
  args: {
    root: {
      type: "string",
      description: "Project root.",
      default: process.cwd()
    },
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
    const criterion = contract.criteria.find((item) => item.id === criterionId);
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

export async function runCriterionUpdateCommand(rawArgs, { loadPair }) {
  return runJsonCommand(criterionUpdateCommand, rawArgs, { loadPair });
}
