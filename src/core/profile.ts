import type {
  CapabilityProfile,
  CapabilityProfileEvidence,
  CapabilityProfileItem,
  EvidenceLedger,
  ProfileCompliance,
  ProfileComplianceStatus,
  ProfileEvidenceInput,
  ProfileItemInput
} from "../types.ts";
import { nowIso, slugify } from "./shared.ts";

export const VALID_PROFILE_STRENGTHS = new Set(["must", "prefer", "avoid"]);
export const VALID_PROFILE_ITEM_TYPES = new Set(["skill", "stack", "constraint"]);
export const VALID_PROFILE_RESULTS = new Set(["satisfied", "violated", "waived"]);

function ensureCapabilityProfile(ledger: EvidenceLedger): CapabilityProfile {
  if (!ledger.capability_profile) ledger.capability_profile = { items: [], evidence: [] };
  return ledger.capability_profile;
}

export function addProfileItem(ledger: EvidenceLedger, item: ProfileItemInput): EvidenceLedger {
  const profile = ensureCapabilityProfile(ledger);
  const type = item.type || "constraint";
  const strength = item.strength || "prefer";
  if (!VALID_PROFILE_ITEM_TYPES.has(type)) {
    throw new Error(`Invalid profile item type: ${type}`);
  }
  if (!VALID_PROFILE_STRENGTHS.has(strength)) {
    throw new Error(`Invalid profile strength: ${strength}`);
  }
  const id = item.id || slugify(`${type}-${item.name}`);
  const existingIndex = profile.items.findIndex((entry) => entry.id === id);
  const entry: CapabilityProfileItem = {
    id,
    type,
    name: String(item.name || "").trim(),
    strength,
    purpose: String(item.purpose || "").trim(),
    scope: String(item.scope || "").trim(),
    install_policy: item.install_policy || "ask_before_install",
    evidence: []
  };
  if (!entry.name) throw new Error("--name is required");
  if (existingIndex === -1) {
    profile.items.push(entry);
  } else {
    profile.items[existingIndex] = {
      ...profile.items[existingIndex],
      ...entry,
      evidence: profile.items[existingIndex]?.evidence || []
    };
  }
  return ledger;
}

export function addProfileEvidence(ledger: EvidenceLedger, itemId: string, evidence: ProfileEvidenceInput): EvidenceLedger {
  const profile = ensureCapabilityProfile(ledger);
  const item = profile.items.find((entry) => entry.id === itemId);
  if (!item) throw new Error(`Capability profile item not found: ${itemId}`);
  if (!VALID_PROFILE_RESULTS.has(evidence.result)) {
    throw new Error(`Invalid profile evidence result: ${evidence.result}`);
  }
  const entry: CapabilityProfileEvidence = {
    item_id: itemId,
    result: evidence.result,
    summary: evidence.summary,
    path: evidence.path,
    created_at: nowIso()
  };
  item.evidence = [...(item.evidence || []), entry];
  profile.evidence.push(entry);
  ledger.updated_at = nowIso();
  return ledger;
}

export function profileCompliance(ledger: EvidenceLedger): ProfileCompliance {
  const items = ledger.capability_profile?.items || [];
  const statuses = items.map((item) => {
    const latest = item.evidence?.at(-1);
    let status: ProfileComplianceStatus = "unknown";
    if (latest?.result === "satisfied") status = "satisfied";
    if (latest?.result === "waived") status = "waived";
    if (latest?.result === "violated") status = "violated";
    return {
      id: item.id,
      type: item.type,
      name: item.name,
      strength: item.strength,
      purpose: item.purpose,
      status,
      summary: latest?.summary || "<none>"
    };
  });
  const blocking = statuses.filter((item) => item.strength === "must" && (item.status === "unknown" || item.status === "violated"));
  const avoidedViolations = statuses.filter((item) => item.strength === "avoid" && item.status === "violated");
  const review = statuses.filter((item) => {
    if (item.status === "satisfied" || item.status === "waived") return false;
    if (item.strength === "prefer") return item.status === "unknown" || item.status === "violated";
    if (item.strength === "avoid") return item.status === "unknown";
    return false;
  });
  return {
    required: items.length > 0,
    complete: blocking.length === 0 && avoidedViolations.length === 0,
    blocking: [...blocking, ...avoidedViolations],
    review,
    statuses
  };
}

export function renderProfileLines(ledger: EvidenceLedger): string[] {
  const compliance = profileCompliance(ledger);
  if (!compliance.required) return ["<none>"];
  return [
    "| ID | Type | Name | Strength | Compliance | Purpose |",
    "| --- | --- | --- | --- | --- | --- |",
    ...compliance.statuses.map((item) => `| ${item.id} | ${item.type} | ${item.name} | ${item.strength} | ${item.status} | ${item.purpose || "<none>"} |`)
  ];
}
