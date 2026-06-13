import type { EvidenceResult, EvidenceSource } from "../../../types.ts";

type CliArgs = Record<string, any>;

function argValues(rawArgs: string[], name: string): string[] {
  const rawName = name.startsWith("--") ? name : `--${name}`;
  const values: string[] = [];
  for (let index = 0; index < rawArgs.length; index += 1) {
    const item = rawArgs[index];
    if (item === undefined) continue;
    if (item === rawName) {
      const next = rawArgs[index + 1];
      if (next && !next.startsWith("-")) values.push(next);
      continue;
    }
    if (item.startsWith(`${rawName}=`)) {
      values.push(item.slice(rawName.length + 1));
    }
  }
  return values;
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

export function evidenceSourcesFromArgs(args: CliArgs, rawArgs: string[]): EvidenceSource[] {
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

export function evidenceResult(value: unknown): EvidenceResult {
  const result = String(value || "passing");
  if (!["failing", "passing", "blocked", "waived"].includes(result)) {
    throw new Error(`Invalid evidence result: ${result}`);
  }
  return result as EvidenceResult;
}
