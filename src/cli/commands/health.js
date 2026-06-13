import { spawnSync } from "node:child_process";
import path from "node:path";
import { defineCommand } from "citty";
import { auditAcceptanceQuality } from "../../acceptance.js";
import { architectureState } from "../../architecture.js";
import { currentGap, evidenceHealth, fail, findActivePairs, ok, readJson, validateContract } from "../../core.js";
import { applyUninstallActions, bootstrap, buildInstallPlan, buildUninstallActions, buildUninstallPlan, doctor, installActions } from "../../lifecycle.js";
import { runJsonCommand } from "../runtime.js";

function classifyChangedFile(filePath) {
  if (
    filePath.startsWith(".opennori/") ||
    filePath.startsWith("examples/")
  ) {
    return "acceptance";
  }
  return "implementation";
}

function gitChanges(root) {
  const result = spawnSync("git", ["status", "--short", "--untracked-files=all"], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    return { available: false, acceptance: [], implementation: [], raw_error: result.stderr.trim() };
  }

  const grouped = { available: true, acceptance: [], implementation: [] };
  for (const line of result.stdout.split("\n")) {
    if (!line.trim()) continue;
    const status = line.slice(0, 2).trim() || "modified";
    const rawPath = line.slice(3).trim();
    const filePath = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) : rawPath;
    grouped[classifyChangedFile(filePath)].push({ status, path: filePath });
  }
  return grouped;
}

export function bootstrapResult({ root, confirmed = false }) {
  return bootstrap(path.resolve(String(root || process.cwd())), { confirmed: Boolean(confirmed) });
}

export function installResult({
  root,
  dryRun = false,
  force = false,
  confirmed = false,
  requestedSkill = false,
  refreshSkill = false,
  mergeAgentRoute = false
}) {
  const projectRoot = path.resolve(String(root || process.cwd()));
  if ((force || refreshSkill || mergeAgentRoute) && !dryRun && !confirmed) {
    const previewFlags = [
      "--dry-run",
      force ? "--force" : null,
      requestedSkill ? "--skill" : null,
      refreshSkill ? "--refresh-skill" : null,
      mergeAgentRoute ? "--merge-agent-route" : null,
      "--json"
    ].filter(Boolean).join(" ");
    return fail(
      "confirm_required",
      "Install may update existing OpenNori-managed project assets.",
      `Run opennori install --root <project> ${previewFlags} first, then rerun with --confirm if the planned updates are acceptable.`
    );
  }

  const actions = installActions(projectRoot, { dryRun, force, requestedSkill, refreshSkill, mergeAgentRoute });
  const manifestAction = actions.find((action) => action.kind === "manifest");
  const installPlan = buildInstallPlan(projectRoot, actions, { dryRun, force, requestedSkill, refreshSkill, mergeAgentRoute });
  return ok({
    root: projectRoot,
    dry_run: dryRun,
    force,
    confirmed,
    install_plan: installPlan,
    actions: installPlan.actions,
    manifest: manifestAction.manifest
  });
}

export function uninstallResult({
  root,
  dryRun = false,
  confirmed = false,
  includeState = false
}) {
  const projectRoot = path.resolve(String(root || process.cwd()));
  const actions = buildUninstallActions(projectRoot, { includeState });
  const uninstallPlan = buildUninstallPlan(projectRoot, actions, { dryRun, includeState });

  if (!dryRun && !confirmed) {
    return fail(
      "confirm_required",
      "Uninstall removes OpenNori-managed project assets.",
      "Run opennori uninstall --root <project> --dry-run --json first, then rerun with --confirm if the planned removals are acceptable."
    );
  }

  if (!dryRun) {
    applyUninstallActions(actions);
  }

  return ok({
    root: projectRoot,
    dry_run: dryRun,
    confirmed,
    include_state: includeState,
    uninstall_plan: uninstallPlan,
    actions: uninstallPlan.actions
  });
}

export const doctorCommand = defineCommand({
  meta: {
    name: "doctor",
    description: "Diagnose OpenNori project state and recovery actions."
  },
  args: {
    root: {
      type: "string",
      description: "Project root.",
      default: process.cwd()
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ args }) {
    const root = path.resolve(String(args.root || process.cwd()));
    return ok({
      name: "opennori",
      root,
      ...doctor(root),
      side_effect: "none"
    });
  }
});

export const bootstrapCommand = defineCommand({
  meta: {
    name: "bootstrap",
    description: "Prepare OpenNori project assets with preview-first setup."
  },
  args: {
    root: {
      type: "string",
      description: "Project root.",
      default: process.cwd()
    },
    confirm: {
      type: "boolean",
      description: "Apply setup actions after preview.",
      default: false
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ args }) {
    return bootstrapResult({ root: args.root, confirmed: args.confirm });
  }
});

export async function runBootstrapCommand(rawArgs) {
  return runJsonCommand(bootstrapCommand, rawArgs);
}

export const installCommand = defineCommand({
  meta: {
    name: "install",
    description: "Install or refresh OpenNori project assets with preview-first safety."
  },
  args: {
    root: {
      type: "string",
      description: "Project root.",
      default: process.cwd()
    },
    skill: {
      type: "boolean",
      description: "Install the OpenNori Skill Pack.",
      default: false
    },
    refreshSkill: {
      type: "boolean",
      description: "Refresh installed OpenNori Skills.",
      default: false
    },
    mergeAgentRoute: {
      type: "boolean",
      description: "Merge the OpenNori agent route into AGENTS.md and CLAUDE.md.",
      default: false
    },
    dryRun: {
      type: "boolean",
      description: "Preview planned changes without writing files.",
      default: false
    },
    force: {
      type: "boolean",
      description: "Overwrite managed OpenNori assets after confirmation.",
      default: false
    },
    confirm: {
      type: "boolean",
      description: "Apply update or overwrite actions after preview.",
      default: false
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ args }) {
    return installResult({
      root: args.root,
      dryRun: Boolean(args.dryRun),
      force: Boolean(args.force),
      confirmed: Boolean(args.confirm),
      requestedSkill: Boolean(args.skill),
      refreshSkill: Boolean(args.refreshSkill),
      mergeAgentRoute: Boolean(args.mergeAgentRoute)
    });
  }
});

export async function runInstallCommand(rawArgs) {
  return runJsonCommand(installCommand, rawArgs);
}

export const uninstallCommand = defineCommand({
  meta: {
    name: "uninstall",
    description: "Remove OpenNori managed project assets with preview-first safety."
  },
  args: {
    root: {
      type: "string",
      description: "Project root.",
      default: process.cwd()
    },
    includeState: {
      type: "boolean",
      description: "Also remove the .opennori state directory after confirmation.",
      default: false
    },
    dryRun: {
      type: "boolean",
      description: "Preview planned removals without deleting files.",
      default: false
    },
    confirm: {
      type: "boolean",
      description: "Apply removals after preview.",
      default: false
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ args }) {
    return uninstallResult({
      root: args.root,
      dryRun: Boolean(args.dryRun),
      confirmed: Boolean(args.confirm),
      includeState: Boolean(args.includeState)
    });
  }
});

export async function runUninstallCommand(rawArgs) {
  return runJsonCommand(uninstallCommand, rawArgs);
}

export async function runDoctorCommand(rawArgs) {
  return runJsonCommand(doctorCommand, rawArgs);
}

export const listCommand = defineCommand({
  meta: {
    name: "list",
    description: "List recoverable active OpenNori goals."
  },
  args: {
    root: {
      type: "string",
      description: "Project root.",
      default: process.cwd()
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ args }) {
    const root = path.resolve(String(args.root || process.cwd()));
    const activeGoals = findActivePairs(root).map((pair) => {
      const payload = readJson(pair.evidencePath);
      return {
        goal_id: pair.goalId,
        status: payload.ledger?.status || "unknown",
        current_gap: currentGap(payload.contract, payload.ledger),
        acceptance_path: pair.acceptancePath,
        evidence_path: pair.evidencePath
      };
    });
    return ok({ root, active_goals: activeGoals });
  }
});

export async function runListCommand(rawArgs) {
  return runJsonCommand(listCommand, rawArgs);
}

export const checkCommand = defineCommand({
  meta: {
    name: "check",
    description: "Validate active OpenNori contract quality, architecture health, and evidence health."
  },
  args: {
    root: {
      type: "string",
      description: "Project root.",
      default: process.cwd()
    },
    goal: {
      type: "string",
      description: "Active goal id to inspect."
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ data }) {
    const { contract, ledger, root } = data.loadPair();
    const issues = validateContract(contract, ledger);
    if (issues.length > 0) {
      return { ...fail("invalid_acceptance", "Acceptance contract failed validation", "Fix reported issues before continuing"), issues };
    }
    const acceptanceQuality = auditAcceptanceQuality(contract);
    const warnings = acceptanceQuality.findings.map((finding) => ({
      type: "acceptance_quality",
      criterion_id: finding.criterion_id,
      gap_id: finding.gap_id,
      message: finding.question
    }));
    const nextActions = acceptanceQuality.status === "needs-user-review"
      ? ["Ask the user the acceptance_quality questions, then revise the affected criteria before relying on this contract as complete."]
      : [];
    const architecture = architectureState(root, contract.goal_id);
    const architectureWarnings = [];
    if (architecture.decision === "missing") {
      architectureWarnings.push({
        type: "architecture",
        message: "Active goal has no Architecture Baseline.",
        recovery: "Preview an Architecture Baseline, show it to the user, then rerun opennori architecture baseline --root <project> --goal <goal> --confirm --json after confirmation."
      });
    }
    if (architecture.decision === "draft") {
      architectureWarnings.push({
        type: "architecture",
        message: "Architecture Baseline is still draft.",
        recovery: "Ask the user to confirm or revise the baseline before implementation."
      });
    }
    if (architecture.decision === "invalid") {
      architectureWarnings.push({
        type: "architecture",
        message: "Architecture Baseline is invalid.",
        recovery: "Inspect .opennori/architecture/baseline.json, fix the reported issues, then rerun opennori check."
      });
    }
    if (architecture.decision === "challenged") {
      architectureWarnings.push({
        type: "architecture",
        message: "Architecture Baseline has open challenges.",
        recovery: "Ask the user to resolve the Architecture Challenge before claiming architecture completion."
      });
    }
    if (!architecture.agent_surface.guide.installed || !architecture.agent_surface.guide.in_sync) {
      architectureWarnings.push({
        type: "architecture",
        message: ".opennori/agent-guide.md is missing or stale.",
        recovery: "Preview opennori install --root <project> --merge-agent-route --dry-run --json, then confirm the refresh if acceptable."
      });
    }
    if (!architecture.agent_surface.agents.references_baseline && !architecture.agent_surface.claude.references_baseline) {
      architectureWarnings.push({
        type: "architecture",
        message: "No project agent route references the Architecture Baseline.",
        recovery: "Preview opennori install --root <project> --merge-agent-route --dry-run --json, then confirm the non-destructive merge if acceptable."
      });
    }
    const architectureStatus = architectureWarnings.length > 0 ? "needs-action" : "clear";
    const buildVsBuyWarnings = architecture.build_vs_buy.findings.map((finding) => ({
      type: "build_vs_buy",
      decision_id: finding.decision_id,
      severity: finding.severity,
      issue: finding.issue,
      message: finding.message,
      recovery: finding.recovery
    }));
    const health = evidenceHealth(contract, ledger);
    const evidenceHealthWarnings = health.findings.map((finding) => ({
      type: "evidence_health",
      criterion_id: finding.criterion_id,
      severity: finding.severity,
      issue: finding.issue,
      message: finding.message,
      recovery: finding.recovery
    }));
    const combinedWarnings = [...warnings, ...architectureWarnings, ...buildVsBuyWarnings, ...evidenceHealthWarnings];
    if (architectureStatus === "needs-action") {
      nextActions.push("Resolve architecture_check warnings before treating this goal as architecture-complete.");
    }
    if (architecture.build_vs_buy.status !== "clear") {
      nextActions.push("Resolve build_vs_buy warnings before treating custom infrastructure as mature.");
    }
    if (health.status !== "clear") {
      nextActions.push("Review evidence_health warnings before treating this goal as confidently complete.");
    }
    return ok({
      goal_id: contract.goal_id,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger),
      statuses: Object.fromEntries(Object.entries(ledger.criteria).map(([id, state]) => [id, state.status])),
      acceptance_quality: acceptanceQuality,
      architecture_check: {
        status: architectureStatus,
        decision: architecture.decision,
        warnings: architectureWarnings,
        architecture
      },
      evidence_health: health
    }, [], combinedWarnings, nextActions);
  }
});

export async function runCheckCommand(rawArgs, { loadPair }) {
  return runJsonCommand(checkCommand, rawArgs, { loadPair });
}

export const changesCommand = defineCommand({
  meta: {
    name: "changes",
    description: "Group current git changes by OpenNori acceptance assets and implementation files."
  },
  args: {
    root: {
      type: "string",
      description: "Project root.",
      default: process.cwd()
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ args }) {
    const root = path.resolve(String(args.root || process.cwd()));
    const pairs = findActivePairs(root).map((pair) => {
      const payload = readJson(pair.evidencePath);
      return {
        goal_id: pair.goalId,
        workflow_status: payload.ledger?.status || "unknown",
        current_gap: currentGap(payload.contract, payload.ledger)
      };
    });
    return ok({
      root,
      active_goals: pairs,
      changed_files: gitChanges(root)
    });
  }
});

export async function runChangesCommand(rawArgs) {
  return runJsonCommand(changesCommand, rawArgs);
}
