import path from "node:path";
import { parseArgs } from "node:util";
import type { CommandDef } from "citty";
import { runCommand } from "citty";
import { findActivePairs, readJson, syncAcceptanceMarkdown, writeJson } from "../core.js";
import { refreshManifest } from "../lifecycle.js";

type ParsedOptionToken = {
  kind: "option";
  index: number;
  rawName: string;
  value?: string;
};

type ParsedToken = ParsedOptionToken | {
  kind: string;
  index: number;
  rawName?: string;
  value?: string;
};

export type CliCommand = CommandDef<any>;
export type CliPayload = Record<string, any>;

export type ActiveGoalPair = {
  contract: CliPayload;
  ledger: CliPayload;
  acceptancePath: string;
  evidencePath: string;
  root: string;
};

export type ActiveGoalRuntime = {
  loadPair: () => ActiveGoalPair;
  savePair: typeof savePair;
  refreshManifest: typeof refreshManifest;
};

export async function runJsonCommand(command: CliCommand, rawArgs: string[], data?: unknown): Promise<unknown> {
  const { result } = await runCommand(command, { rawArgs, data });
  return result;
}

function parsedArgTokens(args: string[]): ParsedToken[] {
  return parseArgs({ args, allowPositionals: true, strict: false, tokens: true }).tokens as ParsedToken[];
}

export function hasFlag(args: string[], name: string): boolean {
  const rawName = name.startsWith("--") ? name : `--${name}`;
  return parsedArgTokens(args).some((item) => item.kind === "option" && item.rawName === rawName);
}

export function argValue(args: string[], name: string, fallback: string): string;
export function argValue(args: string[], name: string, fallback?: undefined): string | undefined;
export function argValue(args: string[], name: string, fallback?: string): string | undefined {
  const rawName = name.startsWith("--") ? name : `--${name}`;
  const token = parsedArgTokens(args).findLast((item) => item.kind === "option" && item.rawName === rawName);
  if (!token) return fallback;
  if (token.value !== undefined) return token.value;
  const next = args[token.index + 1];
  return next && !next.startsWith("-") ? next : fallback;
}

export function resolveRoot(args: string[]): string {
  return path.resolve(argValue(args, "--root", process.cwd()));
}

export function savePair(acceptancePath: string, evidencePath: string, contract: CliPayload, ledger: CliPayload): void {
  writeJson(evidencePath, { contract, ledger });
  syncAcceptanceMarkdown(acceptancePath, contract, ledger);
}

function inferRootFromAcceptancePath(acceptancePath: string): string {
  const parts = path.resolve(acceptancePath).split(path.sep);
  const noriIndex = parts.lastIndexOf(".opennori");
  if (noriIndex <= 0) return process.cwd();
  return parts.slice(0, noriIndex).join(path.sep) || path.sep;
}

export function loadPair(args: string[]): ActiveGoalPair {
  const explicitAcceptance = argValue(args, "--acceptance");
  const explicitEvidence = argValue(args, "--evidence");
  if (explicitAcceptance || explicitEvidence) {
    if (!explicitAcceptance || !explicitEvidence) {
      throw new Error("Both --acceptance and --evidence are required");
    }
    const acceptancePath = path.resolve(explicitAcceptance);
    const evidencePath = path.resolve(explicitEvidence);
    const payload = readJson(evidencePath);
    return {
      contract: payload.contract,
      ledger: payload.ledger,
      acceptancePath,
      evidencePath,
      root: inferRootFromAcceptancePath(acceptancePath)
    };
  }

  const root = resolveRoot(args);
  const goal = argValue(args, "--goal");
  const pairs = findActivePairs(root);
  const pair = goal ? pairs.find((item) => item.goalId === goal) : pairs[0];
  if (!pair) {
    throw new Error(`No active OpenNori goal found under ${root}`);
  }
  if (!goal && pairs.length > 1) {
    throw new Error("Multiple active OpenNori goals found. Pass --goal <goal-id> or explicit --acceptance/--evidence paths.");
  }
  const payload = readJson(pair.evidencePath);
  return {
    contract: payload.contract,
    ledger: payload.ledger,
    acceptancePath: pair.acceptancePath,
    evidencePath: pair.evidencePath,
    root
  };
}

export function activeGoalRuntime(args: string[]): ActiveGoalRuntime {
  return {
    loadPair: () => loadPair(args),
    savePair,
    refreshManifest
  };
}
