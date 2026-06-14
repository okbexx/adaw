import path from "node:path";
import { defineCommand } from "citty";
import { setup } from "../../lifecycle.ts";
import type { SetupCommandRunner } from "../../lifecycle/setup.ts";
import { runJsonCommand } from "../runtime.ts";

type SetupResultOptions = {
  root?: unknown;
  dryRun?: boolean;
  confirmed?: boolean;
  runner?: SetupCommandRunner;
};

export function setupResult({
  root,
  dryRun = true,
  confirmed = false,
  runner
}: SetupResultOptions) {
  return setup(path.resolve(String(root || process.cwd())), {
    dryRun,
    confirmed,
    runner
  });
}

export const setupCommand = defineCommand({
  meta: {
    name: "setup",
    description: "Install the complete OpenNori capability bundle with preview-first safety."
  },
  args: {
    root: {
      type: "string",
      description: "Project root to initialize after installing the bundle.",
      default: process.cwd()
    },
    dryRun: {
      type: "boolean",
      description: "Preview planned setup actions without writing project or user-level state.",
      default: false
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
  run({ args, data }) {
    return setupResult({
      root: args.root,
      dryRun: Boolean(args.dryRun) || !args.confirm,
      confirmed: Boolean(args.confirm),
      runner: (data as { runner?: SetupCommandRunner } | undefined)?.runner
    });
  }
});

export async function runSetupCommand(rawArgs: string[], data?: { runner?: SetupCommandRunner }) {
  return runJsonCommand(setupCommand, rawArgs, data);
}
