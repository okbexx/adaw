import { defineCommand } from "citty";
import { auditAcceptanceQuality } from "../../acceptance.js";
import { architectureState } from "../../architecture.js";
import { currentGap, evidenceHealth, fail, ok, validateContract } from "../../core.js";
import { type ActiveGoalRuntime, runJsonCommand } from "../runtime.ts";

export const checkCommand = defineCommand({
  meta: {
    name: "check",
    description: "Validate active OpenNori contract quality, architecture health, and evidence health."
  },
  args: {
    root: {
      type: "string",
      description: "Project root.",
      default: process.cwd()
    },
    goal: {
      type: "string",
      description: "Active goal id to inspect."
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ data }) {
    const { contract, ledger, root } = data.loadPair();
    const issues = validateContract(contract, ledger);
    if (issues.length > 0) {
      return { ...fail("invalid_acceptance", "Acceptance contract failed validation", "Fix reported issues before continuing"), issues };
    }
    const acceptanceQuality = auditAcceptanceQuality(contract);
    const warnings = acceptanceQuality.findings.map((finding) => ({
      type: "acceptance_quality",
      criterion_id: finding.criterion_id,
      gap_id: finding.gap_id,
      message: finding.question
    }));
    const nextActions = acceptanceQuality.status === "needs-user-review"
      ? ["Ask the user the acceptance_quality questions, then revise the affected criteria before relying on this contract as complete."]
      : [];
    const architecture = architectureState(root, contract.goal_id);
    const architectureWarnings = [];
    if (architecture.decision === "missing") {
      architectureWarnings.push({
        type: "architecture",
        message: "Active goal has no Architecture Baseline.",
        recovery: "Preview an Architecture Baseline, show it to the user, then rerun opennori architecture baseline --root <project> --goal <goal> --confirm --json after confirmation."
      });
    }
    if (architecture.decision === "draft") {
      architectureWarnings.push({
        type: "architecture",
        message: "Architecture Baseline is still draft.",
        recovery: "Ask the user to confirm or revise the baseline before implementation."
      });
    }
    if (architecture.decision === "invalid") {
      architectureWarnings.push({
        type: "architecture",
        message: "Architecture Baseline is invalid.",
        recovery: "Inspect .opennori/architecture/baseline.json, fix the reported issues, then rerun opennori check."
      });
    }
    if (architecture.decision === "challenged") {
      architectureWarnings.push({
        type: "architecture",
        message: "Architecture Baseline has open challenges.",
        recovery: "Ask the user to resolve the Architecture Challenge before claiming architecture completion."
      });
    }
    if (!architecture.agent_surface.guide.installed || !architecture.agent_surface.guide.in_sync) {
      architectureWarnings.push({
        type: "architecture",
        message: ".opennori/agent-guide.md is missing or stale.",
        recovery: "Preview opennori install --root <project> --merge-agent-route --dry-run --json, then confirm the refresh if acceptable."
      });
    }
    if (!architecture.agent_surface.agents.references_baseline && !architecture.agent_surface.claude.references_baseline) {
      architectureWarnings.push({
        type: "architecture",
        message: "No project agent route references the Architecture Baseline.",
        recovery: "Preview opennori install --root <project> --merge-agent-route --dry-run --json, then confirm the non-destructive merge if acceptable."
      });
    }
    const architectureStatus = architectureWarnings.length > 0 ? "needs-action" : "clear";
    const buildVsBuyWarnings = architecture.build_vs_buy.findings.map((finding) => ({
      type: "build_vs_buy",
      decision_id: finding.decision_id,
      severity: finding.severity,
      issue: finding.issue,
      message: finding.message,
      recovery: finding.recovery
    }));
    const health = evidenceHealth(contract, ledger);
    const evidenceHealthWarnings = health.findings.map((finding) => ({
      type: "evidence_health",
      criterion_id: finding.criterion_id,
      severity: finding.severity,
      issue: finding.issue,
      message: finding.message,
      recovery: finding.recovery
    }));
    const combinedWarnings = [...warnings, ...architectureWarnings, ...buildVsBuyWarnings, ...evidenceHealthWarnings];
    if (architectureStatus === "needs-action") {
      nextActions.push("Resolve architecture_check warnings before treating this goal as architecture-complete.");
    }
    if (architecture.build_vs_buy.status !== "clear") {
      nextActions.push("Resolve build_vs_buy warnings before treating custom infrastructure as mature.");
    }
    if (health.status !== "clear") {
      nextActions.push("Review evidence_health warnings before treating this goal as confidently complete.");
    }
    return ok({
      goal_id: contract.goal_id,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger),
      statuses: Object.fromEntries(Object.entries(ledger.criteria).map(([id, state]) => [id, (state as any).status])),
      acceptance_quality: acceptanceQuality,
      architecture_check: {
        status: architectureStatus,
        decision: architecture.decision,
        warnings: architectureWarnings,
        architecture
      },
      evidence_health: health
    }, [], combinedWarnings, nextActions);
  }
});

export async function runCheckCommand(rawArgs: string[], { loadPair }: ActiveGoalRuntime) {
  return runJsonCommand(checkCommand, rawArgs, { loadPair });
}
