import fs from "node:fs";
import path from "node:path";
import { packagePath } from "./package-root.ts";
import {
  OPENNORI_PLUGIN_MANIFEST_PATH,
  OPENNORI_PLUGIN_ROOT,
  OPENNORI_PLUGIN_SKILLS_DIR,
  OPENNORI_SKILLS
} from "./skills.ts";
import type { JsonObject, PluginState } from "./types.ts";

const MARKETPLACE_PLUGIN_PATH = "./plugins/opennori";
const PLUGIN_MANIFEST_PATH = OPENNORI_PLUGIN_MANIFEST_PATH;
const MARKETPLACE_PATH = packagePath(".agents", "plugins", "marketplace.json");
const SKILLS_PATH = OPENNORI_PLUGIN_SKILLS_DIR;

function readPackageJson(filePath: string): JsonObject | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as JsonObject;
  } catch {
    return null;
  }
}

function relativePackagePath(filePath: string): string {
  return path.relative(packagePath(), filePath) || ".";
}

export function pluginState(): PluginState {
  const manifest = readPackageJson(PLUGIN_MANIFEST_PATH);
  const marketplace = readPackageJson(MARKETPLACE_PATH);
  const pluginName = String(manifest?.name || "opennori");
  const pluginVersion = String(manifest?.version || "");
  const skillsPath = String(manifest?.skills || "./skills/");
  const marketplaceName = String(marketplace?.name || "");
  const marketplacePlugins = Array.isArray(marketplace?.plugins) ? marketplace.plugins : [];
  const marketplaceEntry = marketplacePlugins.find((entry) => entry?.name === "opennori") as JsonObject | undefined;
  const marketplacePluginPath = typeof marketplaceEntry?.source === "object" && marketplaceEntry.source
    ? String((marketplaceEntry.source as JsonObject).path || "")
    : typeof marketplaceEntry?.source === "string"
      ? String(marketplaceEntry.source)
      : "";
  const packaged = Boolean(
    manifest
    && pluginName === "opennori"
    && skillsPath === "./skills/"
    && fs.existsSync(OPENNORI_PLUGIN_ROOT)
    && fs.existsSync(SKILLS_PATH)
  );
  const marketplacePackaged = Boolean(
    marketplace
    && marketplaceName === "opennori"
    && marketplaceEntry
    && marketplacePluginPath === MARKETPLACE_PLUGIN_PATH
  );

  return {
    schema_version: "opennori/plugin-v1",
    name: pluginName,
    version: pluginVersion,
    manifest_path: relativePackagePath(PLUGIN_MANIFEST_PATH),
    marketplace_path: relativePackagePath(MARKETPLACE_PATH),
    marketplace_name: marketplaceName,
    marketplace_plugin_path: marketplacePluginPath,
    skills_path: relativePackagePath(SKILLS_PATH),
    packaged,
    marketplace_packaged: marketplacePackaged,
    skill_count: OPENNORI_SKILLS.length,
    skills: OPENNORI_SKILLS.map((skill) => ({
      name: skill.name,
      description: skill.description,
      path: relativePackagePath(skill.asset_path),
      source: "package"
    }))
  };
}
