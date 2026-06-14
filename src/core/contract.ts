import fs from "node:fs";
import type {
  AcceptanceCriterion,
  EvidenceLedger,
  NoriBrief,
  NoriContract,
  ParsedAcceptanceMarkdown,
  ValidationIssue
} from "../types.ts";
import { renderProfileLines, VALID_PROFILE_ITEM_TYPES, VALID_PROFILE_STRENGTHS } from "./profile.ts";
import { inferCriterionLayer, nowIso, slugify, PROTOCOL_VERSION } from "./shared.ts";

export const VALID_STATUSES = new Set(["unknown", "failing", "passing", "blocked", "waived"]);

const PLAN_FIELD_NAMES = new Set(["plan", "steps", "tasks", "todos", "next_steps", "implementation_plan"]);

export function buildContractFromBrief(brief: NoriBrief): NoriContract {
  const goal = String(brief.goal || "").trim();
  const goalId = slugify(brief.goal_id || goal.slice(0, 60));
  const criteria: AcceptanceCriterion[] = (brief.criteria || []).map((criterion, index) => ({
    id: String(criterion.id || `AC-${index + 1}`),
    layer: String(criterion.layer || inferCriterionLayer(criterion.id || `AC-${index + 1}`)),
    user_story: String(criterion.user_story || "").trim(),
    measurement: String(criterion.measurement || "").trim(),
    threshold: String(criterion.threshold || "").trim(),
    required: criterion.required !== false,
    risk: criterion.risk || "medium"
  }));

  return {
    protocol_version: PROTOCOL_VERSION,
    goal_id: goalId,
    goal,
    created_at: nowIso(),
    acceptance_basis: brief.acceptance_basis || { status: "draft" },
    criteria
  };
}

export function buildEvidenceLedger(contract: NoriContract): EvidenceLedger {
  const criteria: EvidenceLedger["criteria"] = {};
  for (const criterion of contract.criteria) {
    criteria[criterion.id] = {
      status: "unknown",
      confidence: "none",
      required: criterion.required !== false,
      risk: criterion.risk || "medium",
      evidence: []
    };
  }

  return {
    protocol_version: PROTOCOL_VERSION,
    goal_id: contract.goal_id,
    status: "active",
    updated_at: nowIso(),
    criteria,
    capability_profile: {
      items: [],
      evidence: []
    }
  };
}

export function renderAcceptanceMarkdown(contract: NoriContract, ledger: EvidenceLedger): string {
  const lines = [
    `# ${contract.goal_id} Acceptance Contract`,
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
    "## User Acceptance Criteria",
    "",
    "| ID | Layer | User acceptance criterion | Measurement | Passing threshold | Status |",
    "| --- | --- | --- | --- | --- | --- |"
  ];

  for (const criterion of contract.criteria) {
    const status = ledger.criteria[criterion.id]?.status || "unknown";
    lines.push(`| ${criterion.id} | ${criterion.layer || inferCriterionLayer(criterion.id)} | ${criterion.user_story} | ${criterion.measurement} | ${criterion.threshold} | ${status} |`);
  }

  lines.push(
    "",
    "## Rule",
    "",
    "Progress is determined by acceptance evidence, not by implementation steps."
  );

  return `${lines.join("\n")}\n`;
}

export function syncAcceptanceMarkdown(acceptancePath: string, contract: NoriContract, ledger: EvidenceLedger): void {
  fs.writeFileSync(acceptancePath, renderAcceptanceMarkdown(contract, ledger));
}

export function parseAcceptanceMarkdown(markdown: string): ParsedAcceptanceMarkdown {
  const goalMatch = markdown.match(/## Goal\s+([\s\S]*?)(?:\n## Acceptance Basis|\n## User Acceptance Criteria)/);
  const tableMatch = markdown.match(/## User Acceptance Criteria\s+([\s\S]*?)(?:\n## |\n$)/);
  const goal = goalMatch?.[1]?.trim() || "";
  const criteria: ParsedAcceptanceMarkdown["criteria"] = [];

  if (tableMatch) {
    for (const line of (tableMatch[1] || "").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("|") || trimmed.includes("---") || trimmed.includes("User acceptance criterion")) {
        continue;
      }
      const cells = trimmed.split("|").slice(1, -1).map((cell: string) => cell.trim());
      if (cells.length >= 6) {
        criteria.push({
          id: cells[0] || "",
          layer: cells[1] || "",
          user_story: cells[2] || "",
          measurement: cells[3] || "",
          threshold: cells[4] || "",
          status: cells[5] || "unknown"
        });
      } else if (cells.length >= 5) {
        criteria.push({
          id: cells[0] || "",
          layer: inferCriterionLayer(cells[0] || ""),
          user_story: cells[1] || "",
          measurement: cells[2] || "",
          threshold: cells[3] || "",
          status: cells[4] || "unknown"
        });
      }
    }
  }

  return { goal, criteria };
}

export function validateContractIntegrity(contract: NoriContract, ledger: EvidenceLedger | null = null): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (contract.protocol_version !== PROTOCOL_VERSION) {
    issues.push({ path: "protocol_version", message: `Must be ${PROTOCOL_VERSION}` });
  }
  if (!contract.goal) {
    issues.push({ path: "goal", message: "Goal is required" });
  }
  for (const field of Object.keys(contract)) {
    if (PLAN_FIELD_NAMES.has(field)) {
      issues.push({ path: field, message: "OpenNori contract must not expose process-plan fields" });
    }
  }
  if (!Array.isArray(contract.criteria) || contract.criteria.length === 0) {
    issues.push({ path: "criteria", message: "At least one user acceptance criterion is required" });
    return issues;
  }

  const ids = new Set<string>();
  contract.criteria.forEach((criterion, index) => {
    const prefix = `criteria[${index}]`;
    if (!criterion.id) {
      issues.push({ path: `${prefix}.id`, message: "Criterion id is required" });
    } else if (ids.has(criterion.id)) {
      issues.push({ path: `${prefix}.id`, message: `Duplicate criterion id: ${criterion.id}` });
    }
    ids.add(criterion.id);

    for (const field of ["user_story", "measurement", "threshold"]) {
      if (!criterion[field]) {
        issues.push({ path: `${prefix}.${field}`, message: `${field} is required` });
      }
    }

    if (ledger && !ledger.criteria?.[criterion.id]) {
      issues.push({ path: `ledger.criteria.${criterion.id}`, message: "Evidence ledger is missing this criterion" });
    }
  });

  if (ledger) {
    if (ledger.protocol_version !== PROTOCOL_VERSION) {
      issues.push({ path: "ledger.protocol_version", message: `Must be ${PROTOCOL_VERSION}` });
    }
    for (const [criterionId, state] of Object.entries(ledger.criteria || {})) {
      if (!ids.has(criterionId)) {
        issues.push({ path: `ledger.criteria.${criterionId}`, message: "Evidence ledger has an unknown criterion" });
      }
      if (!VALID_STATUSES.has(state.status)) {
        issues.push({ path: `ledger.criteria.${criterionId}.status`, message: `Invalid status: ${state.status}` });
      }
    }
    for (const item of ledger.capability_profile?.items || []) {
      if (!VALID_PROFILE_ITEM_TYPES.has(item.type)) {
        issues.push({ path: `ledger.capability_profile.items.${item.id}.type`, message: `Invalid profile item type: ${item.type}` });
      }
      if (!VALID_PROFILE_STRENGTHS.has(item.strength)) {
        issues.push({ path: `ledger.capability_profile.items.${item.id}.strength`, message: `Invalid profile strength: ${item.strength}` });
      }
    }
  }

  return issues;
}

export const validateContract = validateContractIntegrity;
