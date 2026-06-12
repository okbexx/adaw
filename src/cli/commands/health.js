import { spawnSync } from "node:child_process";
import path from "node:path";
import { defineCommand } from "citty";
import { currentGap, findActivePairs, ok, readJson } from "../../core.js";
import { doctor } from "../../lifecycle.js";
import { runJsonCommand } from "../runtime.js";

function classifyChangedFile(filePath) {
  if (
    filePath.startsWith(".opennori/") ||
    filePath.startsWith("examples/")
  ) {
    return "acceptance";
  }
  return "implementation";
}

function gitChanges(root) {
  const result = spawnSync("git", ["status", "--short", "--untracked-files=all"], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    return { available: false, acceptance: [], implementation: [], raw_error: result.stderr.trim() };
  }

  const grouped = { available: true, acceptance: [], implementation: [] };
  for (const line of result.stdout.split("\n")) {
    if (!line.trim()) continue;
    const status = line.slice(0, 2).trim() || "modified";
    const rawPath = line.slice(3).trim();
    const filePath = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) : rawPath;
    grouped[classifyChangedFile(filePath)].push({ status, path: filePath });
  }
  return grouped;
}

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

export const changesCommand = defineCommand({
  meta: {
    name: "changes",
    description: "Group current git changes by OpenNori acceptance assets and implementation files."
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
    const pairs = findActivePairs(root).map((pair) => {
      const payload = readJson(pair.evidencePath);
      return {
        goal_id: pair.goalId,
        workflow_status: payload.ledger?.status || "unknown",
        current_gap: currentGap(payload.contract, payload.ledger)
      };
    });
    return ok({
      root,
      active_goals: pairs,
      changed_files: gitChanges(root)
    });
  }
});

export async function runChangesCommand(rawArgs) {
  return runJsonCommand(changesCommand, rawArgs);
}
