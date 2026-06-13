import { pluginState } from "../../plugin.ts";
import type {
  DoctorCheck,
  Manifest,
  PluginState
} from "../../types.ts";
import { doctorCheck } from "./shared.ts";

export type PluginHealthInspection = {
  checks: DoctorCheck[];
  plugin: PluginState;
};

export function inspectPluginHealth(manifest: Manifest | null, manifestReadable: boolean): PluginHealthInspection {
  const checks: DoctorCheck[] = [];
  const plugin = pluginState();
  const expectedNames = new Set(plugin.skills.map((skill) => skill.name));
  const manifestNames = new Set((manifest?.plugin?.skills || []).map((skill) => skill.name));
  const manifestMatches = !manifestReadable || (
    manifest?.plugin?.schema_version === "opennori/plugin-v1"
    && manifest?.plugin?.name === plugin.name
    && manifest?.plugin?.skill_count === plugin.skill_count
    && expectedNames.size === manifestNames.size
    && [...expectedNames].every((name) => manifestNames.has(name))
  );

  checks.push(doctorCheck(
    "plugin_manifest",
    plugin.packaged,
    plugin.packaged
      ? "OpenNori Codex Plugin manifest and package Skill assets are present."
      : "OpenNori package is missing plugins/opennori/.codex-plugin/plugin.json or plugins/opennori/skills/ assets.",
    "Reinstall OpenNori from npm or the source repository, then rerun opennori doctor --root <project> --json.",
    "broken"
  ));
  checks.push(doctorCheck(
    "plugin_marketplace",
    plugin.marketplace_packaged,
    plugin.marketplace_packaged
      ? "OpenNori Codex marketplace metadata is present."
      : "OpenNori package is missing .agents/plugins/marketplace.json or the opennori entry pointing to ./plugins/opennori.",
    "Reinstall OpenNori from npm or the source repository; Codex Plugin installs require a marketplace entry.",
    "broken"
  ));
  checks.push(doctorCheck(
    "plugin_skills",
    plugin.skill_count > 0 && plugin.skills.some((skill) => skill.name === "nori"),
    `OpenNori package exposes ${plugin.skill_count} Skill asset(s).`,
    "Reinstall OpenNori from npm or the source repository; the nori entry Skill must be packaged.",
    "broken"
  ));
  checks.push(doctorCheck(
    "manifest_plugin_state",
    manifestMatches,
    manifestMatches ? "Manifest Plugin state matches package Skill assets." : "Manifest Plugin state is stale or missing.",
    "Refresh the manifest with opennori bootstrap --root <project> --json."
  ));

  return { checks, plugin };
}
