import { defineCommand } from "citty";
import { parseArgs } from "node:util";
import { addEvidence, criterionStatusRows, currentGap, ok, syncAcceptanceMarkdown, writeJson } from "../../core.ts";
import { refreshManifest } from "../../lifecycle.ts";
import { type ActiveGoalRuntime, runJsonCommand } from "../runtime.ts";
import type { EvidenceBasis, EvidenceInput, EvidenceResult, EvidenceSource } from "../../types.ts";

type CliArgs = Record<string, any>;
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

function argValues(rawArgs: string[], name: string): string[] {
  const rawName = name.startsWith("--") ? name : `--${name}`;
  return (parseArgs({ args: rawArgs, allowPositionals: true, strict: false, tokens: true }).tokens as ParsedToken[])
    .filter((item) => item.kind === "option" && item.rawName === rawName)
    .map((item) => {
      if (item.value !== undefined) return item.value;
      const next = rawArgs[item.index + 1];
      return next && !next.startsWith("-") ? next : undefined;
    })
    .filter((value): value is string => value !== undefined);
}

function parseEvidenceSource(value: unknown): EvidenceSource | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("{")) {
    try {
      return JSON.parse(raw);
    } catch {
      return { type: "reference", label: raw };
    }
  }
  return { type: "reference", label: raw };
}

function arrayValue(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function repeatableArgValues(args: CliArgs, rawArgs: string[], name: string, fallbackName: string): unknown[] {
  const rawValues = argValues(rawArgs, name);
  if (rawValues.length > 0) return rawValues;
  return arrayValue(args[fallbackName]);
}

function evidenceSourcesFromArgs(args: CliArgs, rawArgs: string[]): EvidenceSource[] {
  const sources: EvidenceSource[] = repeatableArgValues(args, rawArgs, "--source", "source")
    .map((source) => parseEvidenceSource(source))
    .filter((source): source is EvidenceSource => Boolean(source));
  for (const rawCommand of repeatableArgValues(args, rawArgs, "--source-command", "sourceCommand")) {
    const command = String(rawCommand);
    sources.push({ type: "command", label: command, command });
  }
  for (const rawSourcePath of repeatableArgValues(args, rawArgs, "--source-path", "sourcePath")) {
    const sourcePath = String(rawSourcePath);
    sources.push({ type: "artifact", label: sourcePath, path: sourcePath });
  }
  for (const rawUrl of repeatableArgValues(args, rawArgs, "--source-url", "sourceUrl")) {
    const url = String(rawUrl);
    sources.push({ type: "url", label: url, url });
  }
  return sources;
}

function evidenceResult(value: unknown): EvidenceResult {
  const result = String(value || "passing");
  if (!["failing", "passing", "blocked", "waived"].includes(result)) {
    throw new Error(`Invalid evidence result: ${result}`);
  }
  return result as EvidenceResult;
}

export const evidenceAddCommand = defineCommand({
  meta: {
    name: "add",
    description: "Record reviewable evidence for an OpenNori acceptance criterion."
  },
  args: {
    root: {
      type: "string",
      description: "Project root.",
      default: process.cwd()
    },
    goal: {
      type: "string",
      description: "Active goal id to update."
    },
    criterion: {
      type: "string",
      description: "Criterion id."
    },
    kind: {
      type: "string",
      description: "Evidence kind.",
      default: "manual"
    },
    basis: {
      type: "string",
      description: "Evidence basis."
    },
    summary: {
      type: "string",
      description: "Human-readable evidence summary.",
      default: ""
    },
    result: {
      type: "string",
      description: "passing, failing, blocked, or waived.",
      default: "passing"
    },
    confidence: {
      type: "string",
      description: "Evidence confidence."
    },
    path: {
      type: "string",
      description: "Optional artifact path."
    },
    source: {
      type: "string",
      description: "Raw evidence source, repeatable."
    },
    sourceCommand: {
      type: "string",
      description: "Command source, repeatable."
    },
    sourcePath: {
      type: "string",
      description: "Artifact source path, repeatable."
    },
    sourceUrl: {
      type: "string",
      description: "URL source, repeatable."
    },
    reviewability: {
      type: "string",
      description: "How a user can review this evidence."
    },
    limitations: {
      type: "string",
      description: "Known evidence limitations."
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ args, data }) {
    const { contract, ledger, acceptancePath, evidencePath, root } = data.loadPair();
    const criterionId = args.criterion;
    if (!criterionId) throw new Error("--criterion is required");
    const sources = evidenceSourcesFromArgs(args, data.rawArgs || []);
    const evidence: EvidenceInput = {
      kind: args.kind || "manual",
      basis: args.basis as EvidenceBasis | undefined,
      summary: args.summary || "",
      result: evidenceResult(args.result),
      confidence: args.confidence,
      path: args.path,
      sources,
      reviewability: args.reviewability,
      limitations: args.limitations
    };
    if (!evidence.summary) throw new Error("--summary is required");
    addEvidence(contract, ledger, criterionId, evidence);
    writeJson(evidencePath, { contract, ledger });
    syncAcceptanceMarkdown(acceptancePath, contract, ledger);
    refreshManifest(root);
    return ok({
      goal_id: contract.goal_id,
      criterion: criterionId,
      criterion_status: ledger.criteria[criterionId].status,
      confidence: ledger.criteria[criterionId].confidence,
      latest_evidence: criterionStatusRows(contract, ledger).find((row) => row.id === criterionId)?.latest_evidence,
      gate: ledger.criteria[criterionId].evidence.at(-1)?.gate,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger)
    });
  }
});

export async function runEvidenceAddCommand(rawArgs: string[], { loadPair }: ActiveGoalRuntime) {
  return runJsonCommand(evidenceAddCommand, rawArgs, { loadPair, rawArgs });
}
