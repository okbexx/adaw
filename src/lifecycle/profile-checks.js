import fs from "node:fs";
import path from "node:path";
import { addProfileEvidence, readJson } from "../core.js";

function skillSearchPaths(name) {
  const home = process.env.HOME || "";
  return [
    path.join(home, ".agents", "skills", name, "SKILL.md"),
    path.join(home, ".codex", "skills", name, "SKILL.md")
  ].filter(Boolean);
}

function stackIsPresent(root, name) {
  const packageJsonPath = path.join(root, "package.json");
  if (!fs.existsSync(packageJsonPath)) return null;
  try {
    const packageJson = readJson(packageJsonPath);
    const dependencySets = [
      packageJson.dependencies,
      packageJson.devDependencies,
      packageJson.peerDependencies,
      packageJson.optionalDependencies
    ].filter(Boolean);
    return dependencySets.some((dependencies) => Object.prototype.hasOwnProperty.call(dependencies, name));
  } catch {
    return null;
  }
}

export function autoProfileChecks(root, ledger) {
  const items = ledger.capability_profile?.items || [];
  return items.map((item) => {
    if (item.type === "skill") {
      const paths = skillSearchPaths(item.name);
      const foundPath = paths.find((candidate) => fs.existsSync(candidate));
      const result = foundPath ? (item.strength === "avoid" ? "violated" : "satisfied") : (item.strength === "avoid" ? "satisfied" : "unknown");
      return {
        item_id: item.id,
        type: item.type,
        name: item.name,
        strength: item.strength,
        result,
        basis: "local-skill-path",
        summary: foundPath
          ? `Skill ${item.name} is available at ${foundPath}.`
          : `Skill ${item.name} was not found in the standard local Skill paths.`,
        sources: paths.map((candidate) => ({ type: "artifact", label: candidate, path: candidate, exists: fs.existsSync(candidate) })),
        can_auto_record: result !== "unknown"
      };
    }

    if (item.type === "stack") {
      const present = stackIsPresent(root, item.name);
      if (present === true) {
        return {
          item_id: item.id,
          type: item.type,
          name: item.name,
          strength: item.strength,
          result: item.strength === "avoid" ? "violated" : "satisfied",
          basis: "package-json",
          summary: `Stack ${item.name} is present in package.json dependencies.`,
          sources: [{ type: "artifact", label: "package.json", path: path.join(root, "package.json") }],
          can_auto_record: true
        };
      }
      if (present === false) {
        return {
          item_id: item.id,
          type: item.type,
          name: item.name,
          strength: item.strength,
          result: item.strength === "avoid" ? "satisfied" : "unknown",
          basis: "package-json",
          summary: `Stack ${item.name} is not present in package.json dependencies.`,
          sources: [{ type: "artifact", label: "package.json", path: path.join(root, "package.json") }],
          can_auto_record: item.strength === "avoid"
        };
      }
      return {
        item_id: item.id,
        type: item.type,
        name: item.name,
        strength: item.strength,
        result: "unknown",
        basis: "package-json-unavailable",
        summary: "No readable package.json was available for automatic stack checks.",
        sources: [],
        can_auto_record: false
      };
    }

    return {
      item_id: item.id,
      type: item.type,
      name: item.name,
      strength: item.strength,
      result: "unknown",
      basis: "agent-or-human-review-required",
      summary: "Constraint items require agent evidence, human confirmation, or waiver.",
      sources: [],
      can_auto_record: false
    };
  });
}

export function recordAutoProfileChecks(ledger, checks) {
  for (const check of checks.filter((entry) => entry.can_auto_record)) {
    const item = ledger.capability_profile?.items?.find((entry) => entry.id === check.item_id);
    const latest = item?.evidence?.at(-1);
    if (latest?.result === check.result && latest?.summary === check.summary) continue;
    addProfileEvidence(ledger, check.item_id, {
      result: check.result,
      summary: check.summary,
      path: check.sources?.[0]?.path
    });
  }
  return ledger;
}
