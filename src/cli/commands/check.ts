import { defineCommand } from "citty";
import { reviewAcceptanceQuality } from "../../acceptance.ts";
import { architectureState } from "../../architecture.ts";
import { currentGap, evidenceHealth, fail, ok, profileCompliance, validateContract } from "../../core.ts";
import type { JsonObject } from "../../types.ts";
import { activeGoalArgs, type ActiveGoalRuntime, runJsonCommand } from "../runtime.ts";

export const checkCommand = defineCommand({
  meta: {
    name: "check",
    description: "Validate active OpenNori contract quality, architecture health, and evidence health."
  },
  args: {
    ...activeGoalArgs,
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ args, data }) {
    const { contract, ledger, root } = data.loadPair(args);
    const issues = validateContract(contract, ledger);
    if (issues.length > 0) {
      return { ...fail("invalid_acceptance", "Acceptance contract failed validation", "Fix reported issues before continuing"), issues };
    }
    const acceptanceReview = reviewAcceptanceQuality(contract);
    const warnings = acceptanceReview.findings.map((finding: JsonObject) => ({
      type: "acceptance_review",
      criterion_id: finding.criterion_id,
      gap_id: finding.gap_id,
      message: finding.question,
      agent_guidance: finding.agent_guidance,
      source: finding.source
    }));
    const nextActions = acceptanceReview.status === "needs-user-review"
      ? ["Show acceptance_review questions to the user, then revise criteria, record assumptions, or accept the review risk before claiming confident completion."]
      : [];
    const architecture = architectureState(root, contract.goal_id);
    const architectureWarnings: JsonObject[] = [];
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
    const architectureStatus = architectureWarnings.length > 0 ? "needs-action" : "clear";
    const buildVsBuyWarnings = architecture.build_vs_buy.findings.map((finding: JsonObject) => ({
      type: "build_vs_buy",
      decision_id: finding.decision_id,
      severity: finding.severity,
      issue: finding.issue,
      message: finding.message,
      recovery: finding.recovery
    }));
    const health = evidenceHealth(contract, ledger, { root });
    const evidenceHealthWarnings = health.findings.map((finding: JsonObject) => ({
      type: "evidence_health",
      criterion_id: finding.criterion_id,
      severity: finding.severity,
      issue: finding.issue,
      message: finding.message,
      recovery: finding.recovery
    }));
    const profile = profileCompliance(ledger);
    const profileWarnings = profile.review.map((item: JsonObject) => ({
      type: "profile_review",
      item_id: item.id,
      strength: item.strength,
      status: item.status,
      message: `Nori Profile item ${item.name} is ${item.status}.`,
      recovery: "Record profile evidence, waive the preference, or ask the user whether the remaining profile risk is acceptable."
    }));
    const combinedWarnings = [...warnings, ...architectureWarnings, ...buildVsBuyWarnings, ...evidenceHealthWarnings, ...profileWarnings];
    if (architectureStatus === "needs-action") {
      nextActions.push("Resolve architecture_check warnings before treating this goal as architecture-complete.");
    }
    if (architecture.build_vs_buy.status !== "clear") {
      nextActions.push("Resolve build_vs_buy warnings before treating custom infrastructure as mature.");
    }
    if (health.status !== "clear") {
      nextActions.push("Review evidence_health warnings before treating this goal as confidently complete.");
    }
    if (profile.review.length > 0) {
      nextActions.push("Review profile_review warnings before treating this goal as confidently complete.");
    }
    return ok({
      goal_id: contract.goal_id,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger),
      statuses: Object.fromEntries(Object.entries(ledger.criteria).map(([id, state]) => [id, (state as any).status])),
      acceptance_review: acceptanceReview,
      capability_compliance: profile,
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
