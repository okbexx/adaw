import type {
  ProfileEvidenceResult,
  ProfileItemType,
  ProfileStrength
} from "../../../types.ts";

export const rootArg = {
  type: "string",
  description: "Project root.",
  default: process.cwd()
} as const;

export const jsonArg = {
  type: "boolean",
  description: "Keep deterministic JSON output for agents.",
  default: false
} as const;

export function profileItemType(value: unknown): ProfileItemType {
  const type = String(value || "constraint");
  if (!["skill", "stack", "constraint"].includes(type)) throw new Error(`Invalid profile item type: ${type}`);
  return type as ProfileItemType;
}

export function profileStrength(value: unknown): ProfileStrength {
  const strength = String(value || "prefer");
  if (!["must", "prefer", "avoid"].includes(strength)) throw new Error(`Invalid profile strength: ${strength}`);
  return strength as ProfileStrength;
}

export function profileEvidenceResult(value: unknown): ProfileEvidenceResult {
  const result = String(value || "satisfied");
  if (!["satisfied", "violated", "waived"].includes(result)) throw new Error(`Invalid profile evidence result: ${result}`);
  return result as ProfileEvidenceResult;
}
