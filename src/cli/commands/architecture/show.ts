import { defineCommand } from "citty";
import { architectureState, readArchitectureBaseline } from "../../../architecture.ts";
import { ok } from "../../../core.ts";
import { runJsonCommand } from "../../runtime.ts";
import { jsonArg, resolveRoot, rootArg } from "./shared.ts";

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
    const root = resolveRoot(args.root);
    return ok({
      root,
      architecture: architectureState(root, args.goal),
      baseline: readArchitectureBaseline(root),
      side_effect: "none"
    });
  }
});

export async function runArchitectureShowCommand(rawArgs: string[]) {
  return runJsonCommand(architectureShowCommand, rawArgs);
}
