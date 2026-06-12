import path from "node:path";
import { defineCommand, runCommand } from "citty";
import { architectureProfiles, architectureState, readArchitectureBaseline } from "../../architecture.js";
import { ok } from "../../core.js";

const rootArg = {
  type: "string",
  description: "Project root.",
  default: process.cwd()
};

const jsonArg = {
  type: "boolean",
  description: "Keep deterministic JSON output for agents.",
  default: false
};

export const architectureProfilesCommand = defineCommand({
  meta: {
    name: "profiles",
    description: "List reviewable OpenNori Architecture Profiles."
  },
  args: {
    root: rootArg,
    json: jsonArg
  },
  run({ args }) {
    const root = path.resolve(String(args.root || process.cwd()));
    return ok({
      root,
      profiles: architectureProfiles(root),
      side_effect: "none"
    });
  }
});

export const architectureShowCommand = defineCommand({
  meta: {
    name: "show",
    description: "Show the current OpenNori Architecture Baseline state."
  },
  args: {
    root: rootArg,
    goal: {
      type: "string",
      description: "Goal id to evaluate architecture state against."
    },
    json: jsonArg
  },
  run({ args }) {
    const root = path.resolve(String(args.root || process.cwd()));
    return ok({
      root,
      architecture: architectureState(root, args.goal),
      baseline: readArchitectureBaseline(root),
      side_effect: "none"
    });
  }
});

export async function runArchitectureProfilesCommand(rawArgs) {
  const { result } = await runCommand(architectureProfilesCommand, { rawArgs });
  return result;
}

export async function runArchitectureShowCommand(rawArgs) {
  const { result } = await runCommand(architectureShowCommand, { rawArgs });
  return result;
}
