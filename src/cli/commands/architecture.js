import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { defineCommand } from "citty";
import {
  ARCHITECTURE_CHALLENGE_SCHEMA_VERSION,
  BUILD_VS_BUY_SCHEMA_VERSION,
  architectureBaselinePaths,
  architectureChallengePath,
  architectureProfiles,
  architectureState,
  buildArchitectureBaseline,
  buildVsBuyPath,
  normalizeArchitectureProfile,
  readArchitectureBaseline,
  renderArchitectureChallengeMarkdown,
  renderBuildVsBuyMarkdown,
  validateArchitectureProfile,
  writeArchitectureBaseline,
  writeArchitectureProfile
} from "../../architecture.js";
import { fail, ok, readJson, slugify, writeJson } from "../../core.js";
import { refreshManifest } from "../../lifecycle.js";
import { runJsonCommand } from "../runtime.js";

const rootArg = {
  type: "string",
  description: "Project root.",
  default: process.cwd()
};

const jsonArg = {
  type: "boolean",
  description: "Keep deterministic JSON output for agents.",
  default: false
};

function hasRawFlag(rawArgs, name) {
  const rawName = name.startsWith("--") ? name : `--${name}`;
  return parseArgs({ args: rawArgs, allowPositionals: true, strict: false, tokens: true }).tokens
    .some((item) => item.kind === "option" && item.rawName === rawName);
}

function relativeTo(root, filePath) {
  return path.relative(root, filePath) || ".";
}

export const architectureProfilesCommand = defineCommand({
  meta: {
    name: "profiles",
    description: "List reviewable OpenNori Architecture Profiles."
  },
  args: {
    root: rootArg,
    json: jsonArg
  },
  run({ args }) {
    const root = path.resolve(String(args.root || process.cwd()));
    return ok({
      root,
      profiles: architectureProfiles(root),
      side_effect: "none"
    });
  }
});

export const architectureProfileCommand = defineCommand({
  meta: {
    name: "profile",
    description: "Install a project Architecture Profile from a JSON file."
  },
  args: {
    root: rootArg,
    from: {
      type: "string",
      description: "Path to Architecture Profile JSON."
    },
    path: {
      type: "string",
      description: "Alias for --from."
    },
    id: {
      type: "string",
      description: "Optional profile id override."
    },
    force: {
      type: "boolean",
      description: "Overwrite an existing profile after review.",
      default: false
    },
    json: jsonArg
  },
  run({ args }) {
    const root = path.resolve(String(args.root || process.cwd()));
    const source = args.from || args.path;
    if (!source) throw new Error("--from is required");
    const sourcePath = path.resolve(String(source));
    const profile = normalizeArchitectureProfile(readJson(sourcePath), args.id);
    const issues = validateArchitectureProfile(profile);
    if (issues.length > 0) {
      return { ...fail("invalid_architecture_profile", "Architecture Profile failed validation", "Add id, title, summary, principles, checks, and build_vs_buy_policy."), issues };
    }
    const target = writeArchitectureProfile(root, profile, { force: Boolean(args.force) });
    refreshManifest(root);
    return ok(
      {
        root,
        profile,
        profile_path: target,
        profiles: architectureProfiles(root),
        side_effect: "write"
      },
      [
        { kind: "architecture_profile", path: target }
      ],
      [],
      ["Preview an Architecture Baseline with this profile, then ask the user to confirm before implementation."]
    );
  }
});

export const architectureBaselineCommand = defineCommand({
  meta: {
    name: "baseline",
    description: "Preview or confirm an Architecture Baseline for a goal."
  },
  args: {
    root: rootArg,
    goal: {
      type: "string",
      description: "Natural language goal the baseline applies to."
    },
    profile: {
      type: "string",
      description: "Architecture Profile id.",
      default: "typescript-agent-state-cli"
    },
    goalId: {
      type: "string",
      description: "Optional stable goal id."
    },
    summary: {
      type: "string",
      description: "Optional baseline summary override."
    },
    confirm: {
      type: "boolean",
      description: "Persist the baseline after user confirmation.",
      default: false
    },
    json: jsonArg
  },
  run({ args }) {
    const root = path.resolve(String(args.root || process.cwd()));
    const goal = String(args.goal || "").trim();
    const profileId = args.profile || "typescript-agent-state-cli";
    const goalId = args.goalId || slugify(goal || profileId);
    const confirmed = Boolean(args.confirm);
    if (!goal) throw new Error("--goal is required");
    const baseline = buildArchitectureBaseline(root, {
      profileId,
      goal,
      goalId,
      summary: args.summary,
      accepted: confirmed
    });
    const paths = architectureBaselinePaths(root);
    if (confirmed) {
      writeArchitectureBaseline(root, baseline);
      refreshManifest(root);
    }
    return ok(
      {
        root,
        confirmed,
        baseline,
        architecture: confirmed ? architectureState(root, goalId) : {
          ...architectureState(root, goalId),
          preview: {
            baseline_path: relativeTo(root, paths.jsonPath),
            markdown_path: relativeTo(root, paths.markdownPath),
            side_effect: "none"
          }
        },
        side_effect: confirmed ? "write" : "none"
      },
      confirmed
        ? [
            { kind: "architecture_baseline", path: paths.jsonPath },
            { kind: "architecture_baseline_markdown", path: paths.markdownPath }
          ]
        : [],
      [],
      confirmed
        ? ["Implement Product AC under this Architecture Baseline. Raise an Architecture Challenge if project evidence conflicts with it."]
        : ["Show this Architecture Baseline to the user and rerun with --confirm only after they accept it."]
    );
  }
});

export const architectureShowCommand = defineCommand({
  meta: {
    name: "show",
    description: "Show the current OpenNori Architecture Baseline state."
  },
  args: {
    root: rootArg,
    goal: {
      type: "string",
      description: "Goal id to evaluate architecture state against."
    },
    json: jsonArg
  },
  run({ args }) {
    const root = path.resolve(String(args.root || process.cwd()));
    return ok({
      root,
      architecture: architectureState(root, args.goal),
      baseline: readArchitectureBaseline(root),
      side_effect: "none"
    });
  }
});

export const architectureChallengeCommand = defineCommand({
  meta: {
    name: "challenge",
    description: "Record an Architecture Challenge when evidence conflicts with the baseline."
  },
  args: {
    root: rootArg,
    id: {
      type: "string",
      description: "Optional stable challenge id."
    },
    summary: {
      type: "string",
      description: "Challenge summary."
    },
    evidence: {
      type: "string",
      description: "Evidence supporting the challenge."
    },
    recommendation: {
      type: "string",
      description: "Recommended user decision."
    },
    noUser: {
      type: "boolean",
      description: "Mark the challenge as not requiring user input.",
      default: false
    },
    json: jsonArg
  },
  run({ args, data }) {
    const root = path.resolve(String(args.root || process.cwd()));
    const baseline = readArchitectureBaseline(root);
    if (!baseline) throw new Error("No Architecture Baseline found. Create one before challenging it.");
    const summary = String(args.summary || "").trim();
    const evidence = String(args.evidence || "").trim();
    const recommendation = String(args.recommendation || "").trim();
    if (!summary) throw new Error("--summary is required");
    if (!evidence) throw new Error("--evidence is required");
    if (!recommendation) throw new Error("--recommendation is required");
    const id = args.id || slugify(summary.slice(0, 48));
    const challenge = {
      schema_version: ARCHITECTURE_CHALLENGE_SCHEMA_VERSION,
      id,
      status: "open",
      created_at: new Date().toISOString(),
      baseline: {
        profile: baseline.profile,
        goal_id: baseline.goal_id,
        accepted_at: baseline.accepted_at
      },
      summary,
      evidence,
      recommendation,
      needs_user: !hasRawFlag(data?.rawArgs || [], "--no-user"),
      rule: "Agent may challenge the Architecture Baseline with evidence, but must not silently replace it."
    };
    const paths = architectureChallengePath(root, id);
    writeJson(paths.jsonPath, challenge);
    fs.mkdirSync(path.dirname(paths.markdownPath), { recursive: true });
    fs.writeFileSync(paths.markdownPath, renderArchitectureChallengeMarkdown(challenge));
    refreshManifest(root);
    return ok(
      {
        root,
        challenge,
        architecture: architectureState(root, baseline.goal_id),
        challenge_path: paths.jsonPath,
        markdown_path: paths.markdownPath
      },
      [
        { kind: "architecture_challenge", path: paths.jsonPath },
        { kind: "architecture_challenge_markdown", path: paths.markdownPath }
      ],
      [],
      ["Ask the user to confirm whether to revise or keep the current Architecture Baseline."]
    );
  }
});

export const architectureBuildVsBuyCommand = defineCommand({
  meta: {
    name: "build-vs-buy",
    description: "Record a build-vs-buy decision before custom architecture work."
  },
  args: {
    root: rootArg,
    id: {
      type: "string",
      description: "Optional stable decision id."
    },
    area: {
      type: "string",
      description: "Architecture area under review."
    },
    need: {
      type: "string",
      description: "Capability or implementation need."
    },
    recommendation: {
      type: "string",
      description: "reuse, buy, or self-build."
    },
    status: {
      type: "string",
      description: "Decision status.",
      default: "active"
    },
    summary: {
      type: "string",
      description: "Human-readable decision summary."
    },
    currentProject: {
      type: "string",
      description: "Current project candidate or not-applicable reason.",
      default: ""
    },
    standardLibrary: {
      type: "string",
      description: "Standard library candidate or not-applicable reason.",
      default: ""
    },
    officialSdk: {
      type: "string",
      description: "Official SDK candidate or not-applicable reason.",
      default: ""
    },
    openSource: {
      type: "string",
      description: "Open-source candidate or not-applicable reason.",
      default: ""
    },
    selfBuildReason: {
      type: "string",
      description: "Reason self-build is acceptable.",
      default: ""
    },
    supersededBy: {
      type: "string",
      description: "Decision that supersedes this one.",
      default: ""
    },
    supersededReason: {
      type: "string",
      description: "Why this decision is superseded.",
      default: ""
    },
    json: jsonArg
  },
  run({ args }) {
    const root = path.resolve(String(args.root || process.cwd()));
    const area = String(args.area || "").trim();
    const need = String(args.need || "").trim();
    const recommendation = String(args.recommendation || "").trim();
    const summary = String(args.summary || "").trim();
    if (!area) throw new Error("--area is required");
    if (!need) throw new Error("--need is required");
    if (!recommendation) throw new Error("--recommendation is required");
    if (!summary) throw new Error("--summary is required");
    const id = args.id || slugify(`${area}-${need}`.slice(0, 64));
    const decision = {
      schema_version: BUILD_VS_BUY_SCHEMA_VERSION,
      id,
      created_at: new Date().toISOString(),
      area,
      need,
      recommendation,
      status: args.status || "active",
      summary,
      current_project: args.currentProject || "",
      standard_library: args.standardLibrary || "",
      official_sdk: args.officialSdk || "",
      open_source: args.openSource || "",
      self_build_reason: args.selfBuildReason || "",
      superseded_by: args.supersededBy || "",
      superseded_reason: args.supersededReason || ""
    };
    const paths = buildVsBuyPath(root, id);
    writeJson(paths.jsonPath, decision);
    fs.mkdirSync(path.dirname(paths.markdownPath), { recursive: true });
    fs.writeFileSync(paths.markdownPath, renderBuildVsBuyMarkdown(decision));
    refreshManifest(root);
    return ok(
      {
        root,
        decision,
        decision_path: paths.jsonPath,
        markdown_path: paths.markdownPath,
        architecture: architectureState(root)
      },
      [
        { kind: "build_vs_buy_decision", path: paths.jsonPath },
        { kind: "build_vs_buy_markdown", path: paths.markdownPath }
      ],
      decision.recommendation === "self-build" && !decision.self_build_reason
        ? [{ type: "build_vs_buy", message: "Self-build recommendation should include --self-build-reason." }]
        : [],
      ["Use this decision as architecture evidence when implementing related acceptance gaps."]
    );
  }
});

export async function runArchitectureProfilesCommand(rawArgs) {
  return runJsonCommand(architectureProfilesCommand, rawArgs);
}

export async function runArchitectureProfileCommand(rawArgs) {
  return runJsonCommand(architectureProfileCommand, rawArgs);
}

export async function runArchitectureBaselineCommand(rawArgs) {
  return runJsonCommand(architectureBaselineCommand, rawArgs);
}

export async function runArchitectureShowCommand(rawArgs) {
  return runJsonCommand(architectureShowCommand, rawArgs);
}

export async function runArchitectureChallengeCommand(rawArgs) {
  return runJsonCommand(architectureChallengeCommand, rawArgs, { rawArgs });
}

export async function runArchitectureBuildVsBuyCommand(rawArgs) {
  return runJsonCommand(architectureBuildVsBuyCommand, rawArgs);
}
