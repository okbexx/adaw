import { defineCommand } from "citty";
import { currentGap, ok, profileCompliance } from "../../core.js";
import { runJsonCommand } from "../runtime.js";

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

export async function runProfileShowCommand(rawArgs, { loadPair }) {
  return runJsonCommand(profileShowCommand, rawArgs, { loadPair });
}
