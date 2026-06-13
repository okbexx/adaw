import fs from "node:fs";
import path from "node:path";
import { packagePath } from "./package-root.ts";
import { OPENNORI_SKILLS } from "./skills.ts";
import type { JsonObject, PluginState } from "./types.ts";

const PLUGIN_MANIFEST_PATH = packagePath(".codex-plugin", "plugin.json");
const SKILLS_PATH = packagePath("skills");

function readPluginManifest(): JsonObject | null {
  try {
    return JSON.parse(fs.readFileSync(PLUGIN_MANIFEST_PATH, "utf8")) as JsonObject;
  } catch {
    return null;
  }
}

function relativePackagePath(filePath: string): string {
  return path.relative(packagePath(), filePath) || ".";
}

export function pluginState(): PluginState {
  const manifest = readPluginManifest();
  const pluginName = String(manifest?.name || "opennori");
  const pluginVersion = String(manifest?.version || "");
  const skillsPath = String(manifest?.skills || "./skills/");
  const packaged = Boolean(
    manifest
    && pluginName === "opennori"
    && skillsPath === "./skills/"
    && fs.existsSync(SKILLS_PATH)
  );

  return {
    schema_version: "opennori/plugin-v1",
    name: pluginName,
    version: pluginVersion,
    manifest_path: relativePackagePath(PLUGIN_MANIFEST_PATH),
    skills_path: relativePackagePath(SKILLS_PATH),
    packaged,
    skill_count: OPENNORI_SKILLS.length,
    skills: OPENNORI_SKILLS.map((skill) => ({
      name: skill.name,
      description: skill.description,
      path: relativePackagePath(skill.asset_path),
      source: "package"
    }))
  };
}
