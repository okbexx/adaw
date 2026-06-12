import path from "node:path";
import { defineCommand } from "citty";
import { currentGap, findActivePairs, ok, readJson } from "../../core.js";
import { doctor } from "../../lifecycle.js";
import { runJsonCommand } from "../runtime.js";

export const doctorCommand = defineCommand({
  meta: {
    name: "doctor",
    description: "Diagnose OpenNori project state and recovery actions."
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
    const root = path.resolve(String(args.root || process.cwd()));
    return ok({
      name: "opennori",
      root,
      ...doctor(root),
      side_effect: "none"
    });
  }
});

export async function runDoctorCommand(rawArgs) {
  return runJsonCommand(doctorCommand, rawArgs);
}

export const listCommand = defineCommand({
  meta: {
    name: "list",
    description: "List recoverable active OpenNori goals."
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
    const root = path.resolve(String(args.root || process.cwd()));
    const activeGoals = findActivePairs(root).map((pair) => {
      const payload = readJson(pair.evidencePath);
      return {
        goal_id: pair.goalId,
        status: payload.ledger?.status || "unknown",
        current_gap: currentGap(payload.contract, payload.ledger),
        acceptance_path: pair.acceptancePath,
        evidence_path: pair.evidencePath
      };
    });
    return ok({ root, active_goals: activeGoals });
  }
});

export async function runListCommand(rawArgs) {
  return runJsonCommand(listCommand, rawArgs);
}
