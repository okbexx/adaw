import path from "node:path";
import {
  AGENT_ROUTE_END,
  AGENT_ROUTE_START,
  agentGuidePath,
  renderAgentGuideMarkdown,
  renderAgentRouteMarkdown,
  renderAgentRouteSectionMarkdown
} from "../architecture.js";
import { SKILL_PACK, skillPackMarkdowns } from "../skills.js";
import {
  ensureDir,
  writeAgentRoute,
  writeGeneratedFile,
  writeIfSafe
} from "./managed-files.js";
import { writeManifest } from "./manifest.js";
import { protocolTemplate, skillPackPath } from "./shared.js";

function skillPackInstallActions(root, { dryRun = false, force = false, refresh = false } = {}) {
  const markdowns = skillPackMarkdowns();
  return SKILL_PACK.map((skill) => writeGeneratedFile(
    skillPackPath(root, skill.name),
    markdowns[skill.name],
    { dryRun, force, refresh, kind: "skill" }
  ));
}

export function installActions(root, { dryRun = false, force = false, requestedSkill = false, refreshSkill = false, mergeAgentRoute = false } = {}) {
  const agentRouteSection = renderAgentRouteSectionMarkdown();
  const actions = [
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
    writeIfSafe(agentGuidePath(root), renderAgentGuideMarkdown(), { dryRun, force, kind: "agent-guide" }),
    writeAgentRoute(path.join(root, "AGENTS.md"), renderAgentRouteMarkdown("AGENTS"), agentRouteSection, { dryRun, force, merge: mergeAgentRoute, kind: "agent-route", managed: true, startMarker: AGENT_ROUTE_START, endMarker: AGENT_ROUTE_END }),
    writeAgentRoute(path.join(root, "CLAUDE.md"), renderAgentRouteMarkdown("CLAUDE"), agentRouteSection, { dryRun, force, merge: mergeAgentRoute, kind: "agent-route", managed: true, startMarker: AGENT_ROUTE_START, endMarker: AGENT_ROUTE_END })
  ];

  if (requestedSkill) {
    actions.push(...skillPackInstallActions(root, { dryRun, force, refresh: refreshSkill }));
  }
  actions.push(writeManifest(root, { dryRun }));
  return actions;
}
