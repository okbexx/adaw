import path from "node:path";
import { defineCommand } from "citty";
import { ok } from "../../core.js";
import { doctor } from "../../lifecycle.js";
import { runJsonCommand } from "../runtime.ts";

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

export async function runDoctorCommand(rawArgs: string[]) {
  return runJsonCommand(doctorCommand, rawArgs);
}
