import fs from "node:fs";
import path from "node:path";
import { readJson, slugify, writeJson } from "../core.ts";
import type {
  ArchitectureBaseline,
  JsonObject,
  PreferredLibraryPolicy,
  ValidationIssue
} from "../types.ts";
import { validateSchema } from "../validation.ts";
import { resolveArchitectureProfile } from "./profile.ts";
import { ARCHITECTURE_BASELINE_SCHEMA_VERSION, architectureBaselinePaths } from "./shared.ts";

export function buildArchitectureBaseline(root: string, {
  profileId = "typescript-agent-state-cli",
  goal = "",
  goalId = undefined,
  summary = undefined,
  accepted = false
}: { profileId?: string; goal?: string; goalId?: string; summary?: string; accepted?: boolean } = {}): ArchitectureBaseline {
  const profile = resolveArchitectureProfile(root, profileId);
  const now = new Date().toISOString();
  return {
    schema_version: ARCHITECTURE_BASELINE_SCHEMA_VERSION,
    status: accepted ? "active" : "draft",
    profile: profile.id,
    profile_title: profile.title,
    profile_origin: profile.origin,
    goal_id: goalId || slugify(goal || profile.id),
    goal,
    summary: summary || profile.summary,
    created_at: now,
    updated_at: now,
    accepted_at: accepted ? now : null,
    sticky: true,
    requires_challenge_to_change: true,
    applies_to: profile.applies_to || [],
    sources: profile.sources || [],
    principles: profile.principles || [],
    checks: profile.checks || [],
    preferred_libraries: profile.preferred_libraries || [],
    avoid: profile.avoid || [],
    build_vs_buy_policy: profile.build_vs_buy_policy || {
      order: ["current-project-dependency", "standard-library", "official-sdk", "mature-open-source-library", "small-local-implementation"],
      require_reason_when_self_building: true
    },
    challenge_policy: {
      agent_may_challenge: true,
      agent_must_not_silently_replace: true,
      requires_user_confirmation: true
    },
    agent_surfaces: [
      ".opennori/architecture/baseline.json",
      ".opennori/architecture/baseline.md",
      ".opennori/agent-guide.md",
      "AGENTS.md",
      "CLAUDE.md",
      ".codex-plugin/plugin.json",
      "skills/nori-architecture-apply/SKILL.md"
    ]
  };
}

export function validateArchitectureBaseline(baseline: ArchitectureBaseline | JsonObject): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!baseline || typeof baseline !== "object") {
    return [{ path: "$", message: "Architecture Baseline is not an object." }];
  }
  const schemaResult = validateSchema("architecture-baseline", baseline);
  for (const error of schemaResult.errors) {
    issues.push({ path: `schema${error.path}`, message: error.message });
  }
  if (baseline.schema_version !== ARCHITECTURE_BASELINE_SCHEMA_VERSION) {
    issues.push({ path: "schema_version", message: `Expected ${ARCHITECTURE_BASELINE_SCHEMA_VERSION}.` });
  }
  if (!["draft", "active"].includes(baseline.status)) {
    issues.push({ path: "status", message: "Architecture Baseline status must be draft or active." });
  }
  if (!baseline.profile) issues.push({ path: "profile", message: "Architecture Baseline must name a profile." });
  if (!baseline.goal_id) issues.push({ path: "goal_id", message: "Architecture Baseline must include a goal_id." });
  if (!Array.isArray(baseline.principles) || baseline.principles.length === 0) {
    issues.push({ path: "principles", message: "Architecture Baseline must include architecture principles." });
  }
  if (!Array.isArray(baseline.checks) || baseline.checks.length === 0) {
    issues.push({ path: "checks", message: "Architecture Baseline must include architecture checks." });
  }
  if (!baseline.build_vs_buy_policy) {
    issues.push({ path: "build_vs_buy_policy", message: "Architecture Baseline must include build-vs-buy policy." });
  }
  return issues;
}

export function readArchitectureBaseline(root: string): ArchitectureBaseline | null {
  const paths = architectureBaselinePaths(root);
  if (!fs.existsSync(paths.jsonPath)) return null;
  return readJson<ArchitectureBaseline>(paths.jsonPath);
}

function renderArchitectureBaselineMarkdown(baseline: ArchitectureBaseline): string {
  const lines = [
    "# OpenNori Architecture Baseline",
    "",
    `Status: ${baseline.status}`,
    `Profile: ${baseline.profile}`,
    `Sticky: ${baseline.sticky ? "yes" : "no"}`,
    `Requires challenge to change: ${baseline.requires_challenge_to_change ? "yes" : "no"}`,
    "",
    "## Goal",
    "",
    baseline.goal || "<none>",
    "",
    "## Summary",
    "",
    baseline.summary || "<none>",
    "",
    "## Principles",
    "",
    ...baseline.principles.map((principle: string) => `- ${principle}`),
    "",
    "## Architecture Checks",
    ""
  ];
  for (const check of baseline.checks || []) {
    lines.push(`- ${check.id || "ARCH"} (${check.audience || "reviewer"}): ${check.statement}`);
  }
  lines.push(
    "",
    "## Build-vs-Buy Policy",
    "",
    ...((baseline.build_vs_buy_policy?.order || []).map((item: string, index: number) => `${index + 1}. ${item}`)),
    "",
    "## Prefer",
    "",
    ...((baseline.preferred_libraries || []).map((entry: PreferredLibraryPolicy) => `- ${entry.area}: ${entry.policy}`)),
    "",
    "## Avoid",
    "",
    ...((baseline.avoid || []).map((item: string) => `- ${item}`)),
    "",
    "## Agent Rule",
    "",
    "Before implementing a non-trivial acceptance gap, read this baseline and keep the implementation aligned with it.",
    "If project evidence conflicts with this baseline, create an Architecture Challenge instead of silently replacing it.",
    ""
  );
  return `${lines.join("\n")}\n`;
}

export function writeArchitectureBaseline(root: string, baseline: ArchitectureBaseline) {
  const paths = architectureBaselinePaths(root);
  writeJson(paths.jsonPath, baseline);
  fs.mkdirSync(path.dirname(paths.markdownPath), { recursive: true });
  fs.writeFileSync(paths.markdownPath, renderArchitectureBaselineMarkdown(baseline));
  return paths;
}
