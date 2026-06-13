import path from "node:path";
import { parseArgs } from "node:util";

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

export const rootArg = {
  type: "string",
  description: "Project root.",
  default: process.cwd()
} as const;

export const jsonArg = {
  type: "boolean",
  description: "Keep deterministic JSON output for agents.",
  default: false
} as const;

export function resolveRoot(value: unknown): string {
  return path.resolve(String(value || process.cwd()));
}

export function hasRawFlag(rawArgs: string[], name: string): boolean {
  const rawName = name.startsWith("--") ? name : `--${name}`;
  return (parseArgs({ args: rawArgs, allowPositionals: true, strict: false, tokens: true }).tokens as ParsedToken[])
    .some((item) => item.kind === "option" && item.rawName === rawName);
}

export function relativeTo(root: string, filePath: string): string {
  return path.relative(root, filePath) || ".";
}
