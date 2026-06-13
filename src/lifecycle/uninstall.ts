import fs from "node:fs";
import path from "node:path";
import type { ManagedAction } from "../types.ts";

function plannedDelete(root: string, relativePath: string, kind: string, { recursive = false, reason = undefined as string | undefined } = {}): ManagedAction {
  const target = path.join(root, relativePath);
  const exists = fs.existsSync(target);
  return {
    path: target,
    kind,
    action: exists ? (recursive ? "delete-tree" : "delete") : "absent",
    managed: true,
    recursive,
    reason
  };
}

function plannedPreserve(root: string, relativePath: string, kind: string, reason: string): ManagedAction {
  return {
    path: path.join(root, relativePath),
    kind,
    action: "preserve",
    managed: true,
    recursive: false,
    reason
  };
}

export function buildUninstallActions(root: string, { includeState = false } = {}): ManagedAction[] {
  const actions: ManagedAction[] = [];

  if (includeState) {
    actions.push(plannedDelete(root, ".opennori", "state-directory", {
      recursive: true,
      reason: "Full OpenNori state removal was requested with --include-state."
    }));
    return actions;
  }

  actions.push(
    plannedDelete(root, ".opennori/manifest.json", "manifest"),
    plannedPreserve(root, ".opennori/protocol.md", "protocol", "Protocol is preserved unless --include-state is provided."),
    plannedPreserve(root, ".opennori/agent-guide.md", "agent-guide", "Agent guide is preserved unless --include-state is provided."),
    plannedPreserve(root, ".opennori/architecture", "architecture-state", "Architecture Baselines, challenges, decisions, and evidence are preserved unless --include-state is provided."),
    plannedPreserve(root, ".opennori/active", "active-goals", "Active goals and evidence are preserved unless --include-state is provided."),
    plannedPreserve(root, ".opennori/reports", "reports", "Acceptance reports are preserved unless --include-state is provided."),
    plannedPreserve(root, ".opennori/completed", "completed-archive", "Completed archives are preserved unless --include-state is provided."),
    plannedPreserve(root, ".opennori/blocked", "blocked-archive", "Blocked archives are preserved unless --include-state is provided."),
    plannedPreserve(root, ".opennori/brainstorms", "brainstorms", "Brainstorms are preserved unless --include-state is provided.")
  );
  return actions;
}

export function applyUninstallActions(actions: ManagedAction[]): void {
  for (const action of actions) {
    if (action.action === "delete") {
      fs.rmSync(action.path, { force: true });
    }
    if (action.action === "delete-tree") {
      fs.rmSync(action.path, { recursive: true, force: true });
    }
  }
}
