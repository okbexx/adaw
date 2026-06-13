import { architectureState } from "../architecture.ts";
import type {
  DoctorCheck,
  DoctorState
} from "../types.ts";
import { inspectActiveGoals } from "./doctor/active-goals.ts";
import { inspectManifestHealth } from "./doctor/manifest-health.ts";
import { architectureHealthChecks, projectHealthChecks } from "./doctor/project-health.ts";
import { doctorCheck, doctorRecoveryActions, doctorStatus } from "./doctor/shared.ts";
import { inspectSkillHealth } from "./doctor/skill-health.ts";

export function doctor(root: string): DoctorState {
  const checks: DoctorCheck[] = [];
  const active = inspectActiveGoals(root);
  const architecture = architectureState(root, active.details[0]?.goal_id);
  const manifest = inspectManifestHealth(root, active.details);

  checks.push(...projectHealthChecks(root));
  checks.push(...architectureHealthChecks(architecture, active.details.length > 0));
  checks.push(...manifest.checks);
  checks.push(doctorCheck(
    "active_goals_recoverable",
    active.issues.length === 0,
    active.issues.length === 0 ? `${active.details.length} active goal(s) are recoverable.` : `${active.issues.length} active goal issue(s) found.`,
    "Inspect active_goal_issues, fix the reported .opennori/active/<goal>.acceptance.md and .opennori/active/<goal>.evidence.json pair, then rerun opennori doctor --root <project> --json.",
    "broken"
  ));
  const skill = inspectSkillHealth(root, manifest.manifest, manifest.manifestReadable);
  checks.push(...skill.checks);

  return {
    status: doctorStatus(checks),
    checks,
    recovery_actions: doctorRecoveryActions(checks, active.issues),
    active_goals: active.details,
    active_goal_issues: active.issues,
    manifest_path: manifest.manifestFile,
    skill: skill.skill,
    skill_pack: skill.skillPack,
    architecture
  };
}
