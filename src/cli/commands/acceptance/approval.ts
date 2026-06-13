import { defineCommand } from "citty";
import {
  currentGap,
  ok,
  recomputeWorkflowStatus,
  syncAcceptanceMarkdown,
  writeJson
} from "../../../core.ts";
import { refreshManifest } from "../../../lifecycle.ts";
import { activeGoalArgs, type ActiveGoalRuntime, runJsonCommand } from "../../runtime.ts";
import { jsonArg, rootArg } from "./shared.ts";

export const approveCommand = defineCommand({
  meta: {
    name: "approve",
    description: "Mark the current OpenNori acceptance criteria as user-approved."
  },
  args: {
    ...activeGoalArgs,
    summary: {
      type: "string",
      description: "Human approval summary.",
      default: "User approved acceptance criteria."
    },
    json: jsonArg
  },
  run({ args, data }) {
    const { contract, ledger, acceptancePath, evidencePath, root } = data.loadPair(args);
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
