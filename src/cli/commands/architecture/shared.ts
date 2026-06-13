import path from "node:path";

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

export function relativeTo(root: string, filePath: string): string {
  return path.relative(root, filePath) || ".";
}
