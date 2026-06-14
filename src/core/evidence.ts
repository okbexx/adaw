import type {
  AcceptanceCriterion,
  AcceptanceStatus,
  CriterionStatusRow,
  CurrentGap,
  EvidenceHealth,
  EvidenceHealthFinding,
  EvidenceInput,
  EvidenceLedger,
  EvidencePruneSummary,
  EvidenceRecord,
  EvidenceResult,
  EvidenceSource,
  EvidenceView,
  NormalizedEvidence,
  NoriContract,
  RiskGateResult,
  RiskLevel
} from "../types.ts";
import fs from "node:fs";
import path from "node:path";
import { profileCompliance } from "./profile.ts";
import { inferCriterionLayer, nowIso } from "./shared.ts";

export const VALID_EVIDENCE_RESULTS = new Set(["failing", "passing", "blocked", "waived"]);
export const STRONG_EVIDENCE_KINDS = new Set([
  "test-summary",
  "screenshot",
  "artifact",
  "review-result",
  "human-confirmation",
  "protocol-v1"
]);
export const STRONG_CONFIDENCE = new Set(["verified", "reviewed", "human-confirmed"]);

const STRONG_EVIDENCE_BASIS = new Set(["human-confirmation", "tool-observation", "artifact-review", "protocol-check"]);
const REVIEWABLE_SOURCE_TYPES = new Set(["command", "artifact", "url"]);
const EVIDENCE_HEALTH_STALE_DAYS = 14;
const BULK_EVIDENCE_PATTERNS = [
  /is covered by the OpenNori .*implementation/i,
  /self contract refresh, tests, and reviewable artifacts/i,
  /covered by .* tests, and reviewable artifacts/i
];

function basisForEvidenceKind(kind: string): EvidenceInput["basis"] {
  if (kind === "human-confirmation") return "human-confirmation";
  if (kind === "test-summary" || kind === "review-result") return "tool-observation";
  if (kind === "screenshot" || kind === "artifact") return "artifact-review";
  if (kind === "protocol-v1") return "protocol-check";
  return "agent-observation";
}

function normalizeEvidenceSource(source: unknown): EvidenceSource | null {
  if (source === null || source === undefined) return null;
  if (typeof source === "string") {
    const label = source.trim();
    return label ? { type: "reference", label } : null;
  }
  if (typeof source !== "object" || Array.isArray(source)) return null;

  const entry: EvidenceSource = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      entry[key] = value;
    }
  }
  if (Object.keys(entry).length === 0) return null;
  if (!entry.type) entry.type = "reference";
  if (!entry.label) {
    entry.label = entry.path || entry.url || entry.command || entry.summary || entry.type;
  }
  return entry;
}

function normalizeEvidence(evidence: EvidenceInput): NormalizedEvidence {
  const sources = (Array.isArray(evidence.sources) ? evidence.sources : [])
    .map((source: unknown) => normalizeEvidenceSource(source))
    .filter((source): source is EvidenceSource => Boolean(source));
  if (evidence.path && !sources.some((source) => source.path === evidence.path)) {
    sources.push({ type: "artifact", label: evidence.path, path: evidence.path });
  }
  const kind = evidence.kind || "manual";
  const basis = evidence.basis || basisForEvidenceKind(kind) || "agent-observation";
  return {
    ...evidence,
    kind,
    basis,
    sources,
    reviewability: evidence.reviewability || (sources.length > 0 ? "source-provided" : "summary-only"),
    limitations: evidence.limitations || ""
  };
}

export function addEvidence(contract: NoriContract, ledger: EvidenceLedger, criterionId: string, evidence: EvidenceInput): EvidenceLedger {
  const criterion = contract.criteria.find((item) => item.id === criterionId);
  if (!criterion) {
    throw new Error(`Criterion not found: ${criterionId}`);
  }
  if (!VALID_EVIDENCE_RESULTS.has(evidence.result)) {
    throw new Error(`Invalid evidence result: ${evidence.result}`);
  }

  const state = ledger.criteria[criterionId];
  if (!state) throw new Error(`Evidence ledger state not found: ${criterionId}`);
  const normalized = normalizeEvidence(evidence);
  const gated = applyRiskGate(criterion, normalized);
  state.evidence.push({
    kind: normalized.kind,
    basis: normalized.basis,
    summary: normalized.summary,
    result: gated.result,
    confidence: gated.confidence,
    path: normalized.path,
    sources: normalized.sources,
    reviewability: normalized.reviewability,
    limitations: normalized.limitations,
    gate: gated.gate,
    created_at: nowIso()
  });
  state.status = gated.result;
  state.confidence = gated.confidence;
  ledger.updated_at = nowIso();
  recomputeWorkflowStatus(contract, ledger);
  return ledger;
}

export function applyRiskGate(criterion: AcceptanceCriterion, evidence: NormalizedEvidence): RiskGateResult {
  const requestedResult = evidence.result;
  const confidence = evidence.confidence || confidenceForEvidence(criterion.risk, requestedResult);
  if (requestedResult !== "passing" || criterion.risk !== "high") {
    return { result: requestedResult, confidence, gate: "accepted" };
  }

  const hasReviewableSource = Array.isArray(evidence.sources)
    && evidence.sources.some((source) => REVIEWABLE_SOURCE_TYPES.has(source.type || ""));
  const hasStrongEvidence = STRONG_EVIDENCE_KINDS.has(evidence.kind)
    || STRONG_EVIDENCE_BASIS.has(evidence.basis)
    || (evidence.confidence ? STRONG_CONFIDENCE.has(evidence.confidence) : false)
    || hasReviewableSource;

  if (hasStrongEvidence) {
    return {
      result: "passing",
      confidence: evidence.confidence || "verified",
      gate: "accepted"
    };
  }

  return {
    result: "failing",
    confidence: "strong-evidence-required",
    gate: "downgraded_high_risk_requires_strong_evidence"
  };
}

export function confidenceForEvidence(risk: RiskLevel | undefined, result: EvidenceResult): string {
  if (result !== "passing") return "evidence";
  if (risk === "low") return "agent";
  if (risk === "medium") return "verified";
  if (risk === "high") return "review-required";
  return "human-required";
}

export function recomputeWorkflowStatus(contract: NoriContract, ledger: EvidenceLedger): EvidenceLedger {
  const requiredStates = contract.criteria
    .filter((criterion) => criterion.required !== false)
    .map((criterion) => ledger.criteria[criterion.id]?.status || "unknown");
  const approved = contract.acceptance_basis?.status === "approved";
  const compliance = profileCompliance(ledger);

  if (requiredStates.some((status: string) => status === "blocked")) {
    ledger.status = "blocked";
  } else if (compliance.required && !compliance.complete) {
    ledger.status = "blocked";
  } else if (approved && requiredStates.length > 0 && requiredStates.every((status) => status === "passing" || status === "waived")) {
    ledger.status = "complete";
  } else {
    ledger.status = "active";
  }
  ledger.updated_at = nowIso();
  return ledger;
}

export function currentGap(contract: NoriContract, ledger: EvidenceLedger): CurrentGap | null {
  if (contract.acceptance_basis?.status !== "approved") {
    return {
      id: "ACCEPTANCE-BASIS",
      user_story: "作为用户，我需要先确认或修改验收标准，才能让 agent 判断任务完成。",
      status: "unknown",
      reason: "Acceptance criteria have not been approved by the user yet."
    };
  }

  const compliance = profileCompliance(ledger);
  if (compliance.required && !compliance.complete) {
    const item = compliance.blocking[0];
    if (!item) return null;
    return {
      id: `PROFILE-${item.id}`,
      user_story: `作为用户，我需要 agent 遵守能力偏好：${item.name}。`,
      status: item.status === "violated" ? "failing" : "blocked",
      reason: `Capability profile item ${item.name} is ${item.status}.`
    };
  }

  const priority: AcceptanceStatus[] = ["failing", "blocked", "unknown"];
  for (const status of priority) {
    for (const criterion of contract.criteria) {
      const state = ledger.criteria[criterion.id];
      if (criterion.required === false) continue;
      if ((state?.status || "unknown") === status) {
        return {
          id: criterion.id,
          user_story: criterion.user_story,
          status,
          reason: gapReason(status)
        };
      }
    }
  }
  return null;
}

export function gapReason(status: string): string {
  if (status === "failing") return "Existing evidence shows this user acceptance criterion is not satisfied.";
  if (status === "blocked") return "This user acceptance criterion needs a user decision or external condition.";
  return "This user acceptance criterion has no user-understandable evidence yet.";
}

export function evidenceView(evidence: EvidenceRecord | null | undefined, { root = process.cwd() } = {}): EvidenceView | null {
  return prunedEvidenceView(evidence, root);
}

export function criterionStatusRows(contract: NoriContract, ledger: EvidenceLedger, { root = process.cwd() } = {}): CriterionStatusRow[] {
  return contract.criteria.map((criterion) => {
    const state = ledger.criteria[criterion.id];
    return {
      id: criterion.id,
      layer: criterion.layer || inferCriterionLayer(criterion.id),
      user_story: criterion.user_story,
      status: state?.status || "unknown",
      confidence: state?.confidence || "none",
      latest_evidence: evidenceView(state?.evidence?.at(-1), { root })
    };
  });
}

export function pruneInvalidEvidence(contract: NoriContract, ledger: EvidenceLedger, { root = process.cwd() } = {}): EvidencePruneSummary {
  let changed = false;
  let removedRecords = 0;
  let removedSources = 0;

  for (const criterion of contract.criteria || []) {
    const state = ledger.criteria?.[criterion.id];
    if (!state || !Array.isArray(state.evidence)) continue;
    const nextEvidence: EvidenceRecord[] = [];
    for (const evidence of state.evidence) {
      const originalSources = Array.isArray(evidence.sources) ? evidence.sources : [];
      const sources = originalSources.filter((source) => sourceIsStillReviewable(source, root));
      const pathStillExists = evidence.path ? evidencePathExists(root, evidence.path) : true;
      const pathRemoved = Boolean(evidence.path && !pathStillExists);
      const removedForRecord = originalSources.length - sources.length + (pathRemoved ? 1 : 0);
      removedSources += removedForRecord;
      const view = evidenceView(evidence, { root });
      if (!view) {
        changed = true;
        removedRecords += 1;
        continue;
      }
      const nextRecord: EvidenceRecord = {
        ...evidence,
        path: pathStillExists ? evidence.path : undefined,
        sources
      };
      if (removedForRecord > 0) changed = true;
      nextEvidence.push(nextRecord);
    }

    if (nextEvidence.length !== state.evidence.length) changed = true;
    state.evidence = nextEvidence;
    const latest = nextEvidence.at(-1);
    if (latest) {
      state.status = latest.result as AcceptanceStatus;
      state.confidence = latest.confidence || confidenceForEvidence(criterion.risk, latest.result);
    } else {
      if (state.status !== "unknown" || state.confidence !== "none") changed = true;
      state.status = "unknown";
      state.confidence = "none";
    }
  }

  if (changed) {
    ledger.updated_at = nowIso();
    recomputeWorkflowStatus(contract, ledger);
  }

  return {
    changed,
    removed_records: removedRecords,
    removed_sources: removedSources
  };
}

export function pruneCriterionEvidence(
  contract: NoriContract,
  ledger: EvidenceLedger,
  criterionId: string,
  { reason = "Evidence no longer proves the current acceptance criterion." } = {}
): EvidencePruneSummary {
  const criterion = contract.criteria.find((item) => item.id === criterionId);
  if (!criterion) throw new Error(`Criterion not found: ${criterionId}`);
  const state = ledger.criteria?.[criterionId];
  if (!state) throw new Error(`Evidence ledger state not found: ${criterionId}`);
  const removedRecords = Array.isArray(state.evidence) ? state.evidence.length : 0;
  state.status = "unknown";
  state.confidence = "none";
  state.required = criterion.required !== false;
  state.risk = criterion.risk || "medium";
  state.evidence = [];
  ledger.updated_at = nowIso();
  recomputeWorkflowStatus(contract, ledger);
  return {
    changed: removedRecords > 0,
    removed_records: removedRecords,
    removed_sources: 0,
    criteria: [criterionId],
    reason
  };
}

function evidenceAgeDays(evidence: EvidenceRecord | null | undefined, now = Date.now()): number | null {
  if (!evidence?.created_at) return null;
  const timestamp = Date.parse(evidence.created_at);
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, Math.floor((now - timestamp) / 86400000));
}

function evidenceHasReviewableSource(evidence: EvidenceRecord | null | undefined): boolean {
  const sources = Array.isArray(evidence?.sources) ? evidence.sources : [];
  return sources.some((source) => REVIEWABLE_SOURCE_TYPES.has(source.type || "")) || Boolean(evidence?.path);
}

function isLocalEvidencePath(sourcePath: string): boolean {
  return Boolean(sourcePath) && !/^[a-z][a-z0-9+.-]*:/i.test(sourcePath);
}

function evidencePathExists(root: string | undefined, sourcePath: unknown): boolean {
  const rawPath = String(sourcePath || "").trim();
  if (!rawPath || !isLocalEvidencePath(rawPath)) return true;
  const absolutePath = path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(root || process.cwd(), rawPath);
  return fs.existsSync(absolutePath);
}

function sourceIsStillReviewable(source: EvidenceSource, root: string | undefined): boolean {
  if ((source.type === "artifact" || source.path) && source.path) {
    return evidencePathExists(root, source.path);
  }
  return true;
}

function prunedEvidenceView(evidence: EvidenceRecord | null | undefined, root: string | undefined): EvidenceView | null {
  if (!evidence) return null;
  const originalSources = Array.isArray(evidence.sources) ? evidence.sources : [];
  const sources = originalSources.filter((source) => sourceIsStillReviewable(source, root));
  const evidencePath = evidence.path && evidencePathExists(root, evidence.path) ? evidence.path : undefined;
  const hadLocalPath = Boolean(evidence.path) || originalSources.some((source) => Boolean(source.path));
  const hasReviewableAfterPrune = sources.some((source) => REVIEWABLE_SOURCE_TYPES.has(source.type || "")) || Boolean(evidencePath);
  if (hadLocalPath && !hasReviewableAfterPrune) return null;

  const kind = evidence.kind || "manual";
  const basis = evidence.basis || basisForEvidenceKind(kind) || "agent-observation";
  return {
    kind,
    basis,
    summary: evidence.summary || "<none>",
    result: evidence.result || "unknown",
    confidence: evidence.confidence,
    sources,
    reviewability: evidence.reviewability || (sources.length > 0 || evidencePath ? "source-provided" : "summary-only"),
    limitations: evidence.limitations || "",
    path: evidencePath,
    gate: evidence.gate,
    created_at: evidence.created_at
  };
}

function evidenceHasReviewability(evidence: EvidenceRecord | null | undefined): boolean {
  const value = String(evidence?.reviewability || "").trim();
  return value.length > 0 && value !== "summary-only";
}

function evidenceSummaryLooksBulk(evidence: EvidenceRecord | null | undefined): boolean {
  const summary = String(evidence?.summary || "");
  return BULK_EVIDENCE_PATTERNS.some((pattern) => pattern.test(summary));
}

export function evidenceHealth(contract: NoriContract, ledger: EvidenceLedger, { now = Date.now(), staleDays = EVIDENCE_HEALTH_STALE_DAYS, root = process.cwd() } = {}): EvidenceHealth {
  const findings: EvidenceHealthFinding[] = [];
  for (const criterion of contract.criteria || []) {
    if (criterion.required === false) continue;
    const state = ledger.criteria?.[criterion.id];
    const latest = state?.evidence?.at(-1);
    if (!state || !["passing", "waived"].includes(state.status)) continue;
    if (!latest) continue;

    const ageDays = evidenceAgeDays(latest, now);
    if (ageDays === null) {
      findings.push({
        criterion_id: criterion.id,
        severity: "review",
        issue: "missing-evidence-date",
        message: "Latest passing evidence has no created_at timestamp.",
        recovery: "Record fresh evidence with a timestamp before relying on completion."
      });
    } else if (ageDays > staleDays) {
      findings.push({
        criterion_id: criterion.id,
        severity: "review",
        issue: "stale-evidence",
        message: `Latest passing evidence is ${ageDays} days old.`,
        recovery: "Refresh the evidence if the changed code, docs, website, package, or project state has moved since then."
      });
    }

    const missingSources = [
      ...(latest.path && !evidencePathExists(root, latest.path) ? [latest.path] : []),
      ...(Array.isArray(latest.sources) ? latest.sources
        .filter((source) => (source.type === "artifact" || source.path) && source.path && !evidencePathExists(root, source.path))
        .map((source) => source.path || source.label || "<unknown>") : [])
    ];
    for (const missing of missingSources) {
      findings.push({
        criterion_id: criterion.id,
        severity: "broken",
        issue: "missing-evidence-source",
        message: `Latest passing evidence references a missing local artifact: ${missing}.`,
        recovery: "Remove the stale evidence source and record fresh reviewable evidence."
      });
    }

    if (!evidenceHasReviewableSource(latest) || !evidenceView(latest, { root })) {
      findings.push({
        criterion_id: criterion.id,
        severity: "review",
        issue: "missing-reviewable-source",
        message: "Latest passing evidence has no command, artifact, URL, or path source.",
        recovery: "Add a source that a human or review tool can inspect."
      });
    }

    if (!evidenceHasReviewability(latest)) {
      findings.push({
        criterion_id: criterion.id,
        severity: "review",
        issue: "missing-reviewability",
        message: "Latest passing evidence does not explain how to review it.",
        recovery: "Add a short reviewability note."
      });
    }

    if (!String(latest.limitations || "").trim()) {
      findings.push({
        criterion_id: criterion.id,
        severity: "review",
        issue: "missing-limitations",
        message: "Latest passing evidence has no stated limitations.",
        recovery: "State what the evidence does not prove."
      });
    }

    if (evidenceSummaryLooksBulk(latest)) {
      findings.push({
        criterion_id: criterion.id,
        severity: "review",
        issue: "bulk-evidence-summary",
        message: "Latest passing evidence looks like a broad batch summary rather than criterion-specific proof.",
        recovery: "Replace or supplement it with criterion-specific evidence."
      });
    }
  }

  return {
    status: findings.length === 0 ? "clear" : "review",
    summary: findings.length === 0
      ? "Latest evidence is reviewable enough for the current contract."
      : `${findings.length} evidence health finding(s) need review.`,
    stale_days: staleDays,
    findings
  };
}
