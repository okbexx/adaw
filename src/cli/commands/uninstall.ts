import path from "node:path";
import { defineCommand } from "citty";
import { fail, ok } from "../../core.js";
import { applyUninstallActions, buildUninstallActions, buildUninstallPlan } from "../../lifecycle.js";
import { runJsonCommand } from "../runtime.ts";

type UninstallResultOptions = {
  root?: unknown;
  dryRun?: boolean;
  confirmed?: boolean;
  includeState?: boolean;
};

export function uninstallResult({
  root,
  dryRun = false,
  confirmed = false,
  includeState = false
}: UninstallResultOptions) {
  const projectRoot = path.resolve(String(root || process.cwd()));
  const actions = buildUninstallActions(projectRoot, { includeState });
  const uninstallPlan = buildUninstallPlan(projectRoot, actions, { dryRun, includeState });

  if (!dryRun && !confirmed) {
    return fail(
      "confirm_required",
      "Uninstall removes OpenNori-managed project assets.",
      "Run opennori uninstall --root <project> --dry-run --json first, then rerun with --confirm if the planned removals are acceptable."
    );
  }

  if (!dryRun) {
    applyUninstallActions(actions);
  }

  return ok({
    root: projectRoot,
    dry_run: dryRun,
    confirmed,
    include_state: includeState,
    uninstall_plan: uninstallPlan,
    actions: uninstallPlan.actions
  });
}

export const uninstallCommand = defineCommand({
  meta: {
    name: "uninstall",
    description: "Remove OpenNori managed project assets with preview-first safety."
  },
  args: {
    root: {
      type: "string",
      description: "Project root.",
      default: process.cwd()
    },
    includeState: {
      type: "boolean",
      description: "Also remove the .opennori state directory after confirmation.",
      default: false
    },
    dryRun: {
      type: "boolean",
      description: "Preview planned removals without deleting files.",
      default: false
    },
    confirm: {
      type: "boolean",
      description: "Apply removals after preview.",
      default: false
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ args }) {
    return uninstallResult({
      root: args.root,
      dryRun: Boolean(args.dryRun),
      confirmed: Boolean(args.confirm),
      includeState: Boolean(args.includeState)
    });
  }
});

export async function runUninstallCommand(rawArgs: string[]) {
  return runJsonCommand(uninstallCommand, rawArgs);
}
