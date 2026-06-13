import path from "node:path";
import type { ManagedAction } from "../types.ts";
import {
  AGENT_ROUTE_END,
  AGENT_ROUTE_START,
  agentGuidePath,
  renderAgentGuideMarkdown,
  renderAgentRouteMarkdown,
  renderAgentRouteSectionMarkdown
} from "../architecture.ts";
import {
  ensureDir,
  writeAgentRoute,
  writeIfSafe
} from "./managed-files.ts";
import { writeManifest } from "./manifest.ts";
import { protocolTemplate } from "./shared.ts";

type InstallOptions = {
  dryRun?: boolean;
  force?: boolean;
  mergeAgentRoute?: boolean;
};

export function installActions(root: string, { dryRun = false, force = false, mergeAgentRoute = false }: InstallOptions = {}): ManagedAction[] {
  const actions: ManagedAction[] = [
    ensureDir(path.join(root, ".opennori", "active"), { dryRun }),
    ensureDir(path.join(root, ".opennori", "completed"), { dryRun }),
    ensureDir(path.join(root, ".opennori", "blocked"), { dryRun }),
    ensureDir(path.join(root, ".opennori", "reports"), { dryRun }),
    ensureDir(path.join(root, ".opennori", "brainstorms"), { dryRun }),
    ensureDir(path.join(root, ".opennori", "architecture"), { dryRun }),
    ensureDir(path.join(root, ".opennori", "architecture", "profiles"), { dryRun }),
    ensureDir(path.join(root, ".opennori", "architecture", "challenges"), { dryRun }),
    ensureDir(path.join(root, ".opennori", "architecture", "decisions"), { dryRun }),
    ensureDir(path.join(root, ".opennori", "architecture", "evidence"), { dryRun }),
    writeIfSafe(path.join(root, ".opennori", "protocol.md"), protocolTemplate(), { dryRun, force, kind: "protocol" }),
    writeIfSafe(agentGuidePath(root), renderAgentGuideMarkdown(), { dryRun, force, kind: "agent-guide" })
  ];

  if (mergeAgentRoute) {
    const agentRouteSection = renderAgentRouteSectionMarkdown();
    actions.push(
      writeAgentRoute(path.join(root, "AGENTS.md"), renderAgentRouteMarkdown("AGENTS"), agentRouteSection, { dryRun, force, merge: true, kind: "agent-route", managed: true, startMarker: AGENT_ROUTE_START, endMarker: AGENT_ROUTE_END }),
      writeAgentRoute(path.join(root, "CLAUDE.md"), renderAgentRouteMarkdown("CLAUDE"), agentRouteSection, { dryRun, force, merge: true, kind: "agent-route", managed: true, startMarker: AGENT_ROUTE_START, endMarker: AGENT_ROUTE_END })
    );
  }

  actions.push(writeManifest(root, { dryRun }));
  return actions;
}
