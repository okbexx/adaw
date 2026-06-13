import fs from "node:fs";
import path from "node:path";
import { readJson, slugify, writeJson } from "../core.ts";
import type {
  ArchitectureProfile,
  ArchitectureProfileDescriptor,
  ArchitectureProfileListItem,
  JsonObject,
  ValidationIssue
} from "../types.ts";
import { architectureDir, architectureProfilePath, errorMessage, relativeTo } from "./shared.ts";

const BUILTIN_ARCHITECTURE_PROFILES: Record<string, ArchitectureProfile> = {
  "typescript-agent-state-cli": {
    id: "typescript-agent-state-cli",
    title: "TypeScript Agent State CLI",
    applies_to: [
      "project-local protocol and state tools",
      "agent-facing deterministic CLI products",
      "Codex Plugin-packaged Skills and manifest managed state"
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
      "plugin-packaged-skills",
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
        statement: "OpenNori Skill content lives in plugin-packaged plugins/opennori/skills/*/SKILL.md with optional references/scripts/assets/openai metadata, not as hard-coded JS strings or project-local copies.",
        review: "Inspect .agents/plugins/marketplace.json, plugins/opennori/.codex-plugin/plugin.json, plugins/opennori/skills/ assets, package files, and doctor plugin output."
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
        policy: "Ship directory-based Skills as Codex Plugin package assets; project lifecycle commands manage .opennori state, not project-local Skill copies."
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
        "Plugin Skill asset management",
        "frontend components"
      ]
    }
  }
};

export function resolveArchitectureProfile(root: string, profileId = "typescript-agent-state-cli"): ArchitectureProfile {
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
