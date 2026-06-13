import fs from "node:fs";
import path from "node:path";
import { readJson, renderReport, slugify, writeJson } from "./core.ts";
import type {
  ArchitectureBaseline,
  ArchitectureChallenge,
  ArchitectureChallengeSummary,
  ArchitectureProfile,
  ArchitectureProfileDescriptor,
  ArchitectureProfileListItem,
  ArchitectureSource,
  ArchitectureState,
  ArchitectureSurfaceState,
  BuildVsBuyDecision,
  BuildVsBuyDecisionSummary,
  BuildVsBuyFinding,
  BuildVsBuyHealth,
  JsonObject,
  NoriContract,
  EvidenceLedger,
  PathPair,
  PreferredLibraryPolicy,
  ValidationIssue
} from "./types.ts";
import { schemaErrorSummary, validateSchema } from "./validation.ts";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function relativeTo(root: string, filePath: string): string {
  return path.relative(root, filePath) || ".";
}

export const ARCHITECTURE_CHALLENGE_SCHEMA_VERSION = "opennori/architecture-challenge-v1";
export const BUILD_VS_BUY_SCHEMA_VERSION = "opennori/build-vs-buy-v1";
export const REQUIRED_ARCHITECTURE_DIRS = ["profiles", "challenges", "decisions", "evidence"];
export const AGENT_ROUTE_START = "<!-- opennori:agent-route:start -->";
export const AGENT_ROUTE_END = "<!-- opennori:agent-route:end -->";
const ARCHITECTURE_BASELINE_SCHEMA_VERSION = "opennori/architecture-baseline-v1";

const BUILTIN_ARCHITECTURE_PROFILES: Record<string, ArchitectureProfile> = {
  "typescript-agent-state-cli": {
    id: "typescript-agent-state-cli",
    title: "TypeScript Agent State CLI",
    applies_to: [
      "project-local protocol and state tools",
      "agent-facing deterministic CLI products",
      "Skill Pack and manifest managed tools"
    ],
    summary: "Use strict TypeScript, a citty command layer, public JSON Schema with Ajv validation, tsc builds without bundling, Vitest and Biome quality gates, manifest-managed lifecycle actions, directory-based Skills, and build-vs-buy checks before custom infrastructure.",
    sources: [
      {
        label: "OpenAI Codex Agent Skills",
        lesson: "Skills are directory-based capability units with SKILL.md plus optional references, scripts, assets, and UI metadata; OpenNori ships Skills as package assets instead of JS string prompts."
      },
      {
        label: "CodeGraph / GitNexus",
        lesson: "Expose deterministic agent-readable context, status, doctor, and staleness signals; use strict TypeScript and tested CLI boundaries without becoming a code graph platform."
      },
      {
        label: "Compound Engineering Plugin",
        lesson: "Use lightweight TypeScript CLI architecture and citty-style command modules, while avoiding process-centered multi-agent review."
      },
      {
        label: "ECC",
        lesson: "Use manifest/profile/component/install-state style productization without becoming a workflow OS."
      },
      {
        label: "vibecode-pro-max-kit",
        lesson: "Borrow Skill directory organization and managed-file install boundaries, but reject RIPER phase folders and process/ as the mainline."
      }
    ],
    principles: [
      "strict-typescript-source",
      "citty-command-layer",
      "thin-cli-entry",
      "domain-first-modules",
      "json-schema-public-protocol",
      "ajv-runtime-validation",
      "tsc-build-no-bundle-by-default",
      "vitest-and-biome-quality-gates",
      "directory-based-skill-pack",
      "manifest-managed-install-upgrade-uninstall",
      "skill-driven-natural-language-usage",
      "generic-context-export-for-external-review",
      "build-vs-buy-before-custom-infrastructure"
    ],
    checks: [
      {
        id: "ARCH-1",
        audience: "maintainer",
        statement: "CLI command definitions are thin citty command modules that delegate product decisions to domain modules.",
        review: "Inspect src/cli/commands, command handlers, and domain modules before claiming architecture complete."
      },
      {
        id: "ARCH-2",
        audience: "maintainer",
        statement: "Persisted OpenNori state has public JSON Schema and Ajv runtime validation; OpenNori semantic rules stay separate from structural schema validation.",
        review: "Inspect schemas/ and src/validation before claiming protocol validation complete."
      },
      {
        id: "ARCH-3",
        audience: "maintainer",
        statement: "Skill Pack content lives in skills/*/SKILL.md with optional references/scripts/assets/openai metadata, not as hard-coded JS strings.",
        review: "Inspect skills/ assets, package files, Skill Pack manifest hashes, and doctor sync output."
      },
      {
        id: "ARCH-4",
        audience: "maintainer",
        statement: "Install, upgrade, uninstall, managed files, and doctor recovery are lifecycle concerns with deterministic plans, dry-run preview, and explicit confirmation boundaries.",
        review: "Inspect lifecycle plan/apply modules, manifest state, and contract tests."
      },
      {
        id: "ARCH-5",
        audience: "agent",
        statement: "Before custom infrastructure work, check current project dependencies, standard libraries, official SDKs, mature open-source libraries, and documented reference projects.",
        review: "Record a build-vs-buy decision or challenge before self-building infrastructure."
      },
      {
        id: "ARCH-6",
        audience: "agent",
        statement: "Do not replace this baseline silently. Raise an Architecture Challenge when project evidence conflicts with it.",
        review: "Check .opennori/architecture/challenges for unresolved challenges."
      }
    ],
    preferred_libraries: [
      {
        area: "language",
        policy: "Use TypeScript strict mode for source modules and keep generated JavaScript as npm runtime output."
      },
      {
        area: "cli",
        policy: "Use citty for command definitions; keep commander as a fallback only if packaging, nested command, or compatibility evidence blocks citty."
      },
      {
        area: "interactive",
        policy: "Use @clack/prompts for minimal project-aware quickstart prompts; keep all state commands JSON-capable."
      },
      {
        area: "build",
        policy: "Use tsc emit without bundling by default; add tsdown or tsup only when a real packaging need appears."
      },
      {
        area: "schema",
        policy: "Use public JSON Schema files as protocol truth and Ajv for runtime validation."
      },
      {
        area: "markdown-frontmatter",
        policy: "Use yaml for frontmatter when needed; keep JSON authoritative and avoid micromark/unified unless Markdown import requires it."
      },
      {
        area: "test",
        policy: "Use Vitest plus tsc --noEmit; CLI integration tests should spawn the real bin against temporary projects."
      },
      {
        area: "quality",
        policy: "Use Biome for lint and format; agents must not weaken quality config to pass checks."
      },
      {
        area: "skills",
        policy: "Ship directory-based Skills as package assets and install/sync them through manifest-managed lifecycle actions."
      }
    ],
    avoid: [
      "process/ as OpenNori's workflow mainline",
      "phase/task-list state as product completion state",
      "agent self-summary as the only high-risk completion evidence",
      "Markdown as authoritative protocol state when JSON state exists",
      "hard-coded Skill bodies in JS strings",
      "silent architecture replacement",
      "custom infrastructure without build-vs-buy evidence",
      "bundler-first builds before tsc emit proves insufficient",
      "external review tools as OpenNori's control plane"
    ],
    build_vs_buy_policy: {
      order: [
        "current-project-dependency",
        "standard-library",
        "official-sdk",
        "mature-open-source-library",
        "small-local-implementation"
      ],
      require_reason_when_self_building: true,
      requires_decision_for: [
        "cli parsing",
        "schema validation",
        "markdown parsing",
        "installer lifecycle",
        "state storage",
        "test harness",
        "Skill Pack asset management",
        "frontend components"
      ]
    }
  }
};
export function architectureDir(root: string): string {
  return path.join(root, ".opennori", "architecture");
}

export function architectureBaselinePaths(root: string): PathPair {
  return {
    jsonPath: path.join(architectureDir(root), "baseline.json"),
    markdownPath: path.join(architectureDir(root), "baseline.md")
  };
}

function architectureProfilePath(root: string, profileId: string): string {
  return path.join(architectureDir(root), "profiles", `${profileId}.json`);
}

export function architectureChallengePath(root: string, challengeId: string): PathPair {
  return {
    jsonPath: path.join(architectureDir(root), "challenges", `${challengeId}.json`),
    markdownPath: path.join(architectureDir(root), "challenges", `${challengeId}.md`)
  };
}

export function buildVsBuyPath(root: string, decisionId: string): PathPair {
  return {
    jsonPath: path.join(architectureDir(root), "decisions", `${decisionId}.json`),
    markdownPath: path.join(architectureDir(root), "decisions", `${decisionId}.md`)
  };
}

export function agentGuidePath(root: string): string {
  return path.join(root, ".opennori", "agent-guide.md");
}

function resolveArchitectureProfile(root: string, profileId = "typescript-agent-state-cli"): ArchitectureProfile {
  const localPath = architectureProfilePath(root, profileId);
  if (fs.existsSync(localPath)) {
    return {
      ...readJson<ArchitectureProfile>(localPath),
      origin: "project"
    };
  }
  const builtin = BUILTIN_ARCHITECTURE_PROFILES[profileId];
  if (!builtin) throw new Error(`Unknown Architecture Profile: ${profileId}`);
  return {
    ...builtin,
    origin: "builtin"
  };
}

function localArchitectureProfiles(root: string): ArchitectureProfileListItem[] {
  const dir = path.join(architectureDir(root), "profiles");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => {
      const profilePath = path.join(dir, fileName);
      try {
        const profileInput = readJson<Partial<ArchitectureProfile>>(profilePath);
        const profile = normalizeArchitectureProfile(profileInput, profileInput.id ? undefined : fileName.replace(/\.json$/, ""));
        return architectureProfileDescriptor(profile, {
          origin: "project",
          path: relativeTo(root, profilePath)
        });
      } catch (error) {
        return {
          id: fileName.replace(/\.json$/, ""),
          title: fileName.replace(/\.json$/, ""),
          origin: "project",
          path: relativeTo(root, profilePath),
          valid: false,
          error: errorMessage(error)
        };
      }
    });
}

function architectureProfileDescriptor(profile: ArchitectureProfile, { origin, path: profilePath = undefined }: { origin?: string; path?: string } = {}): ArchitectureProfileDescriptor {
  const issues = validateArchitectureProfile(profile);
  return {
    id: profile.id,
    title: profile.title,
    origin,
    path: profilePath,
    valid: issues.length === 0,
    validation_issues: issues,
    summary: profile.summary,
    applies_to: profile.applies_to || [],
    sources: profile.sources || [],
    principles: profile.principles || [],
    checks: profile.checks || [],
    preferred_libraries: profile.preferred_libraries || [],
    avoid: profile.avoid || [],
    build_vs_buy_policy: profile.build_vs_buy_policy || null,
    review: {
      can_generate_baseline: issues.length === 0,
      source_count: (profile.sources || []).length,
      check_count: (profile.checks || []).length,
      avoid_count: (profile.avoid || []).length,
      next: issues.length === 0
        ? "Preview a baseline from this profile, show it to the user, and confirm only after acceptance."
        : "Fix validation issues before using this profile for a baseline."
    }
  };
}

export function architectureProfiles(root: string): ArchitectureProfileListItem[] {
  const builtins = Object.values(BUILTIN_ARCHITECTURE_PROFILES)
    .map((profile) => architectureProfileDescriptor(profile, { origin: "builtin" }));
  const local = localArchitectureProfiles(root);
  const localIds = new Set(local.map((profile) => profile.id));
  return [
    ...local,
    ...builtins.filter((profile) => !localIds.has(profile.id))
  ];
}

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
      ".agents/skills/nori-architecture-apply/SKILL.md"
    ]
  };
}

function validateArchitectureBaseline(baseline: ArchitectureBaseline | JsonObject): ValidationIssue[] {
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

export function validateArchitectureProfile(profile: ArchitectureProfile | JsonObject): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!profile || typeof profile !== "object") {
    return [{ path: "$", message: "Architecture Profile is not an object." }];
  }
  if (!profile.id) issues.push({ path: "id", message: "Architecture Profile must include an id." });
  if (!profile.title) issues.push({ path: "title", message: "Architecture Profile must include a title." });
  if (!profile.summary) issues.push({ path: "summary", message: "Architecture Profile must include a summary." });
  if (!Array.isArray(profile.principles) || profile.principles.length === 0) {
    issues.push({ path: "principles", message: "Architecture Profile must include architecture principles." });
  }
  if (!Array.isArray(profile.checks) || profile.checks.length === 0) {
    issues.push({ path: "checks", message: "Architecture Profile must include architecture checks." });
  }
  if (!profile.build_vs_buy_policy) {
    issues.push({ path: "build_vs_buy_policy", message: "Architecture Profile must include build-vs-buy policy." });
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

export function normalizeArchitectureProfile(input: Partial<ArchitectureProfile>, idOverride: string | undefined = undefined): ArchitectureProfile {
  const id = idOverride || input.id || slugify(input.title || input.summary || "architecture-profile");
  return {
    ...input,
    id,
    title: input.title || id,
    summary: input.summary || "",
    applies_to: Array.isArray(input.applies_to) ? input.applies_to : [],
    sources: Array.isArray(input.sources) ? input.sources : [],
    principles: Array.isArray(input.principles) ? input.principles : [],
    checks: Array.isArray(input.checks) ? input.checks : [],
    preferred_libraries: Array.isArray(input.preferred_libraries) ? input.preferred_libraries : [],
    avoid: Array.isArray(input.avoid) ? input.avoid : [],
    build_vs_buy_policy: input.build_vs_buy_policy || {
      order: ["current-project-dependency", "standard-library", "official-sdk", "mature-open-source-library", "small-local-implementation"],
      require_reason_when_self_building: true
    },
    updated_at: new Date().toISOString()
  };
}

export function writeArchitectureProfile(root: string, profile: ArchitectureProfile, { force = false } = {}): string {
  const target = architectureProfilePath(root, profile.id);
  if (fs.existsSync(target) && !force) {
    throw new Error(`Architecture Profile already exists: ${relativeTo(root, target)}. Rerun with --force only after review.`);
  }
  writeJson(target, profile);
  return target;
}

export function writeArchitectureBaseline(root: string, baseline: ArchitectureBaseline): PathPair {
  const paths = architectureBaselinePaths(root);
  writeJson(paths.jsonPath, baseline);
  fs.mkdirSync(path.dirname(paths.markdownPath), { recursive: true });
  fs.writeFileSync(paths.markdownPath, renderArchitectureBaselineMarkdown(baseline));
  return paths;
}

export function renderAgentGuideMarkdown(): string {
  return [
    "# OpenNori Agent Guide",
    "",
    "Before implementing a non-trivial OpenNori acceptance gap, read:",
    "",
    "- `.opennori/active/*.acceptance.md`",
    "- `.opennori/architecture/baseline.md`",
    "- `.opennori/architecture/baseline.json` when structured data is needed",
    "",
    "Follow the Architecture Baseline while completing Product AC.",
    "If the baseline conflicts with project evidence, create an Architecture Challenge and ask for confirmation.",
    "Do not silently replace technology stack, directory boundaries, dependency policy, or state model.",
    "",
    "Build-vs-buy is required before custom infrastructure work: check current dependencies, standard libraries, official SDKs, mature open-source libraries, and documented reference projects before self-building.",
    ""
  ].join("\n");
}

export function renderAgentRouteSectionMarkdown(): string {
  return [
    AGENT_ROUTE_START,
    "## OpenNori",
    "",
    "Before implementing a non-trivial change, read:",
    "",
    "- `.opennori/active/*.acceptance.md`",
    "- `.opennori/architecture/baseline.md`",
    "- `.opennori/agent-guide.md`",
    "",
    "Follow the Architecture Baseline while completing Product AC.",
    "If the baseline conflicts with project evidence, create an Architecture Challenge instead of silently replacing it.",
    AGENT_ROUTE_END,
    ""
  ].join("\n");
}

export function renderAgentRouteMarkdown(agentName: string): string {
  return [
    `# ${agentName} Project Instructions`,
    "",
    renderAgentRouteSectionMarkdown()
  ].join("\n");
}

function architectureSurfaceState(root: string): ArchitectureSurfaceState {
  const guide = agentGuidePath(root);
  const agents = path.join(root, "AGENTS.md");
  const claude = path.join(root, "CLAUDE.md");
  const containsRoute = (filePath: string) => fs.existsSync(filePath)
    && fs.readFileSync(filePath, "utf8").includes(".opennori/architecture/baseline.md");
  return {
    guide: {
      path: ".opennori/agent-guide.md",
      installed: fs.existsSync(guide),
      in_sync: fs.existsSync(guide) && fs.readFileSync(guide, "utf8") === renderAgentGuideMarkdown()
    },
    agents: {
      path: "AGENTS.md",
      installed: fs.existsSync(agents),
      references_baseline: containsRoute(agents)
    },
    claude: {
      path: "CLAUDE.md",
      installed: fs.existsSync(claude),
      references_baseline: containsRoute(claude)
    }
  };
}

function architectureChallengeSummaries(root: string): ArchitectureChallengeSummary[] {
  const dir = path.join(architectureDir(root), "challenges");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => {
      try {
        const challenge = readJson<ArchitectureChallenge>(path.join(dir, fileName));
        return {
          id: challenge.id || fileName.replace(/\.json$/, ""),
          status: challenge.status || "open",
          summary: challenge.summary || "",
          needs_user: challenge.needs_user !== false,
          path: relativeTo(root, path.join(dir, fileName))
        };
      } catch (error) {
        return {
          id: fileName.replace(/\.json$/, ""),
          status: "unreadable",
          summary: errorMessage(error),
          needs_user: true,
          path: relativeTo(root, path.join(dir, fileName))
        };
      }
    });
}

function buildVsBuyDecisionSummaries(root: string): BuildVsBuyDecisionSummary[] {
  const dir = path.join(architectureDir(root), "decisions");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => {
      try {
        const decision = readJson<BuildVsBuyDecision>(path.join(dir, fileName));
        const schemaResult = validateSchema("build-vs-buy", decision);
        return {
          id: decision.id || fileName.replace(/\.json$/, ""),
          schema_valid: schemaResult.valid,
          schema_errors: schemaResult.errors,
          area: decision.area,
          need: decision.need,
          recommendation: decision.recommendation,
          status: decision.status || "active",
          summary: decision.summary,
          current_project: decision.current_project,
          standard_library: decision.standard_library,
          official_sdk: decision.official_sdk,
          open_source: decision.open_source,
          self_build_reason: decision.self_build_reason,
          superseded_by: decision.superseded_by,
          superseded_reason: decision.superseded_reason,
          path: relativeTo(root, path.join(dir, fileName))
        };
      } catch (error) {
        return {
          id: fileName.replace(/\.json$/, ""),
          error: errorMessage(error),
          path: relativeTo(root, path.join(dir, fileName))
        };
      }
    });
}

function buildVsBuyHealth(decisions: BuildVsBuyDecisionSummary[]): BuildVsBuyHealth {
  const findings: BuildVsBuyFinding[] = [];
  const activeDecisions = decisions.filter((decision) => decision.status !== "superseded");
  for (const decision of activeDecisions) {
    if (decision.error) {
      findings.push({
        decision_id: decision.id,
        severity: "broken",
        issue: "unreadable-decision",
        message: `Build-vs-buy decision ${decision.id} is unreadable: ${decision.error}`,
        recovery: `Inspect ${decision.path} and restore valid JSON.`
      });
      continue;
    }

    if (decision.schema_valid === false) {
        findings.push({
          decision_id: decision.id,
          severity: "broken",
          issue: "schema-invalid-decision",
          message: `Build-vs-buy decision ${decision.id} does not match the public schema: ${schemaErrorSummary({ valid: false, errors: decision.schema_errors || [] })}`,
        recovery: `Inspect ${decision.path} and restore a valid opennori/build-vs-buy-v1 decision.`
      });
      continue;
    }

    for (const field of ["current_project", "standard_library", "official_sdk", "open_source"]) {
      if (!decision[field]) {
        findings.push({
          decision_id: decision.id,
          severity: "needs-action",
          issue: `missing-${field.replaceAll("_", "-")}`,
          message: `${decision.id} does not show that ${field.replaceAll("_", " ")} was checked.`,
          recovery: `Update ${decision.path} with a concrete ${field.replaceAll("_", " ")} candidate or an explicit not-applicable reason.`
        });
      }
    }

    if (decision.recommendation === "self-build" && !decision.self_build_reason) {
      findings.push({
        decision_id: decision.id,
        severity: "needs-action",
        issue: "missing-self-build-reason",
        message: `${decision.id} recommends self-build without a reviewable reason.`,
        recovery: `Update ${decision.path} with the license, maintenance, security, package size, performance, or product-boundary reason for self-build.`
      });
    }
  }

  return {
    status: findings.some((finding) => finding.severity === "broken")
      ? "broken"
      : findings.length > 0
        ? "needs-action"
        : "clear",
    summary: findings.length === 0
      ? "Every recorded build-vs-buy decision includes reviewable reuse candidates and any self-build reason."
      : `${findings.length} build-vs-buy issue(s) need review before claiming mature reuse discipline.`,
    decision_count: activeDecisions.length,
    total_decision_count: decisions.length,
    superseded_decision_count: decisions.length - activeDecisions.length,
    findings
  };
}

export function architectureState(root: string, goalId: string | undefined = undefined): ArchitectureState {
  const paths = architectureBaselinePaths(root);
  const surface = architectureSurfaceState(root);
  const challenges = architectureChallengeSummaries(root);
  const openChallenges = challenges.filter((challenge) => challenge.status !== "resolved");
  const decisions = buildVsBuyDecisionSummaries(root);
  const buildVsBuy = buildVsBuyHealth(decisions);

  let baseline: ArchitectureBaseline | null = null;
  let issues: ValidationIssue[] = [];
  if (fs.existsSync(paths.jsonPath)) {
    try {
      baseline = readJson<ArchitectureBaseline>(paths.jsonPath);
      issues = validateArchitectureBaseline(baseline);
    } catch (error) {
      issues = [{ path: "baseline", message: errorMessage(error) }];
    }
  }

  let decision: ArchitectureState["decision"] = "missing";
  if (baseline && issues.length > 0) decision = "invalid";
  if (baseline && issues.length === 0 && baseline.status === "draft") decision = "draft";
  if (baseline && issues.length === 0 && baseline.status === "active") decision = "valid";
  if (baseline && issues.length === 0 && openChallenges.length > 0) decision = "challenged";

  return {
    schema_version: "opennori/architecture-state-v1",
    decision,
    required_for_goal: Boolean(goalId),
    baseline: baseline ? {
      status: baseline.status,
      profile: baseline.profile,
      profile_title: baseline.profile_title,
      goal_id: baseline.goal_id,
      sticky: baseline.sticky,
      requires_challenge_to_change: baseline.requires_challenge_to_change,
      accepted_at: baseline.accepted_at
    } : null,
    issues,
    open_challenges: openChallenges,
    build_vs_buy_decisions: decisions,
    build_vs_buy: buildVsBuy,
    agent_surface: surface,
    paths: {
      baseline_json: relativeTo(root, paths.jsonPath),
      baseline_markdown: relativeTo(root, paths.markdownPath),
      agent_guide: ".opennori/agent-guide.md"
    }
  };
}

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
  const base = renderReport(contract, ledger).trimEnd();
  return `${base}\n\n${renderArchitectureReportSection(root, contract.goal_id).trimEnd()}\n`;
}

export function renderArchitectureChallengeMarkdown(challenge: ArchitectureChallenge): string {
  return [
    `# ${challenge.id} Architecture Challenge`,
    "",
    `Status: ${challenge.status}`,
    `Needs user: ${challenge.needs_user ? "yes" : "no"}`,
    `Baseline: ${challenge.baseline?.profile || "<none>"}`,
    "",
    "## Summary",
    "",
    challenge.summary || "<none>",
    "",
    "## Evidence",
    "",
    challenge.evidence || "<none>",
    "",
    "## Recommendation",
    "",
    challenge.recommendation || "<none>",
    "",
    "## Rule",
    "",
    "This challenge is the only valid way for an agent to request a baseline change. Do not silently replace the Architecture Baseline.",
    ""
  ].join("\n");
}

export function renderBuildVsBuyMarkdown(decision: BuildVsBuyDecision): string {
  return [
    `# ${decision.id} Build-vs-Buy Decision`,
    "",
    `Area: ${decision.area}`,
    `Need: ${decision.need}`,
    `Recommendation: ${decision.recommendation}`,
    `Status: ${decision.status || "active"}`,
    decision.superseded_by ? `Superseded by: ${decision.superseded_by}` : "",
    decision.superseded_reason ? `Superseded reason: ${decision.superseded_reason}` : "",
    "",
    "## Summary",
    "",
    decision.summary || "<none>",
    "",
    "## Candidates Checked",
    "",
    `- Current project: ${decision.current_project || "<not checked>"}`,
    `- Standard library: ${decision.standard_library || "<not checked>"}`,
    `- Official SDK: ${decision.official_sdk || "<not checked>"}`,
    `- Open source: ${decision.open_source || "<not checked>"}`,
    "",
    "## Self-build Reason",
    "",
    decision.self_build_reason || "<none>",
    ""
  ].join("\n");
}
