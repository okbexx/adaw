import path from "node:path";
import type {
  InstallPlan,
  LifecyclePlanAction,
  LifecyclePlanSummary,
  ManagedAction,
  UninstallPlan,
  UpgradePlan
} from "../types.ts";

const WRITING_INSTALL_ACTIONS = new Set(["create", "overwrite", "update", "merge"]);
const WRITING_UNINSTALL_ACTIONS = new Set(["delete", "delete-tree"]);
const WRITING_UPGRADE_ACTIONS = new Set(["update", "overwrite", "merge"]);

function relativeTo(root: string, filePath: string): string {
  return path.relative(root, filePath) || ".";
}

function installActionReason(action: string, kind: string): string {
  if (action === "create") return `Missing OpenNori ${kind} will be created.`;
  if (action === "exists") return `Required OpenNori ${kind} already exists.`;
  if (action === "skip") return `Existing OpenNori ${kind} is not overwritten without --force.`;
  if (action === "overwrite") return `Existing OpenNori ${kind} will be overwritten because --force was provided.`;
  if (action === "merge") return `OpenNori ${kind} section will be merged without replacing existing project content.`;
  if (action === "update") return `OpenNori ${kind} will be refreshed from current project state.`;
  return `OpenNori ${kind} action: ${action}.`;
}

function enrichInstallAction(root: string, action: ManagedAction, { dryRun = false } = {}): LifecyclePlanAction {
  const wouldWrite = WRITING_INSTALL_ACTIONS.has(action.action);
  return {
    path: relativeTo(root, action.path),
    kind: action.kind || "file",
    action: action.action,
    managed: action.managed !== false,
    would_write: wouldWrite,
    will_write: wouldWrite && !dryRun,
    destructive: action.action === "overwrite",
    reason: action.reason || installActionReason(action.action, action.kind || "file")
  };
}

function summarizeInstallPlan(actions: LifecyclePlanAction[]): LifecyclePlanSummary {
  const byAction: Record<string, number> = {};
  for (const action of actions) {
    byAction[action.action] = (byAction[action.action] || 0) + 1;
  }
  return {
    total: actions.length,
    by_action: byAction,
    would_write: actions.filter((action) => action.would_write).length,
    will_write: actions.filter((action) => action.will_write).length,
    destructive: actions.filter((action) => action.destructive).length,
    managed: actions.filter((action) => action.managed).length
  };
}

export function buildInstallPlan(root: string, actions: ManagedAction[], { dryRun = false, force = false, mergeAgentRoute = false } = {}): InstallPlan {
  const enrichedActions = actions.map((action) => enrichInstallAction(root, action, { dryRun }));
  return {
    schema_version: "opennori/install-plan-v1",
    root,
    dry_run: dryRun,
    force,
    merge_agent_route: mergeAgentRoute,
    summary: summarizeInstallPlan(enrichedActions),
    actions: enrichedActions
  };
}

function uninstallActionReason(action: string, kind: string): string {
  if (action === "delete") return `Existing OpenNori ${kind} will be removed.`;
  if (action === "delete-tree") return `Existing OpenNori ${kind} and its contents will be removed.`;
  if (action === "absent") return `OpenNori ${kind} is already absent.`;
  if (action === "preserve") return `OpenNori ${kind} is preserved by default.`;
  return `OpenNori ${kind} action: ${action}.`;
}

function enrichUninstallAction(root: string, action: ManagedAction, { dryRun = false } = {}): LifecyclePlanAction {
  const wouldWrite = WRITING_UNINSTALL_ACTIONS.has(action.action);
  return {
    path: relativeTo(root, action.path),
    kind: action.kind || "file",
    action: action.action,
    managed: action.managed !== false,
    would_write: wouldWrite,
    will_write: wouldWrite && !dryRun,
    destructive: wouldWrite,
    recursive: Boolean(action.recursive),
    reason: action.reason || uninstallActionReason(action.action, action.kind || "file")
  };
}

function summarizeUninstallPlan(actions: LifecyclePlanAction[]): LifecyclePlanSummary {
  const byAction: Record<string, number> = {};
  for (const action of actions) {
    byAction[action.action] = (byAction[action.action] || 0) + 1;
  }
  return {
    total: actions.length,
    by_action: byAction,
    would_write: actions.filter((action) => action.would_write).length,
    will_write: actions.filter((action) => action.will_write).length,
    destructive: actions.filter((action) => action.destructive).length,
    preserved: actions.filter((action) => action.action === "preserve").length,
    managed: actions.filter((action) => action.managed).length
  };
}

export function buildUninstallPlan(root: string, actions: ManagedAction[], { dryRun = false, includeState = false } = {}): UninstallPlan {
  const enrichedActions = actions.map((action) => enrichUninstallAction(root, action, { dryRun }));
  return {
    schema_version: "opennori/uninstall-plan-v1",
    root,
    dry_run: dryRun,
    include_state: includeState,
    summary: summarizeUninstallPlan(enrichedActions),
    actions: enrichedActions
  };
}

function upgradeActionReason(action: string, kind: string): string {
  if (action === "current") return `OpenNori ${kind} is already current.`;
  if (action === "update") return `OpenNori ${kind} will be refreshed to the current CLI version.`;
  if (action === "overwrite") return `OpenNori ${kind} will be overwritten to refresh generated OpenNori assets.`;
  if (action === "merge") return `OpenNori ${kind} section will be merged without replacing existing project content.`;
  if (action === "missing") return `OpenNori ${kind} is missing; run install before upgrade.`;
  return `OpenNori ${kind} action: ${action}.`;
}

function enrichUpgradeAction(root: string, action: ManagedAction, { dryRun = false } = {}): LifecyclePlanAction {
  const wouldWrite = WRITING_UPGRADE_ACTIONS.has(action.action);
  return {
    path: relativeTo(root, action.path),
    kind: action.kind || "file",
    action: action.action,
    managed: action.managed !== false,
    would_write: wouldWrite,
    will_write: wouldWrite && !dryRun,
    destructive: action.action === "overwrite",
    from_version: action.from_version,
    to_version: action.to_version,
    reason: action.reason || upgradeActionReason(action.action, action.kind || "file")
  };
}

function summarizeUpgradePlan(actions: LifecyclePlanAction[]): LifecyclePlanSummary {
  const byAction: Record<string, number> = {};
  for (const action of actions) {
    byAction[action.action] = (byAction[action.action] || 0) + 1;
  }
  return {
    total: actions.length,
    by_action: byAction,
    would_write: actions.filter((action) => action.would_write).length,
    will_write: actions.filter((action) => action.will_write).length,
    destructive: actions.filter((action) => action.destructive).length,
    managed: actions.filter((action) => action.managed).length
  };
}

export function buildUpgradePlan(root: string, actions: ManagedAction[], { dryRun = false, mergeAgentRoute = false } = {}): UpgradePlan {
  const enrichedActions = actions.map((action) => enrichUpgradeAction(root, action, { dryRun }));
  return {
    schema_version: "opennori/upgrade-plan-v1",
    root,
    dry_run: dryRun,
    merge_agent_route: mergeAgentRoute,
    summary: summarizeUpgradePlan(enrichedActions),
    actions: enrichedActions
  };
}

export function isWritingUpgradeAction(action: string): boolean {
  return WRITING_UPGRADE_ACTIONS.has(action);
}
