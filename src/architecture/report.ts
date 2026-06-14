import { renderReport } from "../core.ts";
import type { EvidenceLedger, NoriContract } from "../types.ts";
import { architectureState } from "./state.ts";

function renderArchitectureReportSection(root: string, goalId: string | undefined = undefined): string {
  const state = architectureState(root, goalId);
  const lines = [
    "## Architecture Baseline",
    "",
    `Architecture decision: ${state.decision}`,
    `Baseline: ${state.baseline ? `${state.baseline.profile} (${state.baseline.status})` : "<missing>"}`,
    `Challenge: ${state.open_challenges.length > 0 ? `${state.open_challenges.length} open` : "none"}`,
    `Build-vs-buy: ${state.build_vs_buy.status} (${state.build_vs_buy_decisions.length} decisions)`,
    `Agent guide: ${state.agent_surface.guide.installed ? "installed" : "missing"}`,
    "",
    "Paths:",
    `- ${state.paths.baseline_markdown}`,
    `- ${state.paths.agent_guide}`,
    ""
  ];
  if (state.open_challenges.length > 0) {
    lines.push("Open challenges:");
    for (const challenge of state.open_challenges) {
      lines.push(`- ${challenge.id}: ${challenge.summary || "<none>"}`);
    }
    lines.push("");
  }
  if (state.build_vs_buy.findings.length > 0) {
    lines.push("Build-vs-buy findings:");
    for (const finding of state.build_vs_buy.findings) {
      lines.push(`- ${finding.decision_id}: ${finding.message}`);
    }
    lines.push("");
  }
  if (state.issues.length > 0) {
    lines.push("Issues:");
    for (const issue of state.issues) {
      lines.push(`- ${issue.path}: ${issue.message}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function renderReportWithArchitecture(root: string, contract: NoriContract, ledger: EvidenceLedger): string {
  const architecture = architectureState(root, contract.goal_id);
  const base = renderReport(contract, ledger, { root, architecture }).trimEnd();
  return `${base}\n\n${renderArchitectureReportSection(root, contract.goal_id).trimEnd()}\n`;
}
