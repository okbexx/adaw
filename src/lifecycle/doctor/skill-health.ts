import { projectSkillPackState, projectSkillState } from "../manifest.ts";
import { sameStringSet } from "../shared.ts";
import type {
  DoctorCheck,
  Manifest,
  ProjectSkillPackState,
  ProjectSkillState
} from "../../types.ts";
import { doctorCheck } from "./shared.ts";

export type SkillHealthInspection = {
  checks: DoctorCheck[];
  skill: ProjectSkillState;
  skillPack: ProjectSkillPackState;
};

export function inspectSkillHealth(root: string, manifest: Manifest | null, manifestReadable: boolean): SkillHealthInspection {
  const checks: DoctorCheck[] = [];
  const skill = projectSkillState(root);
  const skillPack = projectSkillPackState(root);
  const manifestSkillInstalled = manifest?.skill?.installed === true;
  const skillOk = !skill.installed && !manifestSkillInstalled ? true : skill.installed && skill.in_sync;

  if (manifestReadable) {
    const readableManifest = manifest as Manifest;
    checks.push(doctorCheck(
      "manifest_skill_state",
      Boolean(readableManifest.skill) && readableManifest.skill.installed === skill.installed && readableManifest.skill.path === skill.path,
      "Manifest Skill state matches the project Skill location.",
      "Refresh the manifest with opennori bootstrap --root <project> --json."
    ));
  }
  checks.push(doctorCheck(
    "skill_sync",
    skillOk,
    skill.installed
      ? (skill.in_sync ? "Project OpenNori Skill is installed and in sync." : "Project OpenNori Skill is installed but stale.")
      : "Project OpenNori Skill is not installed; this is optional unless the manifest expects it.",
    "Preview opennori install --root <project> --skill --refresh-skill --dry-run --json, then rerun with --confirm if the updates are acceptable."
  ));

  const manifestPackNames = new Set((manifest?.skill_pack?.skills || []).map((entry) => entry.name));
  const packNames = new Set(skillPack.skills.map((entry) => entry.name));
  const manifestPackMatches = !manifestReadable || (
    manifest?.skill_pack?.schema_version === "opennori/skill-pack-v1"
    && sameStringSet([...manifestPackNames], [...packNames])
  );
  checks.push(doctorCheck(
    "skill_pack_manifest",
    manifestPackMatches,
    manifestPackMatches ? "Manifest Skill Pack state is readable." : "Manifest Skill Pack state is missing or stale.",
    "Refresh the manifest with opennori install --root <project> --skill --json."
  ));
  const packExpected = manifest?.skill_pack?.installed === true || skillPack.skills.some((entry) => entry.installed);
  const packOk = packExpected ? skillPack.installed && skillPack.in_sync : true;
  checks.push(doctorCheck(
    "skill_pack_sync",
    packOk,
    skillPack.installed
      ? (skillPack.in_sync ? "OpenNori Skill Pack is installed and in sync." : "OpenNori Skill Pack is installed but stale.")
      : "OpenNori Skill Pack is not installed; this is optional unless the manifest expects it.",
    "Preview opennori install --root <project> --skill --refresh-skill --dry-run --json, then rerun with --confirm if the updates are acceptable."
  ));

  return {
    checks,
    skill,
    skillPack
  };
}
