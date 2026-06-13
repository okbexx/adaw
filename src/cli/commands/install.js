import path from "node:path";
import { defineCommand } from "citty";
import { fail, ok } from "../../core.js";
import { buildInstallPlan, installActions } from "../../lifecycle.js";
import { runJsonCommand } from "../runtime.js";

export function installResult({
  root,
  dryRun = false,
  force = false,
  confirmed = false,
  requestedSkill = false,
  refreshSkill = false,
  mergeAgentRoute = false
}) {
  const projectRoot = path.resolve(String(root || process.cwd()));
  if ((force || refreshSkill || mergeAgentRoute) && !dryRun && !confirmed) {
    const previewFlags = [
      "--dry-run",
      force ? "--force" : null,
      requestedSkill ? "--skill" : null,
      refreshSkill ? "--refresh-skill" : null,
      mergeAgentRoute ? "--merge-agent-route" : null,
      "--json"
    ].filter(Boolean).join(" ");
    return fail(
      "confirm_required",
      "Install may update existing OpenNori-managed project assets.",
      `Run opennori install --root <project> ${previewFlags} first, then rerun with --confirm if the planned updates are acceptable.`
    );
  }

  const actions = installActions(projectRoot, { dryRun, force, requestedSkill, refreshSkill, mergeAgentRoute });
  const manifestAction = actions.find((action) => action.kind === "manifest");
  const installPlan = buildInstallPlan(projectRoot, actions, { dryRun, force, requestedSkill, refreshSkill, mergeAgentRoute });
  return ok({
    root: projectRoot,
    dry_run: dryRun,
    force,
    confirmed,
    install_plan: installPlan,
    actions: installPlan.actions,
    manifest: manifestAction.manifest
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
    skill: {
      type: "boolean",
      description: "Install the OpenNori Skill Pack.",
      default: false
    },
    refreshSkill: {
      type: "boolean",
      description: "Refresh installed OpenNori Skills.",
      default: false
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
      requestedSkill: Boolean(args.skill),
      refreshSkill: Boolean(args.refreshSkill),
      mergeAgentRoute: Boolean(args.mergeAgentRoute)
    });
  }
});

export async function runInstallCommand(rawArgs) {
  return runJsonCommand(installCommand, rawArgs);
}
