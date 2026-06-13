import { defineCommand } from "citty";
import {
  addProfileItem,
  currentGap,
  ok,
  profileCompliance,
  recomputeWorkflowStatus
} from "../../../core.ts";
import { activeGoalArgs, type ActiveGoalRuntime, runJsonCommand } from "../../runtime.ts";
import type { ProfileItemInput } from "../../../types.ts";
import {
  jsonArg,
  profileItemType,
  profileStrength,
} from "./shared.ts";

export const profileAddCommand = defineCommand({
  meta: {
    name: "add",
    description: "Add an execution preference to the Nori Profile for the active goal."
  },
  args: {
    ...activeGoalArgs,
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
    json: jsonArg
  },
  run({ args, data }) {
    const { contract, ledger, acceptancePath, evidencePath, root } = data.loadPair(args);
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
