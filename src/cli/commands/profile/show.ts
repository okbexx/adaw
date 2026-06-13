import { defineCommand } from "citty";
import {
  currentGap,
  ok,
  profileCompliance
} from "../../../core.ts";
import { activeGoalArgs, type ActiveGoalRuntime, runJsonCommand } from "../../runtime.ts";
import {
  jsonArg
} from "./shared.ts";

export const profileShowCommand = defineCommand({
  meta: {
    name: "show",
    description: "Show the Nori Profile attached to the active goal."
  },
  args: {
    ...activeGoalArgs,
    json: jsonArg
  },
  run({ args, data }) {
    const { contract, ledger } = data.loadPair(args);
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
