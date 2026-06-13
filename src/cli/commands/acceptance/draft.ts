import { defineCommand } from "citty";
import fs from "node:fs";
import path from "node:path";
import { briefFromBrainstorm, briefFromGoal } from "../../../acceptance.ts";
import {
  buildContractFromBrief,
  buildEvidenceLedger,
  currentGap,
  fail,
  ok,
  pathsForGoal,
  readJson,
  renderAcceptanceMarkdown,
  validateContract,
  writeJson
} from "../../../core.ts";
import { refreshManifest } from "../../../lifecycle.ts";
import { runJsonCommand } from "../../runtime.ts";
import type { Brainstorm, NoriBrief } from "../../../types.ts";
import { brainstormPaths, jsonArg, resolveRoot, rootArg } from "./shared.ts";

const briefFromBrainstormForCommand = briefFromBrainstorm as unknown as (brainstorm: Brainstorm, candidateId: string) => NoriBrief;
const briefFromGoalForCommand = briefFromGoal as (goal: string, goalId?: string) => NoriBrief;

export const draftCommand = defineCommand({
  meta: {
    name: "draft",
    description: "Create a draft Nori Contract from a goal or selected brainstorm candidate."
  },
  args: {
    root: rootArg,
    goal: {
      type: "string",
      description: "Natural language goal to draft."
    },
    goalId: {
      type: "string",
      description: "Optional stable goal id."
    },
    fromBrainstorm: {
      type: "string",
      description: "Brainstorm id to draft from."
    },
    candidate: {
      type: "string",
      description: "Brainstorm candidate id."
    },
    json: jsonArg
  },
  run({ args }) {
    const root = resolveRoot(args.root);
    const brainstormId = args.fromBrainstorm;
    let brief;
    if (brainstormId) {
      const candidateId = args.candidate;
      if (!candidateId) throw new Error("--candidate is required with --from-brainstorm");
      brief = briefFromBrainstormForCommand(readJson<Brainstorm>(brainstormPaths(root, brainstormId).jsonPath), String(candidateId));
    } else {
      const goal = String(args.goal || "").trim();
      if (!goal) throw new Error("--goal is required");
      brief = briefFromGoalForCommand(goal, args.goalId);
    }
    const contract = buildContractFromBrief(brief);
    const ledger = buildEvidenceLedger(contract);
    const issues = validateContract(contract, ledger);
    if (issues.length > 0) {
      return { ...fail("invalid_acceptance", "Draft does not produce a valid OpenNori contract", "Rewrite ACs from the user's perspective"), issues };
    }
    const paths = pathsForGoal(root, contract.goal_id);
    fs.mkdirSync(path.dirname(paths.acceptancePath), { recursive: true });
    fs.writeFileSync(paths.acceptancePath, renderAcceptanceMarkdown(contract, ledger));
    writeJson(paths.evidencePath, { contract, ledger });
    refreshManifest(root);
    return ok(
      {
        goal_id: contract.goal_id,
        acceptance_basis: contract.acceptance_basis,
        acceptance_path: paths.acceptancePath,
        evidence_path: paths.evidencePath,
        criteria: contract.criteria,
        current_gap: currentGap(contract, ledger)
      },
      [
        { kind: "draft_acceptance_contract", path: paths.acceptancePath },
        { kind: "evidence_ledger", path: paths.evidencePath }
      ],
      [],
      ["Ask the user to approve or revise these acceptance criteria before implementation."]
    );
  }
});

export async function runDraftCommand(rawArgs: string[]) {
  return runJsonCommand(draftCommand, rawArgs);
}

export const initCommand = defineCommand({
  meta: {
    name: "init",
    description: "Create a Nori Contract from a brief JSON file."
  },
  args: {
    root: rootArg,
    json: jsonArg
  },
  run({ args }) {
    const briefPath = path.resolve(String(args._?.[0] || ""));
    const root = resolveRoot(args.root);
    const brief = readJson<NoriBrief>(briefPath);
    const contract = buildContractFromBrief(brief);
    const ledger = buildEvidenceLedger(contract);
    const issues = validateContract(contract, ledger);
    if (issues.length > 0) {
      return { ...fail("invalid_acceptance", "Brief does not produce a valid OpenNori contract", "Rewrite ACs from the user's perspective"), issues };
    }

    const paths = pathsForGoal(root, contract.goal_id);
    const evidencePayload = { contract, ledger };
    fs.mkdirSync(path.dirname(paths.acceptancePath), { recursive: true });
    fs.writeFileSync(paths.acceptancePath, renderAcceptanceMarkdown(contract, ledger));
    writeJson(paths.evidencePath, evidencePayload);
    refreshManifest(root);

    return ok(
      {
        goal_id: contract.goal_id,
        acceptance_path: paths.acceptancePath,
        evidence_path: paths.evidencePath,
        current_gap: currentGap(contract, ledger)
      },
      [
        { kind: "acceptance_contract", path: paths.acceptancePath },
        { kind: "evidence_ledger", path: paths.evidencePath }
      ],
      [],
      ["Run opennori next --acceptance <path> --evidence <path> --json before choosing implementation work."]
    );
  }
});

export async function runInitCommand(rawArgs: string[]) {
  return runJsonCommand(initCommand, rawArgs);
}
