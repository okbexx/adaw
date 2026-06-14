import { spawnSync } from "node:child_process";
import path from "node:path";
import { fail, ok } from "../core.ts";
import { pluginState } from "../plugin.ts";
import type { InstallPlan, LifecyclePlanAction, NoriResult } from "../types.ts";
import { bootstrap } from "./bootstrap.ts";
import { doctor } from "./doctor.ts";
import { installActions } from "./install.ts";
import { buildInstallPlan } from "./plans.ts";
import { PACKAGE_JSON } from "./shared.ts";

export type SetupActionStatus = "exists" | "will-run" | "unavailable" | "applied" | "failed";

export type SetupPlanAction = {
  id: "codex_marketplace" | "codex_plugin" | "packaged_skills" | "global_cli" | "project_state" | "doctor";
  kind: string;
  action: SetupActionStatus;
  command?: string[];
  command_display?: string;
  would_write: boolean;
  will_write: boolean;
  destructive: boolean;
  reason: string;
  recovery?: string;
  stdout?: string;
  stderr?: string;
};

export type SetupPlan = {
  schema_version: "opennori/setup-plan-v1";
  root: string;
  dry_run: boolean;
  confirmed: boolean;
  summary: {
    total: number;
    would_write: number;
    will_write: number;
    unavailable: number;
    destructive: number;
  };
  actions: SetupPlanAction[];
  project_install_plan: InstallPlan;
};

export type SetupCommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
};

export type SetupCommandRunner = (command: string, args: string[]) => SetupCommandResult;

export type SetupOptions = {
  root?: string;
  dryRun?: boolean;
  confirmed?: boolean;
  runner?: SetupCommandRunner;
};

function defaultRunner(command: string, args: string[]): SetupCommandResult {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error
  };
}

function commandDisplay(command: string[]): string {
  return command.map((part) => (/^[a-zA-Z0-9_./@:-]+$/.test(part) ? part : JSON.stringify(part))).join(" ");
}

function commandAction(
  id: SetupPlanAction["id"],
  kind: string,
  command: string[],
  reason: string,
  { exists = false, available = true, confirmed = false, recovery }: { exists?: boolean; available?: boolean; confirmed?: boolean; recovery?: string } = {}
): SetupPlanAction {
  if (!available) {
    return {
      id,
      kind,
      action: "unavailable",
      command,
      command_display: commandDisplay(command),
      would_write: false,
      will_write: false,
      destructive: false,
      reason,
      recovery
    };
  }
  if (exists) {
    return {
      id,
      kind,
      action: "exists",
      command,
      command_display: commandDisplay(command),
      would_write: false,
      will_write: false,
      destructive: false,
      reason
    };
  }
  return {
    id,
    kind,
    action: "will-run",
    command,
    command_display: commandDisplay(command),
    would_write: true,
    will_write: confirmed,
    destructive: false,
    reason
  };
}

function includesMarketplace(stdout: string): boolean {
  return /^opennori\s/m.test(stdout);
}

function includesInstalledPlugin(stdout: string): boolean {
  return /opennori@opennori\s+installed,\s+enabled/.test(stdout);
}

function globalPackageVersion(stdout: string): string | null {
  try {
    const payload = JSON.parse(stdout) as { dependencies?: Record<string, { version?: string }> };
    return payload.dependencies?.opennori?.version || null;
  } catch {
    return null;
  }
}

function packagedSkillsAction(): SetupPlanAction {
  const plugin = pluginState();
  const available = plugin.packaged && plugin.skill_count > 0 && plugin.skills.some((skill) => skill.name === "nori");
  return {
    id: "packaged_skills",
    kind: "packaged-skills",
    action: available ? "exists" : "unavailable",
    would_write: false,
    will_write: false,
    destructive: false,
    reason: available
      ? `OpenNori package includes ${plugin.skill_count} packaged Skill assets for Codex discovery.`
      : "OpenNori package is missing packaged Skill assets.",
    recovery: available ? undefined : "Reinstall OpenNori from npm or the source repository, then rerun npx opennori setup."
  };
}

function inspectExternalActions(runner: SetupCommandRunner, confirmed: boolean): SetupPlanAction[] {
  const marketplaceCommand = ["codex", "plugin", "marketplace", "add", "okbexx/opennori", "--ref", "main"];
  const pluginCommand = ["codex", "plugin", "add", "opennori@opennori"];
  const globalCliCommand = ["npm", "install", "-g", `opennori@${PACKAGE_JSON.version}`];

  const marketplaceList = runner("codex", ["plugin", "marketplace", "list"]);
  const codexAvailable = marketplaceList.status === 0;
  const marketplaceExists = codexAvailable && includesMarketplace(marketplaceList.stdout);

  const pluginList = codexAvailable ? runner("codex", ["plugin", "list"]) : { status: null, stdout: "", stderr: "", error: marketplaceList.error };
  const pluginExists = pluginList.status === 0 && includesInstalledPlugin(pluginList.stdout);

  const globalList = runner("npm", ["ls", "-g", "opennori", "--depth=0", "--json"]);
  const npmAvailable = globalList.error === undefined && globalList.status !== null;
  const installedVersion = globalPackageVersion(globalList.stdout);
  const globalCliExists = npmAvailable && installedVersion === PACKAGE_JSON.version;

  return [
    commandAction(
      "codex_marketplace",
      "codex-plugin-marketplace",
      marketplaceCommand,
      marketplaceExists
        ? "OpenNori Codex Plugin marketplace is already registered."
        : "Register the OpenNori marketplace through the official Codex Plugin CLI.",
      {
        exists: marketplaceExists,
        available: codexAvailable,
        confirmed,
        recovery: "Install or repair the Codex CLI, then rerun npx opennori setup."
      }
    ),
    commandAction(
      "codex_plugin",
      "codex-plugin",
      pluginCommand,
      pluginExists
        ? "OpenNori Codex Plugin is already installed and enabled."
        : "Install the OpenNori Codex Plugin so Codex can discover packaged Skills.",
      {
        exists: pluginExists,
        available: codexAvailable,
        confirmed,
        recovery: "Install or repair the Codex CLI, then rerun npx opennori setup."
      }
    ),
    packagedSkillsAction(),
    commandAction(
      "global_cli",
      "global-cli",
      globalCliCommand,
      globalCliExists
        ? `Global opennori CLI ${installedVersion} is already installed.`
        : "Install the opennori CLI globally so projects can be initialized with opennori init.",
      {
        exists: globalCliExists,
        available: npmAvailable,
        confirmed,
        recovery: "Install or repair npm, then rerun npx opennori setup."
      }
    )
  ];
}

function projectStateAction(installPlan: InstallPlan, confirmed: boolean): SetupPlanAction {
  return {
    id: "project_state",
    kind: "project-state",
    action: installPlan.summary.would_write > 0 ? "will-run" : "exists",
    command: ["opennori", "init"],
    command_display: "opennori init",
    would_write: installPlan.summary.would_write > 0,
    will_write: confirmed && installPlan.summary.would_write > 0,
    destructive: installPlan.summary.destructive > 0,
    reason: installPlan.summary.would_write > 0
      ? "Initialize or refresh the current project .opennori state directory."
      : "Current project OpenNori state is already present."
  };
}

function doctorAction(confirmed: boolean): SetupPlanAction {
  return {
    id: "doctor",
    kind: "doctor",
    action: "will-run",
    command: ["opennori", "doctor"],
    command_display: "opennori doctor",
    would_write: false,
    will_write: confirmed,
    destructive: false,
    reason: "Run OpenNori doctor after setup so the user can see bundle readiness."
  };
}

function summarize(actions: SetupPlanAction[]) {
  return {
    total: actions.length,
    would_write: actions.filter((action) => action.would_write).length,
    will_write: actions.filter((action) => action.will_write).length,
    unavailable: actions.filter((action) => action.action === "unavailable").length,
    destructive: actions.filter((action) => action.destructive).length
  };
}

export function buildSetupPlan(root: string, { dryRun = true, confirmed = false, runner = defaultRunner }: SetupOptions = {}): SetupPlan {
  const willApply = confirmed && !dryRun;
  const projectActions = installActions(root, { dryRun: !willApply, force: false, mergeAgentRoute: false });
  const projectInstallPlan = buildInstallPlan(root, projectActions, { dryRun: !willApply, force: false, mergeAgentRoute: false });
  const actions = [
    ...inspectExternalActions(runner, willApply),
    projectStateAction(projectInstallPlan, willApply),
    doctorAction(willApply)
  ];
  return {
    schema_version: "opennori/setup-plan-v1",
    root,
    dry_run: !willApply,
    confirmed,
    summary: summarize(actions),
    actions,
    project_install_plan: projectInstallPlan
  };
}

function runSetupAction(action: SetupPlanAction, runner: SetupCommandRunner): SetupPlanAction {
  if (!action.command || !action.will_write || action.action !== "will-run") return action;
  const [command, ...args] = action.command;
  if (!command) return action;
  const result = runner(command, args);
  if (result.status === 0) {
    return {
      ...action,
      action: "applied",
      stdout: result.stdout.trim() || undefined,
      stderr: result.stderr.trim() || undefined
    };
  }
  return {
    ...action,
    action: "failed",
    stdout: result.stdout.trim() || undefined,
    stderr: result.stderr.trim() || result.error?.message || undefined
  };
}

export function setup(root: string, { dryRun = true, confirmed = false, runner = defaultRunner }: SetupOptions = {}): NoriResult {
  const projectRoot = path.resolve(root);
  const plan = buildSetupPlan(projectRoot, { dryRun, confirmed, runner });
  const needsConfirm = !confirmed || dryRun;
  if (needsConfirm) {
    return ok(
      {
        root: projectRoot,
        status: "needs_confirm",
        confirmed,
        setup_plan: plan,
        next: "Show this setup preview to the user and ask for confirmation before installing the OpenNori capability bundle."
      },
      [],
      plan.summary.unavailable > 0 ? [{ type: "setup", message: "Some setup commands are unavailable on this machine." }] : [],
      ["Rerun npx opennori setup --confirm after the user approves this preview."]
    );
  }

  const unavailable = plan.actions.filter((action) => action.action === "unavailable");
  if (unavailable.length > 0) {
    return fail(
      "setup_unavailable",
      `OpenNori setup cannot continue because ${unavailable.map((action) => action.kind).join(", ")} is unavailable.`,
      unavailable.map((action) => action.recovery).filter(Boolean).join(" ")
    );
  }

  const appliedActions: SetupPlanAction[] = [];
  for (const action of plan.actions) {
    if (action.id === "project_state" || action.id === "doctor") {
      appliedActions.push(action);
      continue;
    }
    const applied = runSetupAction(action, runner);
    appliedActions.push(applied);
    if (applied.action === "failed") {
      return fail(
        "setup_failed",
        `OpenNori setup failed while running ${applied.command_display || applied.kind}.`,
        applied.stderr || "Review the setup preview and rerun npx opennori setup after resolving the command failure."
      );
    }
  }

  const project = bootstrap(projectRoot, { confirmed: true });
  if (!project.ok) return project;
  const health = doctor(projectRoot);
  const completedPlan: SetupPlan = {
    ...plan,
    summary: summarize(appliedActions),
    actions: appliedActions.map((action) => {
      if (action.id === "project_state") {
        return {
          ...action,
          action: project.data.status === "ready" ? "exists" : "applied",
          will_write: project.data.status !== "ready"
        };
      }
      if (action.id === "doctor") return { ...action, action: "applied" };
      return action;
    })
  };

  return ok(
    {
      root: projectRoot,
      status: health.status === "ready" ? "ready" : "needs-action",
      confirmed: true,
      setup_plan: completedPlan,
      project,
      doctor: health,
      next: health.status === "ready"
        ? "OpenNori capability bundle is ready. Open a new Codex session and ask the agent to use OpenNori for the goal."
        : "OpenNori setup finished, but doctor found recovery actions."
    },
    [],
    health.status === "ready" ? [] : [{ type: "doctor", message: "OpenNori doctor reported recovery actions after setup." }],
    health.status === "ready"
      ? ["Open a new Codex session so Codex can load the newly installed OpenNori Plugin and Skills."]
      : health.recovery_actions.map((action) => action.action)
  );
}
