import { defineCommand } from "citty";
import { currentGap, nextRecommendation, ok } from "../../core.js";
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
