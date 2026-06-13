import type {
  DoctorCheck,
  DoctorIssue,
  DoctorRecoveryAction,
  DoctorState
} from "../../types.ts";

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function doctorCheck(name: string, condition: boolean, summary: string, recovery?: string, severity = "needs-action"): DoctorCheck {
  const check: DoctorCheck = { name, ok: Boolean(condition), summary };
  if (!condition && recovery) check.recovery = recovery;
  if (!condition) check.severity = severity;
  return check;
}

export function doctorRecoveryActions(checks: DoctorCheck[], activeIssues: DoctorIssue[] = []): DoctorRecoveryAction[] {
  const actions: DoctorRecoveryAction[] = checks
    .filter((check) => !check.ok && check.recovery)
    .map((check) => ({
      check: check.name,
      severity: check.severity || "needs-action",
      action: check.recovery || "Inspect this OpenNori doctor check and rerun opennori doctor after recovery."
    }));

  for (const issue of activeIssues) {
    actions.push({
      check: "active_goal_issue",
      severity: "broken",
      goal_id: issue.goal_id,
      path: issue.path,
      action: issue.path
        ? `Inspect .opennori/active/${issue.goal_id}.evidence.json and fix ${issue.path}: ${issue.message}`
        : `Inspect .opennori/active/${issue.goal_id}.acceptance.md and .opennori/active/${issue.goal_id}.evidence.json: ${issue.message}`
    });
  }

  return actions;
}

export function doctorStatus(checks: DoctorCheck[]): DoctorState["status"] {
  return checks.every((check) => check.ok)
    ? "ready"
    : checks.some((check) => !check.ok && check.severity === "broken")
      ? "broken"
      : "needs-action";
}
