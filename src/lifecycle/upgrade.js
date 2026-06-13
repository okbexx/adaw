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
} from "../architecture.js";
import { SKILL_PACK, skillPackMarkdowns } from "../skills.js";
import { fileHash, managedSectionBounds, upsertManagedSection } from "./managed-files.js";
import { safeReadManifest, writeManifest } from "./manifest.js";
import { isWritingUpgradeAction } from "./plans.js";
import {
  NORI_CAPABILITIES,
  PACKAGE_JSON,
  manifestPath,
  protocolTemplate,
  sameStringSet,
  skillPackPath
} from "./shared.js";

export function applyUpgradeActions(actions) {
  for (const action of actions) {
    if (isWritingUpgradeAction(action.action) && action.write) action.write();
  }
}

export function upgradeActions(
  root,
  {
    requestedSkill = false,
    mergeAgentRoute = false
  } = {}
) {
  const existingManifest = safeReadManifest(root);
  const actions = [];
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
    ]) {
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

  if (requestedSkill) {
    const markdowns = skillPackMarkdowns();
    for (const skill of SKILL_PACK) {
      const target = skillPackPath(root, skill.name);
      if (!fs.existsSync(target)) {
        actions.push({ path: target, action: "missing", kind: "skill", managed: true });
        continue;
      }
      const expectedHash = createHash("sha256").update(markdowns[skill.name]).digest("hex");
      const currentHash = fileHash(target);
      actions.push({
        path: target,
        action: currentHash === expectedHash ? "current" : "overwrite",
        kind: "skill",
        managed: true,
        write: () => {
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, markdowns[skill.name]);
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
