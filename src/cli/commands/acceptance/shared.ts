import path from "node:path";

export type NoriPathPair = {
  jsonPath: string;
  markdownPath: string;
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

export function brainstormPaths(root: string, brainstormId: string): NoriPathPair {
  const dir = path.join(root, ".opennori", "brainstorms");
  return {
    jsonPath: path.join(dir, `${brainstormId}.json`),
    markdownPath: path.join(dir, `${brainstormId}.md`)
  };
}

export function discoveryPaths(root: string, discoveryId: string): NoriPathPair {
  const dir = path.join(root, ".opennori", "brainstorms");
  return {
    jsonPath: path.join(dir, `${discoveryId}.discovery.json`),
    markdownPath: path.join(dir, `${discoveryId}.discovery.md`)
  };
}
