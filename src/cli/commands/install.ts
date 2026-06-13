import path from "node:path";
import { defineCommand } from "citty";
import { fail, ok } from "../../core.ts";
import { buildInstallPlan, installActions } from "../../lifecycle.ts";
import { runJsonCommand } from "../runtime.ts";

type InstallResultOptions = {
  root?: unknown;
  dryRun?: boolean;
  force?: boolean;
  confirmed?: boolean;
  mergeAgentRoute?: boolean;
};

type ManifestAction = {
  kind: string;
  manifest?: unknown;
};

export function installResult({
  root,
  dryRun = false,
  force = false,
  confirmed = false,
  mergeAgentRoute = false
}: InstallResultOptions) {
  const projectRoot = path.resolve(String(root || process.cwd()));
  if ((force || mergeAgentRoute) && !dryRun && !confirmed) {
    const previewFlags = [
      "--dry-run",
      force ? "--force" : null,
      mergeAgentRoute ? "--merge-agent-route" : null,
      "--json"
    ].filter(Boolean).join(" ");
    return fail(
      "confirm_required",
      "Install may update existing OpenNori-managed project assets.",
      `Run opennori install --root <project> ${previewFlags} first, then rerun with --confirm if the planned updates are acceptable.`
    );
  }

  const actions = installActions(projectRoot, { dryRun, force, mergeAgentRoute });
  const manifestAction = actions.find((action) => action.kind === "manifest") as ManifestAction | undefined;
  const installPlan = buildInstallPlan(projectRoot, actions, { dryRun, force, mergeAgentRoute });
  return ok({
    root: projectRoot,
    dry_run: dryRun,
    force,
    confirmed,
    install_plan: installPlan,
    actions: installPlan.actions,
    manifest: manifestAction?.manifest ?? null
  });
}

export const installCommand = defineCommand({
  meta: {
    name: "install",
    description: "Install or refresh OpenNori project assets with preview-first safety."
  },
  args: {
    root: {
      type: "string",
      description: "Project root.",
      default: process.cwd()
    },
    mergeAgentRoute: {
      type: "boolean",
      description: "Merge the OpenNori agent route into AGENTS.md and CLAUDE.md.",
      default: false
    },
    dryRun: {
      type: "boolean",
      description: "Preview planned changes without writing files.",
      default: false
    },
    force: {
      type: "boolean",
      description: "Overwrite managed OpenNori assets after confirmation.",
      default: false
    },
    confirm: {
      type: "boolean",
      description: "Apply update or overwrite actions after preview.",
      default: false
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ args }) {
    return installResult({
      root: args.root,
      dryRun: Boolean(args.dryRun),
      force: Boolean(args.force),
      confirmed: Boolean(args.confirm),
      mergeAgentRoute: Boolean(args.mergeAgentRoute)
    });
  }
});

export async function runInstallCommand(rawArgs: string[]) {
  return runJsonCommand(installCommand, rawArgs);
}
