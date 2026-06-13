import fs from "node:fs";
import path from "node:path";
import { defineCommand } from "citty";
import {
  ARCHITECTURE_CHALLENGE_SCHEMA_VERSION,
  architectureChallengePath,
  architectureState,
  readArchitectureBaseline,
  renderArchitectureChallengeMarkdown
} from "../../../architecture.ts";
import { ok, slugify, writeJson } from "../../../core.ts";
import { refreshManifest } from "../../../lifecycle.ts";
import { runJsonCommand } from "../../runtime.ts";
import type { ArchitectureChallenge } from "../../../types.ts";
import { jsonArg, resolveRoot, rootArg } from "./shared.ts";

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
    user: {
      type: "boolean",
      description: "Whether the challenge requires user input. Use --no-user when it does not.",
      default: true
    },
    json: jsonArg
  },
  run({ args }) {
    const root = resolveRoot(args.root);
    const baseline = readArchitectureBaseline(root);
    if (!baseline) throw new Error("No Architecture Baseline found. Create one before challenging it.");
    const summary = String(args.summary || "").trim();
    const evidence = String(args.evidence || "").trim();
    const recommendation = String(args.recommendation || "").trim();
    if (!summary) throw new Error("--summary is required");
    if (!evidence) throw new Error("--evidence is required");
    if (!recommendation) throw new Error("--recommendation is required");
    const id = args.id || slugify(summary.slice(0, 48));
    const challenge: ArchitectureChallenge = {
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
      needs_user: args.user !== false,
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

export async function runArchitectureChallengeCommand(rawArgs: string[]) {
  return runJsonCommand(architectureChallengeCommand, rawArgs, { rawArgs });
}
