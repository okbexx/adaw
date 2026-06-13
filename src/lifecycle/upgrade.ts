import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  AGENT_ROUTE_END,
  AGENT_ROUTE_START,
  agentGuidePath,
  renderAgentGuideMarkdown,
  renderAgentRouteMarkdown,
  renderAgentRouteSectionMarkdown
} from "../architecture.ts";
import { fileHash, managedSectionBounds, upsertManagedSection } from "./managed-files.ts";
import { safeReadManifest, writeManifest } from "./manifest.ts";
import { isWritingUpgradeAction } from "./plans.ts";
import {
  NORI_CAPABILITIES,
  PACKAGE_JSON,
  manifestPath,
  protocolTemplate,
  sameStringSet
} from "./shared.ts";
import type { ManagedAction } from "../types.ts";

export function applyUpgradeActions(actions: ManagedAction[]): void {
  for (const action of actions) {
    if (isWritingUpgradeAction(action.action) && action.write) action.write();
  }
}

export function upgradeActions(
  root: string,
  {
    mergeAgentRoute = false
  } = {}
): ManagedAction[] {
  const existingManifest = safeReadManifest(root);
  const actions: ManagedAction[] = [];
  const protocolPath = path.join(root, ".opennori", "protocol.md");
  const protocolContent = protocolTemplate();

  if (existingManifest) {
    actions.push({
      path: manifestPath(root),
      action: existingManifest.opennori_version === PACKAGE_JSON.version && sameStringSet(existingManifest.capabilities, NORI_CAPABILITIES)
        ? "current"
        : "update",
      kind: "manifest",
      managed: true,
      from_version: existingManifest.opennori_version,
      to_version: PACKAGE_JSON.version,
      write: () => writeManifest(root)
    });
  } else {
    actions.push({
      path: manifestPath(root),
      action: "missing",
      kind: "manifest",
      managed: true,
      to_version: PACKAGE_JSON.version
    });
  }

  if (fs.existsSync(protocolPath)) {
    const currentHash = fileHash(protocolPath);
    const expectedHash = createHash("sha256").update(protocolContent).digest("hex");
    actions.push({
      path: protocolPath,
      action: currentHash === expectedHash ? "current" : "overwrite",
      kind: "protocol",
      managed: true,
      write: () => {
        fs.mkdirSync(path.dirname(protocolPath), { recursive: true });
        fs.writeFileSync(protocolPath, protocolContent);
      }
    });
  } else {
    actions.push({
      path: protocolPath,
      action: "missing",
      kind: "protocol",
      managed: true
    });
  }

  const guidePath = agentGuidePath(root);
  const agentGuideContent = renderAgentGuideMarkdown();
  if (fs.existsSync(guidePath)) {
    const currentHash = fileHash(guidePath);
    const expectedHash = createHash("sha256").update(agentGuideContent).digest("hex");
    actions.push({
      path: guidePath,
      action: currentHash === expectedHash ? "current" : "overwrite",
      kind: "agent-guide",
      managed: true,
      write: () => {
        fs.mkdirSync(path.dirname(guidePath), { recursive: true });
        fs.writeFileSync(guidePath, agentGuideContent);
      }
    });
  } else {
    actions.push({
      path: guidePath,
      action: "missing",
      kind: "agent-guide",
      managed: true
    });
  }

  if (mergeAgentRoute) {
    for (const [agentName, routePath] of [
      ["AGENTS", path.join(root, "AGENTS.md")],
      ["CLAUDE", path.join(root, "CLAUDE.md")]
    ] as const) {
      const routeContent = renderAgentRouteMarkdown(agentName);
      const routeSection = renderAgentRouteSectionMarkdown();
      if (!fs.existsSync(routePath)) {
        actions.push({
          path: routePath,
          action: "missing",
          kind: "agent-route",
          managed: true
        });
        continue;
      }
      const current = fs.readFileSync(routePath, "utf8");
      const bounds = managedSectionBounds(current, AGENT_ROUTE_START, AGENT_ROUTE_END);
      const alreadyReferences = current.includes(".opennori/architecture/baseline.md");
      const merged = bounds || !alreadyReferences
        ? upsertManagedSection(current, routeSection, AGENT_ROUTE_START, AGENT_ROUTE_END)
        : current;
      actions.push({
        path: routePath,
        action: merged === current ? "current" : "merge",
        kind: "agent-route",
        managed: true,
        write: () => {
          if (!fs.existsSync(routePath)) {
            fs.mkdirSync(path.dirname(routePath), { recursive: true });
            fs.writeFileSync(routePath, routeContent);
            return;
          }
          fs.writeFileSync(routePath, upsertManagedSection(fs.readFileSync(routePath, "utf8"), routeSection, AGENT_ROUTE_START, AGENT_ROUTE_END));
        }
      });
    }
  }

  const manifestAction = actions.find((action) => action.kind === "manifest");
  const refreshesManagedAssets = actions.some((action) => action.kind !== "manifest" && isWritingUpgradeAction(action.action));
  if (manifestAction && manifestAction.action === "current" && refreshesManagedAssets) {
    manifestAction.action = "update";
    manifestAction.reason = "OpenNori manifest will be refreshed after managed assets are upgraded.";
  }

  return actions;
}
