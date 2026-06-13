import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export function fileHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function writeIfSafe(filePath, content, { dryRun = false, force = false, kind = "file", managed = true } = {}) {
  const exists = fs.existsSync(filePath);
  const action = exists ? (force ? "overwrite" : "skip") : "create";
  if (!dryRun && (!exists || force)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  return { path: filePath, action, kind, managed };
}

export function managedSectionBounds(content, startMarker, endMarker) {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) return null;
  return { start, end: end + endMarker.length };
}

export function upsertManagedSection(content, section, startMarker, endMarker) {
  const normalizedSection = section.endsWith("\n") ? section : `${section}\n`;
  const bounds = managedSectionBounds(content, startMarker, endMarker);
  if (bounds) {
    return `${content.slice(0, bounds.start)}${normalizedSection}${content.slice(bounds.end).replace(/^\n/, "")}`;
  }
  const trimmed = content.trimEnd();
  return `${trimmed}${trimmed ? "\n\n" : ""}${normalizedSection}`;
}

export function writeAgentRoute(
  filePath,
  content,
  section,
  { dryRun = false, force = false, merge = false, kind = "agent-route", managed = true, startMarker, endMarker } = {}
) {
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

export function writeGeneratedFile(filePath, content, { dryRun = false, force = false, refresh = false, kind = "file", managed = true } = {}) {
  const exists = fs.existsSync(filePath);
  if (!exists || force) return writeIfSafe(filePath, content, { dryRun, force, kind, managed });
  const currentHash = fileHash(filePath);
  const expectedHash = createHash("sha256").update(content).digest("hex");
  const action = currentHash === expectedHash ? "exists" : (refresh ? "update" : "skip");
  if (!dryRun && action === "update") {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  return {
    path: filePath,
    action,
    kind,
    managed,
    reason: action === "update"
      ? `Existing OpenNori ${kind} will be refreshed without requiring --force.`
      : undefined
  };
}

export function ensureDir(dirPath, { dryRun = false, kind = "directory", managed = true } = {}) {
  const exists = fs.existsSync(dirPath);
  if (!dryRun && !exists) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return { path: dirPath, action: exists ? "exists" : "create", kind, managed };
}
