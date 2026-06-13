import { defineCommand } from "citty";
import { addProfileEvidence, addProfileItem, currentGap, ok, profileCompliance, recomputeWorkflowStatus } from "../../core.ts";
import { autoProfileChecks, recordAutoProfileChecks } from "../../lifecycle.ts";
import { type ActiveGoalRuntime, runJsonCommand } from "../runtime.ts";
import type { ProfileEvidenceInput, ProfileEvidenceResult, ProfileItemInput, ProfileItemType, ProfileStrength } from "../../types.ts";

function profileItemType(value: unknown): ProfileItemType {
  const type = String(value || "constraint");
  if (!["skill", "stack", "constraint"].includes(type)) throw new Error(`Invalid profile item type: ${type}`);
  return type as ProfileItemType;
}

function profileStrength(value: unknown): ProfileStrength {
  const strength = String(value || "prefer");
  if (!["must", "prefer", "avoid"].includes(strength)) throw new Error(`Invalid profile strength: ${strength}`);
  return strength as ProfileStrength;
}

function profileEvidenceResult(value: unknown): ProfileEvidenceResult {
  const result = String(value || "satisfied");
  if (!["satisfied", "violated", "waived"].includes(result)) throw new Error(`Invalid profile evidence result: ${result}`);
  return result as ProfileEvidenceResult;
}

export const profileAddCommand = defineCommand({
  meta: {
    name: "add",
    description: "Add an execution preference to the Nori Profile for the active goal."
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
    id: {
      type: "string",
      description: "Optional stable profile item id."
    },
    type: {
      type: "string",
      description: "Preference type.",
      default: "constraint"
    },
    name: {
      type: "string",
      description: "Skill, stack, or constraint name."
    },
    strength: {
      type: "string",
      description: "must, prefer, or avoid.",
      default: "prefer"
    },
    purpose: {
      type: "string",
      description: "Why this preference matters.",
      default: ""
    },
    scope: {
      type: "string",
      description: "Where this preference applies.",
      default: ""
    },
    installPolicy: {
      type: "string",
      description: "Installation policy.",
      default: "ask_before_install"
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ args, data }) {
    const { contract, ledger, acceptancePath, evidencePath, root } = data.loadPair();
    const item: ProfileItemInput = {
      id: args.id,
      type: profileItemType(args.type),
      name: String(args.name || ""),
      strength: profileStrength(args.strength),
      purpose: args.purpose || "",
      scope: args.scope || "",
      install_policy: args.installPolicy || "ask_before_install"
    };
    addProfileItem(ledger, item);
    recomputeWorkflowStatus(contract, ledger);
    data.savePair(acceptancePath, evidencePath, contract, ledger);
    data.refreshManifest(root);
    return ok({
      goal_id: contract.goal_id,
      profile: ledger.capability_profile,
      compliance: profileCompliance(ledger),
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger)
    });
  }
});

export async function runProfileAddCommand(rawArgs: string[], { loadPair, savePair, refreshManifest }: ActiveGoalRuntime) {
  return runJsonCommand(profileAddCommand, rawArgs, { loadPair, savePair, refreshManifest });
}

export const profileEvidenceCommand = defineCommand({
  meta: {
    name: "evidence",
    description: "Record evidence for a Nori Profile item."
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
    item: {
      type: "string",
      description: "Profile item id."
    },
    result: {
      type: "string",
      description: "satisfied, violated, or waived.",
      default: "satisfied"
    },
    summary: {
      type: "string",
      description: "Evidence summary.",
      default: ""
    },
    path: {
      type: "string",
      description: "Optional evidence path."
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ args, data }) {
    const { contract, ledger, acceptancePath, evidencePath, root } = data.loadPair();
    const itemId = args.item;
    if (!itemId) throw new Error("--item is required");
    const evidence: ProfileEvidenceInput = {
      result: profileEvidenceResult(args.result),
      summary: args.summary || "",
      path: args.path
    };
    if (!evidence.summary) throw new Error("--summary is required");
    addProfileEvidence(ledger, itemId, evidence);
    recomputeWorkflowStatus(contract, ledger);
    data.savePair(acceptancePath, evidencePath, contract, ledger);
    data.refreshManifest(root);
    return ok({
      goal_id: contract.goal_id,
      item: itemId,
      compliance: profileCompliance(ledger),
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger)
    });
  }
});

export async function runProfileEvidenceCommand(rawArgs: string[], { loadPair, savePair, refreshManifest }: ActiveGoalRuntime) {
  return runJsonCommand(profileEvidenceCommand, rawArgs, { loadPair, savePair, refreshManifest });
}

export const profileShowCommand = defineCommand({
  meta: {
    name: "show",
    description: "Show the Nori Profile attached to the active goal."
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
    return ok({
      goal_id: contract.goal_id,
      profile: ledger.capability_profile || { items: [], evidence: [] },
      compliance: profileCompliance(ledger),
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger)
    });
  }
});

export async function runProfileShowCommand(rawArgs: string[], { loadPair }: ActiveGoalRuntime) {
  return runJsonCommand(profileShowCommand, rawArgs, { loadPair });
}

export const profileCheckCommand = defineCommand({
  meta: {
    name: "check",
    description: "Check Nori Profile preferences against local project state."
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
    record: {
      type: "boolean",
      description: "Record automatic profile checks into the evidence ledger.",
      default: false
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ args, data }) {
    const { contract, ledger, acceptancePath, evidencePath, root } = data.loadPair();
    const checks = autoProfileChecks(root, ledger);
    if (args.record) {
      recordAutoProfileChecks(ledger, checks);
      recomputeWorkflowStatus(contract, ledger);
      data.savePair(acceptancePath, evidencePath, contract, ledger);
      data.refreshManifest(root);
    }

    return ok({
      goal_id: contract.goal_id,
      recorded: args.record,
      checks,
      profile: ledger.capability_profile || { items: [], evidence: [] },
      compliance: profileCompliance(ledger),
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger)
    });
  }
});

export async function runProfileCheckCommand(rawArgs: string[], { loadPair, savePair, refreshManifest }: ActiveGoalRuntime) {
  return runJsonCommand(profileCheckCommand, rawArgs, { loadPair, savePair, refreshManifest });
}
