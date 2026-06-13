import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { ManagedAction } from "../types.ts";

export type WriteOptions = {
  dryRun?: boolean;
  force?: boolean;
  merge?: boolean;
  kind?: string;
  managed?: boolean;
  startMarker?: string;
  endMarker?: string;
};

export function fileHash(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function writeIfSafe(filePath: string, content: string, { dryRun = false, force = false, kind = "file", managed = true }: WriteOptions = {}): ManagedAction {
  const exists = fs.existsSync(filePath);
  const action = exists ? (force ? "overwrite" : "skip") : "create";
  if (!dryRun && (!exists || force)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  return { path: filePath, action, kind, managed };
}

export function managedSectionBounds(content: string, startMarker: string, endMarker: string): { start: number; end: number } | null {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) return null;
  return { start, end: end + endMarker.length };
}

export function upsertManagedSection(content: string, section: string, startMarker: string, endMarker: string): string {
  const normalizedSection = section.endsWith("\n") ? section : `${section}\n`;
  const bounds = managedSectionBounds(content, startMarker, endMarker);
  if (bounds) {
    return `${content.slice(0, bounds.start)}${normalizedSection}${content.slice(bounds.end).replace(/^\n/, "")}`;
  }
  const trimmed = content.trimEnd();
  return `${trimmed}${trimmed ? "\n\n" : ""}${normalizedSection}`;
}

export function writeAgentRoute(
  filePath: string,
  content: string,
  section: string,
  { dryRun = false, force = false, merge = false, kind = "agent-route", managed = true, startMarker = "", endMarker = "" }: WriteOptions = {}
): ManagedAction {
  if (!merge) return writeIfSafe(filePath, content, { dryRun, force, kind, managed });
  const exists = fs.existsSync(filePath);
  if (!exists) {
    if (!dryRun) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);
    }
    return { path: filePath, action: "create", kind, managed };
  }
  const current = fs.readFileSync(filePath, "utf8");
  const bounds = managedSectionBounds(current, startMarker, endMarker);
  if (!bounds && current.includes(".opennori/architecture/baseline.md")) {
    return {
      path: filePath,
      action: "exists",
      kind,
      managed,
      reason: "Existing project agent route already references the OpenNori Architecture Baseline."
    };
  }
  const next = upsertManagedSection(current, section, startMarker, endMarker);
  const action = next === current ? "exists" : "merge";
  if (!dryRun && action === "merge") {
    fs.writeFileSync(filePath, next);
  }
  return {
    path: filePath,
    action,
    kind,
    managed,
    reason: action === "exists"
      ? "Existing project agent route already references the OpenNori Architecture Baseline."
      : undefined
  };
}

export function ensureDir(dirPath: string, { dryRun = false, kind = "directory", managed = true }: WriteOptions = {}): ManagedAction {
  const exists = fs.existsSync(dirPath);
  if (!dryRun && !exists) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return { path: dirPath, action: exists ? "exists" : "create", kind, managed };
}
