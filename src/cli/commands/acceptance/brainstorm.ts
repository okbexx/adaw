import { defineCommand } from "citty";
import fs from "node:fs";
import path from "node:path";
import {
  buildBrainstorm,
  discoverAcceptance,
  renderBrainstormMarkdown,
  renderDiscoveryMarkdown
} from "../../../acceptance.ts";
import { ok, writeJson } from "../../../core.ts";
import { refreshManifest } from "../../../lifecycle.ts";
import { runJsonCommand } from "../../runtime.ts";
import type { AcceptanceDiscovery } from "../../../types.ts";
import { brainstormPaths, discoveryPaths, jsonArg, resolveRoot, rootArg } from "./shared.ts";

export const brainstormCommand = defineCommand({
  meta: {
    name: "brainstorm",
    description: "Create selectable acceptance directions from a natural language idea."
  },
  args: {
    root: rootArg,
    idea: {
      type: "string",
      description: "Natural language idea to explore."
    },
    id: {
      type: "string",
      description: "Optional stable brainstorm id."
    },
    json: jsonArg
  },
  run({ args }) {
    const root = resolveRoot(args.root);
    const idea = String(args.idea || "").trim();
    if (!idea) throw new Error("--idea is required");
    const brainstorm = buildBrainstorm(idea, args.id);
    const paths = brainstormPaths(root, brainstorm.id);
    writeJson(paths.jsonPath, brainstorm);
    fs.mkdirSync(path.dirname(paths.markdownPath), { recursive: true });
    fs.writeFileSync(paths.markdownPath, renderBrainstormMarkdown(brainstorm));
    refreshManifest(root);
    return ok(
      {
        brainstorm_id: brainstorm.id,
        status: brainstorm.status,
        idea: brainstorm.idea,
        candidates: brainstorm.candidates,
        brainstorm_path: paths.jsonPath,
        markdown_path: paths.markdownPath,
        is_acceptance_contract: false
      },
      [
        { kind: "brainstorm_source", path: paths.jsonPath },
        { kind: "brainstorm_markdown", path: paths.markdownPath }
      ],
      [],
      ["Ask the user to choose or revise a candidate before running opennori draft."]
    );
  }
});

export async function runBrainstormCommand(rawArgs: string[]) {
  return runJsonCommand(brainstormCommand, rawArgs);
}

export const discoverCommand = defineCommand({
  meta: {
    name: "discover",
    description: "Discover underspecified acceptance gaps before drafting a Nori Contract."
  },
  args: {
    root: rootArg,
    goal: {
      type: "string",
      description: "Natural language goal to inspect."
    },
    idea: {
      type: "string",
      description: "Alias for --goal."
    },
    id: {
      type: "string",
      description: "Optional stable discovery id."
    },
    json: jsonArg
  },
  run({ args }) {
    const root = resolveRoot(args.root);
    const goal = String(args.goal || args.idea || "").trim();
    if (!goal) throw new Error("--goal is required");
    const discovery: AcceptanceDiscovery = discoverAcceptance(goal, args.id);
    const paths = discoveryPaths(root, discovery.id);
    writeJson(paths.jsonPath, discovery);
    fs.mkdirSync(path.dirname(paths.markdownPath), { recursive: true });
    fs.writeFileSync(paths.markdownPath, renderDiscoveryMarkdown(discovery));
    refreshManifest(root);
    return ok(
      {
        discovery_id: discovery.id,
        status: discovery.status,
        goal: discovery.goal,
        gaps: discovery.gaps,
        questions: discovery.gaps.map((gap) => gap.question),
        discovery_path: paths.jsonPath,
        markdown_path: paths.markdownPath,
        is_acceptance_contract: false
      },
      [
        { kind: "acceptance_discovery", path: paths.jsonPath },
        { kind: "acceptance_discovery_markdown", path: paths.markdownPath }
      ],
      [],
      [discovery.next]
    );
  }
});

export async function runDiscoverCommand(rawArgs: string[]) {
  return runJsonCommand(discoverCommand, rawArgs);
}
