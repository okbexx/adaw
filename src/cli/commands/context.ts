import path from "node:path";
import { defineCommand } from "citty";
import { ok, writeJson } from "../../core.ts";
import { buildContextExport } from "../../lifecycle.ts";
import { activeGoalArgs, type ActiveGoalRuntime, runJsonCommand } from "../runtime.ts";

export const contextExportCommand = defineCommand({
  meta: {
    name: "export",
    description: "Export OpenNori goal context for review tools."
  },
  args: {
    ...activeGoalArgs,
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
  run({ args, data }) {
    const pair = data.loadPair(args);
    const root = path.resolve(pair.root);
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

export async function runContextExportCommand(rawArgs: string[], { loadPair }: ActiveGoalRuntime) {
  return runJsonCommand(contextExportCommand, rawArgs, { loadPair });
}
