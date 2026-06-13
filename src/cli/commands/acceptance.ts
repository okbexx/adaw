import { defineCommand } from "citty";
import fs from "node:fs";
import path from "node:path";
import { briefFromBrainstorm, briefFromGoal, buildBrainstorm, discoverAcceptance, renderBrainstormMarkdown, renderDiscoveryMarkdown } from "../../acceptance.js";
import {
  buildContractFromBrief,
  buildEvidenceLedger,
  completionAnswer,
  criterionStatusRows,
  currentGap,
  evidenceHealth,
  fail,
  intervention,
  nextRecommendation,
  ok,
  pathsForGoal,
  readJson,
  recomputeWorkflowStatus,
  renderAcceptanceMarkdown,
  syncAcceptanceMarkdown,
  validateContract,
  writeJson
} from "../../core.js";
import { architectureState } from "../../architecture.js";
import { refreshManifest } from "../../lifecycle.js";
import { type ActiveGoalRuntime, runJsonCommand } from "../runtime.ts";

type CliPayload = Record<string, any>;
type NoriPathPair = {
  jsonPath: string;
  markdownPath: string;
};

const buildBrainstormForCommand = buildBrainstorm as (idea: string, id?: string) => CliPayload;
const discoverAcceptanceForCommand = discoverAcceptance as (goal: string, id?: string) => CliPayload;
const briefFromBrainstormForCommand = briefFromBrainstorm as (brainstorm: CliPayload, candidateId: string) => CliPayload;
const briefFromGoalForCommand = briefFromGoal as (goal: string, goalId?: string) => CliPayload;
const validateContractForCommand = validateContract as unknown as (contract: CliPayload, ledger: CliPayload) => CliPayload[];

function brainstormPaths(root: string, brainstormId: string): NoriPathPair {
  const dir = path.join(root, ".opennori", "brainstorms");
  return {
    jsonPath: path.join(dir, `${brainstormId}.json`),
    markdownPath: path.join(dir, `${brainstormId}.md`)
  };
}

function discoveryPaths(root: string, discoveryId: string): NoriPathPair {
  const dir = path.join(root, ".opennori", "brainstorms");
  return {
    jsonPath: path.join(dir, `${discoveryId}.discovery.json`),
    markdownPath: path.join(dir, `${discoveryId}.discovery.md`)
  };
}

export const brainstormCommand = defineCommand({
  meta: {
    name: "brainstorm",
    description: "Create selectable acceptance directions from a natural language idea."
  },
  args: {
    root: {
      type: "string",
      description: "Project root.",
      default: process.cwd()
    },
    idea: {
      type: "string",
      description: "Natural language idea to explore."
    },
    id: {
      type: "string",
      description: "Optional stable brainstorm id."
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ args }) {
    const root = path.resolve(String(args.root || process.cwd()));
    const idea = String(args.idea || "").trim();
    if (!idea) throw new Error("--idea is required");
    const brainstorm = buildBrainstormForCommand(idea, args.id);
    const paths = brainstormPaths(root, brainstorm.id);
    writeJson(paths.jsonPath, brainstorm);
    fs.mkdirSync(path.dirname(paths.markdownPath), { recursive: true });
    fs.writeFileSync(paths.markdownPath, renderBrainstormMarkdown(brainstorm));
    refreshManifest(root);
    return ok(
      {
        brainstorm_id: brainstorm.id,
        status: brainstorm.status,
        idea: brainstorm.idea,
        candidates: brainstorm.candidates,
        brainstorm_path: paths.jsonPath,
        markdown_path: paths.markdownPath,
        is_acceptance_contract: false
      },
      [
        { kind: "brainstorm_source", path: paths.jsonPath },
        { kind: "brainstorm_markdown", path: paths.markdownPath }
      ],
      [],
      ["Ask the user to choose or revise a candidate before running opennori draft."]
    );
  }
});

export async function runBrainstormCommand(rawArgs: string[]) {
  return runJsonCommand(brainstormCommand, rawArgs);
}

export const discoverCommand = defineCommand({
  meta: {
    name: "discover",
    description: "Discover underspecified acceptance gaps before drafting a Nori Contract."
  },
  args: {
    root: {
      type: "string",
      description: "Project root.",
      default: process.cwd()
    },
    goal: {
      type: "string",
      description: "Natural language goal to inspect."
    },
    idea: {
      type: "string",
      description: "Alias for --goal."
    },
    id: {
      type: "string",
      description: "Optional stable discovery id."
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ args }) {
    const root = path.resolve(String(args.root || process.cwd()));
    const goal = String(args.goal || args.idea || "").trim();
    if (!goal) throw new Error("--goal is required");
    const discovery = discoverAcceptanceForCommand(goal, args.id);
    const paths = discoveryPaths(root, discovery.id);
    writeJson(paths.jsonPath, discovery);
    fs.mkdirSync(path.dirname(paths.markdownPath), { recursive: true });
    fs.writeFileSync(paths.markdownPath, renderDiscoveryMarkdown(discovery));
    refreshManifest(root);
    return ok(
      {
        discovery_id: discovery.id,
        status: discovery.status,
        goal: discovery.goal,
        gaps: discovery.gaps,
        questions: discovery.gaps.map((gap: any) => gap.question),
        discovery_path: paths.jsonPath,
        markdown_path: paths.markdownPath,
        is_acceptance_contract: false
      },
      [
        { kind: "acceptance_discovery", path: paths.jsonPath },
        { kind: "acceptance_discovery_markdown", path: paths.markdownPath }
      ],
      [],
      [discovery.next]
    );
  }
});

export async function runDiscoverCommand(rawArgs: string[]) {
  return runJsonCommand(discoverCommand, rawArgs);
}

export const draftCommand = defineCommand({
  meta: {
    name: "draft",
    description: "Create a draft Nori Contract from a goal or selected brainstorm candidate."
  },
  args: {
    root: {
      type: "string",
      description: "Project root.",
      default: process.cwd()
    },
    goal: {
      type: "string",
      description: "Natural language goal to draft."
    },
    goalId: {
      type: "string",
      description: "Optional stable goal id."
    },
    fromBrainstorm: {
      type: "string",
      description: "Brainstorm id to draft from."
    },
    candidate: {
      type: "string",
      description: "Brainstorm candidate id."
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ args }) {
    const root = path.resolve(String(args.root || process.cwd()));
    const brainstormId = args.fromBrainstorm;
    let brief;
    if (brainstormId) {
      const candidateId = args.candidate;
      if (!candidateId) throw new Error("--candidate is required with --from-brainstorm");
      brief = briefFromBrainstormForCommand(readJson(brainstormPaths(root, brainstormId).jsonPath), String(candidateId));
    } else {
      const goal = String(args.goal || "").trim();
      if (!goal) throw new Error("--goal is required");
      brief = briefFromGoalForCommand(goal, args.goalId);
    }
    const contract = buildContractFromBrief(brief);
    const ledger = buildEvidenceLedger(contract);
    const issues = validateContractForCommand(contract, ledger);
    if (issues.length > 0) {
      return { ...fail("invalid_acceptance", "Draft does not produce a valid OpenNori contract", "Rewrite ACs from the user's perspective"), issues };
    }
    const paths = pathsForGoal(root, contract.goal_id);
    fs.mkdirSync(path.dirname(paths.acceptancePath), { recursive: true });
    fs.writeFileSync(paths.acceptancePath, renderAcceptanceMarkdown(contract, ledger));
    writeJson(paths.evidencePath, { contract, ledger });
    refreshManifest(root);
    return ok(
      {
        goal_id: contract.goal_id,
        acceptance_basis: contract.acceptance_basis,
        acceptance_path: paths.acceptancePath,
        evidence_path: paths.evidencePath,
        criteria: contract.criteria,
        current_gap: currentGap(contract, ledger)
      },
      [
        { kind: "draft_acceptance_contract", path: paths.acceptancePath },
        { kind: "evidence_ledger", path: paths.evidencePath }
      ],
      [],
      ["Ask the user to approve or revise these acceptance criteria before implementation."]
    );
  }
});

export async function runDraftCommand(rawArgs: string[]) {
  return runJsonCommand(draftCommand, rawArgs);
}

export const initCommand = defineCommand({
  meta: {
    name: "init",
    description: "Create a Nori Contract from a brief JSON file."
  },
  args: {
    root: {
      type: "string",
      description: "Project root.",
      default: process.cwd()
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ args }) {
    const briefPath = path.resolve(String(args._?.[0] || ""));
    const root = path.resolve(String(args.root || process.cwd()));
    const brief = readJson(briefPath);
    const contract = buildContractFromBrief(brief);
    const ledger = buildEvidenceLedger(contract);
    const issues = validateContractForCommand(contract, ledger);
    if (issues.length > 0) {
      return { ...fail("invalid_acceptance", "Brief does not produce a valid OpenNori contract", "Rewrite ACs from the user's perspective"), issues };
    }

    const paths = pathsForGoal(root, contract.goal_id);
    const evidencePayload = { contract, ledger };
    fs.mkdirSync(path.dirname(paths.acceptancePath), { recursive: true });
    fs.writeFileSync(paths.acceptancePath, renderAcceptanceMarkdown(contract, ledger));
    writeJson(paths.evidencePath, evidencePayload);
    refreshManifest(root);

    return ok(
      {
        goal_id: contract.goal_id,
        acceptance_path: paths.acceptancePath,
        evidence_path: paths.evidencePath,
        current_gap: currentGap(contract, ledger)
      },
      [
        { kind: "acceptance_contract", path: paths.acceptancePath },
        { kind: "evidence_ledger", path: paths.evidencePath }
      ],
      [],
      ["Run opennori next --acceptance <path> --evidence <path> --json before choosing implementation work."]
    );
  }
});

export async function runInitCommand(rawArgs: string[]) {
  return runJsonCommand(initCommand, rawArgs);
}

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

export async function runNextCommand(rawArgs: string[], { loadPair }: ActiveGoalRuntime) {
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

export async function runResumeCommand(rawArgs: string[], { loadPair }: ActiveGoalRuntime) {
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

export async function runStatusCommand(rawArgs: string[], { loadPair }: ActiveGoalRuntime) {
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

export async function runEvaluateCommand(rawArgs: string[], { loadPair }: ActiveGoalRuntime) {
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

export async function runApproveCommand(rawArgs: string[], { loadPair }: ActiveGoalRuntime) {
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
    const criterion = contract.criteria.find((item: any) => item.id === criterionId);
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
    const issues = validateContractForCommand(contract, ledger);
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
