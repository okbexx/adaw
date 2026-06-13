import path from "node:path";
import { defineCommand } from "citty";
import { fail, ok } from "../../core.js";
import {
  applyUpgradeActions,
  buildManifest,
  buildUpgradePlan,
  safeReadManifest,
  upgradeActions,
  writeManifest
} from "../../lifecycle.js";
import { runJsonCommand } from "../runtime.ts";

type UpgradeResultOptions = {
  root?: unknown;
  dryRun?: boolean;
  confirmed?: boolean;
  requestedSkill?: boolean;
  mergeAgentRoute?: boolean;
};

export function upgradeResult({
  root,
  dryRun = false,
  confirmed = false,
  requestedSkill = false,
  mergeAgentRoute = false
}: UpgradeResultOptions) {
  const projectRoot = path.resolve(String(root || process.cwd()));
  const actions = upgradeActions(projectRoot, { requestedSkill, mergeAgentRoute });
  const upgradePlan = buildUpgradePlan(projectRoot, actions, { dryRun, requestedSkill, mergeAgentRoute });

  if (!dryRun && !confirmed) {
    return fail(
      "confirm_required",
      "Upgrade refreshes OpenNori manifest, protocol, and optionally Skill Pack assets.",
      "Run opennori upgrade --root <project> --dry-run --json first, then rerun with --confirm if the planned updates are acceptable."
    );
  }

  if (!dryRun && actions.some((action) => action.action === "missing")) {
    return fail(
      "install_required",
      "Upgrade found missing OpenNori entry assets.",
      "Run opennori install --root <project> --dry-run --json before upgrading missing assets."
    );
  }

  if (!dryRun) {
    applyUpgradeActions(actions);
    writeManifest(projectRoot);
  }

  const nextActions = dryRun
    ? ["Review the upgrade plan, then rerun with --confirm if the planned updates are acceptable."]
    : ["Run opennori check --root <project> --json to audit existing active Nori Contracts for underspecified ACs before continuing work."];

  return ok({
    root: projectRoot,
    dry_run: dryRun,
    confirmed,
    upgrade_plan: upgradePlan,
    actions: upgradePlan.actions,
    manifest: dryRun ? buildManifest(projectRoot) : safeReadManifest(projectRoot)
  }, [], [], nextActions);
}

export const upgradeCommand = defineCommand({
  meta: {
    name: "upgrade",
    description: "Refresh OpenNori manifest, protocol, and optional Skill Pack assets."
  },
  args: {
    root: {
      type: "string",
      description: "Project root.",
      default: process.cwd()
    },
    skill: {
      type: "boolean",
      description: "Refresh installed OpenNori Skills.",
      default: false
    },
    refreshSkill: {
      type: "boolean",
      description: "Alias for --skill.",
      default: false
    },
    mergeAgentRoute: {
      type: "boolean",
      description: "Merge the OpenNori agent route into AGENTS.md and CLAUDE.md.",
      default: false
    },
    dryRun: {
      type: "boolean",
      description: "Preview planned updates without writing files.",
      default: false
    },
    confirm: {
      type: "boolean",
      description: "Apply updates after preview.",
      default: false
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ args }) {
    return upgradeResult({
      root: args.root,
      dryRun: Boolean(args.dryRun),
      confirmed: Boolean(args.confirm),
      requestedSkill: Boolean(args.skill || args.refreshSkill),
      mergeAgentRoute: Boolean(args.mergeAgentRoute)
    });
  }
});

export async function runUpgradeCommand(rawArgs: string[]) {
  return runJsonCommand(upgradeCommand, rawArgs);
}
