import fs from "node:fs";
import path from "node:path";
import { ok } from "../core.ts";
import { doctor } from "./doctor.ts";
import { installActions } from "./install.ts";
import { buildInstallPlan } from "./plans.ts";
import type { BootstrapData, NoriResult } from "../types.ts";

export function bootstrap(root: string, { confirmed = false } = {}): NoriResult<BootstrapData> {
  const health = doctor(root);
  if (health.status === "ready") {
    return ok({
      root,
      status: "ready",
      confirmed,
      side_effect: "none",
      doctor: health,
      next: "OpenNori is ready. Continue from opennori resume/status, brainstorm, or draft based on the user's goal."
    });
  }

  const hasState = fs.existsSync(path.join(root, ".opennori"));
  const needsConfirm = !confirmed;
  const actions = installActions(root, {
    dryRun: needsConfirm,
    force: false,
    mergeAgentRoute: false
  });
  const installPlan = buildInstallPlan(root, actions, {
    dryRun: needsConfirm,
    force: false,
    mergeAgentRoute: false
  });
  const next = needsConfirm
    ? "Show this preview to the user and ask for confirmation before writing OpenNori project assets."
    : "OpenNori project assets are installed. Continue with the user's goal.";

  return ok(
    {
      root,
      status: needsConfirm ? "needs_confirm" : "installed",
      confirmed,
      existing_state: hasState,
      install_plan: installPlan,
      actions: installPlan.actions,
      doctor: needsConfirm ? health : doctor(root),
      next
    },
    [],
    hasState && health.status === "broken"
      ? [{ message: "Existing OpenNori state was not ready before bootstrap; review doctor output after install." }]
      : [],
    [next]
  );
}
