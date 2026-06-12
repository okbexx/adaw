import path from "node:path";
import { defineCommand } from "citty";
import { findActivePairs, ok, writeJson } from "../../core.js";
import { buildContextExport } from "../../lifecycle.js";
import { runJsonCommand } from "../runtime.js";

export const contextExportCommand = defineCommand({
  meta: {
    name: "export",
    description: "Export OpenNori goal context for review tools."
  },
  args: {
    root: {
      type: "string",
      description: "Project root.",
      default: process.cwd()
    },
    goal: {
      type: "string",
      description: "Active goal id to export."
    },
    output: {
      type: "string",
      description: "Optional file path to write the context JSON."
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ args }) {
    const root = path.resolve(String(args.root || process.cwd()));
    const goal = args.goal ? String(args.goal) : undefined;
    const pairs = findActivePairs(root);
    const pair = goal ? pairs.find((item) => item.goalId === goal) : pairs[0];
    if (!pair) throw new Error(`No active OpenNori goal found under ${root}`);
    if (!goal && pairs.length > 1) {
      throw new Error("Multiple active OpenNori goals found. Pass --goal <goal-id>.");
    }

    const context = buildContextExport(root, pair);
    if (args.output) {
      const outputPath = path.resolve(String(args.output));
      writeJson(outputPath, context);
      return ok(
        { ...context, output_path: outputPath },
        [{ kind: "opennori_context_export", path: outputPath }],
        [],
        context.next_recommendation.actions
      );
    }
    return ok(context, [], [], context.next_recommendation.actions);
  }
});

export async function runContextExportCommand(rawArgs) {
  return runJsonCommand(contextExportCommand, rawArgs);
}
