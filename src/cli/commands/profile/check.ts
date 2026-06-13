import { defineCommand } from "citty";
import {
  currentGap,
  ok,
  profileCompliance,
  recomputeWorkflowStatus
} from "../../../core.ts";
import { autoProfileChecks, recordAutoProfileChecks } from "../../../lifecycle.ts";
import { activeGoalArgs, type ActiveGoalRuntime, runJsonCommand } from "../../runtime.ts";
import {
  jsonArg
} from "./shared.ts";

export const profileCheckCommand = defineCommand({
  meta: {
    name: "check",
    description: "Check Nori Profile preferences against local project state."
  },
  args: {
    ...activeGoalArgs,
    record: {
      type: "boolean",
      description: "Record automatic profile checks into the evidence ledger.",
      default: false
    },
    json: jsonArg
  },
  run({ args, data }) {
    const { contract, ledger, acceptancePath, evidencePath, root } = data.loadPair(args);
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
