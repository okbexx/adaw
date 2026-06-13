import path from "node:path";
import { defineCommand } from "citty";
import {
  bootstrap
} from "../../lifecycle.js";
import { runJsonCommand } from "../runtime.js";

export function bootstrapResult({ root, confirmed = false }) {
  return bootstrap(path.resolve(String(root || process.cwd())), { confirmed: Boolean(confirmed) });
}

export const bootstrapCommand = defineCommand({
  meta: {
    name: "bootstrap",
    description: "Prepare OpenNori project assets with preview-first setup."
  },
  args: {
    root: {
      type: "string",
      description: "Project root.",
      default: process.cwd()
    },
    confirm: {
      type: "boolean",
      description: "Apply setup actions after preview.",
      default: false
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ args }) {
    return bootstrapResult({ root: args.root, confirmed: args.confirm });
  }
});

export async function runBootstrapCommand(rawArgs) {
  return runJsonCommand(bootstrapCommand, rawArgs);
}
