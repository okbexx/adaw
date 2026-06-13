import fs from "node:fs";
import path from "node:path";
import { packagePath } from "../package-root.ts";
import type { JsonObject } from "../types.ts";

export const PACKAGE_JSON = JSON.parse(fs.readFileSync(packagePath("package.json"), "utf8")) as JsonObject;
export const MANIFEST_SCHEMA_VERSION = "opennori/manifest-v1";
export const REQUIRED_NORI_DIRS = ["active", "completed", "blocked", "reports", "brainstorms"];
export const NORI_CAPABILITIES = [
  "acceptance-contract",
  "evidence-ledger",
  "reviewable-evidence",
  "codex-plugin",
  "opennori-skills",
  "brainstorm",
  "acceptance-discovery",
  "acceptance-quality-audit",
  "capability-profile",
  "profile-check",
  "archive",
  "bootstrap",
  "report",
  "doctor",
  "upgrade",
  "context-export",
  "architecture-baseline",
  "architecture-challenge",
  "architecture-agent-surface",
  "architecture-profile",
  "build-vs-buy"
];

export function sameStringSet(left: unknown, right: unknown): boolean {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size !== rightSet.size) return false;
  return [...leftSet].every((item) => rightSet.has(item));
}

export function relativeTo(root: string, filePath: string): string {
  return path.relative(root, filePath) || ".";
}

export function manifestPath(root: string): string {
  return path.join(root, ".opennori", "manifest.json");
}

export function protocolTemplate(): string {
  const source = packagePath(".opennori", "protocol.md");
  if (fs.existsSync(source)) return fs.readFileSync(source, "utf8");
  return [
    "# OpenNori Protocol",
    "",
    "Progress is determined by human-centered acceptance evidence, not by implementation steps.",
    "",
    "Use `opennori init`, `opennori resume`, `opennori next`, `opennori evidence add`, `opennori evaluate`, `opennori status`, and `opennori report`.",
    ""
  ].join("\n");
}
