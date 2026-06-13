import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CommandDef } from "citty";
import { runCommand } from "citty";
import { findActivePairs, readJson, syncAcceptanceMarkdown, writeJson } from "../core.ts";
import { refreshManifest } from "../lifecycle.ts";
import type { EvidenceLedger, NoriContract, NoriEvidencePayload } from "../types.ts";

export type CliCommand = CommandDef<any>;
export type ActiveGoalArgs = {
  root?: unknown;
  goal?: unknown;
  acceptance?: unknown;
  evidence?: unknown;
};

export const activeGoalArgs = {
  root: {
    type: "string",
    description: "Project root.",
    default: process.cwd()
  },
  goal: {
    type: "string",
    description: "Active goal id."
  },
  acceptance: {
    type: "string",
    description: "Explicit acceptance markdown path."
  },
  evidence: {
    type: "string",
    description: "Explicit evidence JSON path."
  }
} as const;

export type ActiveGoalPair = {
  contract: NoriContract;
  ledger: EvidenceLedger;
  acceptancePath: string;
  evidencePath: string;
  root: string;
};

export type ActiveGoalRuntime = {
  loadPair: (args?: ActiveGoalArgs) => ActiveGoalPair;
  savePair: typeof savePair;
  refreshManifest: typeof refreshManifest;
};

export async function runJsonCommand(command: CliCommand, rawArgs: string[], data?: unknown): Promise<unknown> {
  const { result } = await runCommand(command, { rawArgs, data });
  return result;
}

export function savePair(acceptancePath: string, evidencePath: string, contract: NoriContract, ledger: EvidenceLedger): void {
  writeJson(evidencePath, { contract, ledger });
  syncAcceptanceMarkdown(acceptancePath, contract, ledger);
}

function inferRootFromAcceptancePath(acceptancePath: string): string {
  const parts = path.resolve(acceptancePath).split(path.sep);
  const noriIndex = parts.lastIndexOf(".opennori");
  if (noriIndex <= 0) return process.cwd();
  return parts.slice(0, noriIndex).join(path.sep) || path.sep;
}

function waitSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function argValue(rawArgs: string[], name: string): string | undefined {
  const rawName = name.startsWith("--") ? name : `--${name}`;
  for (let index = 0; index < rawArgs.length; index += 1) {
    const item = rawArgs[index];
    if (item === undefined) continue;
    if (item === rawName) {
      const next = rawArgs[index + 1];
      return next && !next.startsWith("-") ? next : undefined;
    }
    if (item.startsWith(`${rawName}=`)) return item.slice(rawName.length + 1);
  }
  return undefined;
}

function lockRootFromArgs(rawArgs: string[]): string {
  const acceptancePath = argValue(rawArgs, "acceptance");
  if (acceptancePath) return inferRootFromAcceptancePath(acceptancePath);
  return path.resolve(argValue(rawArgs, "root") || process.cwd());
}

function lockParentForRoot(root: string): string {
  const noriDir = path.join(root, ".opennori");
  if (fs.existsSync(noriDir)) return path.join(noriDir, ".locks");
  return path.join(os.tmpdir(), "opennori-locks", Buffer.from(root).toString("hex").slice(0, 80));
}

export function activeGoalWriteLockPath(root: string): string {
  return path.join(lockParentForRoot(root), "active-goal.write.lock");
}

function acquireActiveGoalWriteLock(root: string): string {
  const lockPath = activeGoalWriteLockPath(root);
  const startedAt = Date.now();
  const timeoutMs = 15_000;
  const staleMs = 120_000;
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  while (true) {
    try {
      fs.mkdirSync(lockPath);
      writeJson(path.join(lockPath, "owner.json"), {
        pid: process.pid,
        root,
        created_at: new Date().toISOString()
      });
      return lockPath;
    } catch (error) {
      const typedError = error as NodeJS.ErrnoException;
      if (typedError.code !== "EEXIST") throw error;
      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - stat.mtimeMs > staleMs) {
          fs.rmSync(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Timed out waiting for OpenNori active goal write lock: ${lockPath}`);
      }
      waitSync(50);
    }
  }
}

export async function withActiveGoalWriteLock<T>(rawArgs: string[], action: () => Promise<T>): Promise<T> {
  const root = lockRootFromArgs(rawArgs);
  const lockPath = acquireActiveGoalWriteLock(root);
  try {
    return await action();
  } finally {
    fs.rmSync(lockPath, { recursive: true, force: true });
  }
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const stringValue = String(value).trim();
  return stringValue || undefined;
}

export function loadPair(args: ActiveGoalArgs = {}): ActiveGoalPair {
  const explicitAcceptance = optionalString(args.acceptance);
  const explicitEvidence = optionalString(args.evidence);
  if (explicitAcceptance || explicitEvidence) {
    if (!explicitAcceptance || !explicitEvidence) {
      throw new Error("Both --acceptance and --evidence are required");
    }
    const acceptancePath = path.resolve(explicitAcceptance);
    const evidencePath = path.resolve(explicitEvidence);
    const payload = readJson<NoriEvidencePayload>(evidencePath);
    return {
      contract: payload.contract,
      ledger: payload.ledger,
      acceptancePath,
      evidencePath,
      root: inferRootFromAcceptancePath(acceptancePath)
    };
  }

  const root = path.resolve(optionalString(args.root) || process.cwd());
  const goal = optionalString(args.goal);
  const pairs = findActivePairs(root);
  const pair = goal ? pairs.find((item) => item.goalId === goal) : pairs[0];
  if (!pair) {
    throw new Error(`No active OpenNori goal found under ${root}`);
  }
  if (!goal && pairs.length > 1) {
    throw new Error("Multiple active OpenNori goals found. Pass --goal <goal-id> or explicit --acceptance/--evidence paths.");
  }
  const payload = readJson<NoriEvidencePayload>(pair.evidencePath);
  return {
    contract: payload.contract,
    ledger: payload.ledger,
    acceptancePath: pair.acceptancePath,
    evidencePath: pair.evidencePath,
    root
  };
}

export function activeGoalRuntime(): ActiveGoalRuntime {
  return {
    loadPair,
    savePair,
    refreshManifest
  };
}
