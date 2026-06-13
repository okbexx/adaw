import type {
  CompletionAnswer,
  EvidenceLedger,
  EvidenceRecord,
  EvidenceSource,
  NoriContract,
  NextRecommendation,
  UserIntervention
} from "../types.ts";
import { evidenceHealth, currentGap, evidenceView } from "./evidence.ts";
import { profileCompliance, renderProfileLines } from "./profile.ts";
import { inferCriterionLayer } from "./shared.ts";

export function intervention(contract: NoriContract, ledger: EvidenceLedger): UserIntervention {
  const compliance = profileCompliance(ledger);
  if (compliance.required && !compliance.complete) {
    const item = compliance.blocking[0];
    if (!item) {
      return {
        required: true,
        action: "Capability profile compliance is incomplete; inspect Nori Profile evidence."
      };
    }
    return {
      required: true,
      criterion: `PROFILE-${item.id}`,
      user_story: `作为用户，我需要确认 agent 是否必须遵守能力偏好：${item.name}。`,
      action: item.status === "violated"
        ? `Capability profile item ${item.name} was violated. Waive it or revise the work.`
        : `Provide evidence that Nori Profile item ${item.name} was satisfied, or waive it.`
    };
  }

  for (const criterion of contract.criteria) {
    const state = ledger.criteria[criterion.id];
    if (state?.status === "blocked") {
      const latest = state.evidence?.at(-1);
      return {
        required: true,
        criterion: criterion.id,
        user_story: criterion.user_story,
        action: latest?.summary || "Provide the decision, permission, input, or external condition needed to unblock this criterion."
      };
    }
  }

  return {
    required: false,
    action: "No user intervention is currently required."
  };
}

export function completionAnswer(contract: NoriContract, ledger: EvidenceLedger): CompletionAnswer {
  const gap = currentGap(contract, ledger);
  const health = evidenceHealth(contract, ledger);
  if (!gap && ledger.status === "complete" && health.status !== "clear") {
    return {
      complete: false,
      answer: `Not confidently complete: ${health.summary}`
    };
  }
  if (!gap && ledger.status === "complete") {
    return {
      complete: true,
      answer: "Complete: all required acceptance criteria have passing or waived evidence."
    };
  }
  return {
    complete: false,
    answer: `Not complete: ${gap ? `${gap.id} is ${gap.status}. ${gap.reason}` : `workflow status is ${ledger.status}.`}`
  };
}

export function nextRecommendation(contract: NoriContract, ledger: EvidenceLedger): NextRecommendation {
  const gap = currentGap(contract, ledger);
  const needed = intervention(contract, ledger);
  const health = evidenceHealth(contract, ledger);

  if (needed.required) {
    return {
      status: "user-intervention-required",
      focus: needed.criterion || null,
      summary: `${needed.criterion || "OpenNori"} needs user input before the agent continues.`,
      actions: [
        needed.action,
        "After the decision or external condition is available, record evidence and rerun OpenNori status."
      ]
    };
  }

  if (gap) {
    if (gap.id === "ACCEPTANCE-BASIS") {
      return {
        status: "acceptance-approval-required",
        focus: gap.id,
        summary: "Acceptance criteria need user approval or revision before implementation work counts as complete.",
        actions: [
          "Ask the user to approve or revise the acceptance criteria before implementation work continues."
        ]
      };
    }

    return {
      status: "work-on-current-gap",
      focus: gap.id,
      summary: `Continue with ${gap.id}: ${gap.user_story}`,
      actions: [
        `Create or collect reviewable evidence for ${gap.id}.`,
        `Record the result for ${gap.id}, then rerun OpenNori status.`
      ]
    };
  }

  if (ledger.status === "complete" && health.status !== "clear") {
    return {
      status: "evidence-review-required",
      focus: null,
      summary: "All required ACs have passing or waived evidence, but evidence health needs review before confidently claiming completion.",
      actions: [
        "Review evidence_health findings.",
        "Refresh stale, broad, or summary-only evidence with reviewable sources, reviewability, and limitations."
      ]
    };
  }

  if (ledger.status === "complete") {
    return {
      status: "ready-for-next-loop",
      focus: null,
      summary: "This OpenNori goal is complete. If the user has asked to continue, start the next acceptance loop without waiting for another next-step prompt.",
      actions: [
        "Report the completion evidence briefly.",
        "Select the next human-facing project goal from the current context, draft acceptance criteria, and continue the OpenNori loop."
      ]
    };
  }

  return {
    status: "reconcile-workflow-state",
    focus: null,
    summary: `No current gap was found, but workflow status is ${ledger.status}.`,
    actions: [
      "Run OpenNori evaluate and doctor, then inspect the report before continuing."
    ]
  };
}

function escapeTableCell(value: unknown): string {
  return String(value || "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

function formatEvidenceValue(value: unknown): string {
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatEvidenceSource(source: EvidenceSource | string): string {
  if (!source) return "<none>";
  if (typeof source === "string") return source;
  const preferredKeys = ["type", "label", "command", "path", "url", "outcome", "summary"];
  const sourceRecord = source as EvidenceSource;
  const parts: string[] = [];
  for (const key of preferredKeys) {
    if (sourceRecord[key]) parts.push(`${key}=${formatEvidenceValue(sourceRecord[key])}`);
  }
  for (const [key, value] of Object.entries(sourceRecord)) {
    if (!preferredKeys.includes(key) && value !== undefined && value !== null && String(value).trim() !== "") {
      parts.push(`${key}=${formatEvidenceValue(value)}`);
    }
  }
  return parts.join(", ") || "<none>";
}

function formatEvidenceSources(evidence: EvidenceRecord | null | undefined): string {
  const view = evidenceView(evidence);
  if (!view) return "<none>";
  if (view.sources.length === 0) return view.path || "<none>";
  return view.sources.map((source) => formatEvidenceSource(source)).join("; ");
}

export function renderReport(contract: NoriContract, ledger: EvidenceLedger): string {
  const gap = currentGap(contract, ledger);
  const needed = intervention(contract, ledger);
  const completion = completionAnswer(contract, ledger);
  const health = evidenceHealth(contract, ledger);
  const lines = [
    `# ${contract.goal_id} Acceptance Report`,
    "",
    "## Decision Summary",
    "",
    `Completion: ${completion.answer}`,
    `Current gap: ${gap ? `${gap.id} - ${gap.reason}` : "None. All required acceptance criteria have passing or waived evidence."}`,
    `User intervention: ${needed.required ? `${needed.criterion} - ${needed.action}` : needed.action}`,
    `Recommended next action: ${nextRecommendation(contract, ledger).summary}`,
    `Workflow status: ${ledger.status}`,
    "",
    "## Goal",
    "",
    contract.goal,
    "",
    "## Acceptance Basis",
    "",
    `Status: ${contract.acceptance_basis?.status || "draft"}`,
    contract.acceptance_basis?.summary ? `Summary: ${contract.acceptance_basis.summary}` : "Summary: <none>",
    "",
    "## Nori Profile",
    "",
    ...renderProfileLines(ledger),
    "",
    "## Acceptance Status",
    "",
    "| ID | Layer | User acceptance criterion | Status | Confidence | Evidence summary | Basis | Sources | Reviewability | Limitations |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  ];

  for (const criterion of contract.criteria) {
    const state = ledger.criteria[criterion.id];
    const latest = state?.evidence?.at(-1);
    const view = evidenceView(latest);
    const evidence = view ? `${view.kind}: ${view.summary}` : "<none>";
    lines.push(`| ${criterion.id} | ${criterion.layer || inferCriterionLayer(criterion.id)} | ${escapeTableCell(criterion.user_story)} | ${state?.status || "unknown"} | ${state?.confidence || "none"} | ${escapeTableCell(evidence)} | ${view?.basis || "<none>"} | ${escapeTableCell(formatEvidenceSources(latest))} | ${view?.reviewability || "<none>"} | ${escapeTableCell(view?.limitations || "<none>")} |`);
  }

  lines.push("", "## Current Acceptance Gap", "");
  lines.push(gap ? `${gap.id} - ${gap.reason}` : "None. All required acceptance criteria have passing or waived evidence.");
  lines.push("", "## Evidence Health", "");
  lines.push(`Status: ${health.status}`);
  lines.push(`Summary: ${health.summary}`);
  if (health.findings.length > 0) {
    lines.push("", "| Criterion | Severity | Issue | Message | Recovery |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const finding of health.findings) {
      lines.push(`| ${finding.criterion_id} | ${finding.severity} | ${finding.issue} | ${escapeTableCell(finding.message)} | ${escapeTableCell(finding.recovery)} |`);
    }
  }
  lines.push("", "## User Intervention", "");
  lines.push(needed.required ? `${needed.criterion} - ${needed.action}` : needed.action);
  lines.push("", "## Conclusion", "", `Current status: ${ledger.status}`);
  return `${lines.join("\n")}\n`;
}
