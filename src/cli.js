import { parseArgs } from "node:util";
import { fail, ok } from "./core.js";
import { runApproveCommand, runBrainstormCommand, runCriterionUpdateCommand, runDiscoverCommand, runDraftCommand, runEvaluateCommand, runInitCommand, runNextCommand, runResumeCommand, runStatusCommand } from "./cli/commands/acceptance.js";
import { runArchitectureBaselineCommand, runArchitectureBuildVsBuyCommand, runArchitectureChallengeCommand, runArchitectureProfileCommand, runArchitectureProfilesCommand, runArchitectureShowCommand } from "./cli/commands/architecture.js";
import { runCheckCommand } from "./cli/commands/check.js";
import { runChangesCommand } from "./cli/commands/changes.js";
import { runContextExportCommand } from "./cli/commands/context.js";
import { runDoctorCommand } from "./cli/commands/doctor.js";
import { runEvidenceAddCommand } from "./cli/commands/evidence.js";
import { bootstrapResult, runBootstrapCommand, runInstallCommand } from "./cli/commands/health.js";
import { runListCommand } from "./cli/commands/list.js";
import { runProfileAddCommand, runProfileCheckCommand, runProfileEvidenceCommand, runProfileShowCommand } from "./cli/commands/profile.js";
import { runArchiveCommand, runReportCommand } from "./cli/commands/reporting.js";
import { activeGoalRuntime, argValue, resolveRoot } from "./cli/runtime.js";
import { runSkillExportCommand } from "./cli/commands/skill.js";
import { runUninstallCommand } from "./cli/commands/uninstall.js";
import { runUpgradeCommand } from "./cli/commands/upgrade.js";

function printJson(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function printCommandResult(payload) {
  printJson(payload);
  if (!payload.ok) process.exitCode = 1;
}

async function runAndPrint(runner, rawArgs, options = {}) {
  const payload = options.runtime ? await runner(rawArgs, options.runtime) : await runner(rawArgs);
  if (options.commandResult) printCommandResult(payload);
  else printJson(payload);
}

async function runConfiguredCommand(route, args, rawArgs) {
  await runAndPrint(route.runner, rawArgs, {
    commandResult: route.commandResult,
    runtime: route.activeGoal ? activeGoalRuntime(args) : undefined
  });
}

async function runConfiguredRoute(route, args) {
  await runConfiguredCommand(route, args, args.slice(route.sliceStart));
}

function printText(line = "") {
  process.stdout.write(`${line}\n`);
}

function parsedArgTokens(args) {
  return parseArgs({ args, allowPositionals: true, strict: false, tokens: true }).tokens;
}

function hasFlag(args, name) {
  const rawName = name.startsWith("--") ? name : `--${name}`;
  return parsedArgTokens(args).some((item) => item.kind === "option" && item.rawName === rawName);
}

function wantsJson(args) {
  return hasFlag(args, "--json");
}

function isInteractive(args) {
  return !wantsJson(args) && process.stdin.isTTY && process.stdout.isTTY;
}

const CLI_NAME = "opennori";
const TOP_LEVEL_USAGE = `${CLI_NAME} <bootstrap|doctor|install|upgrade|uninstall|architecture|brainstorm|discover|draft|init|list|check|approve|criterion|profile|resume|next|evidence|evaluate|status|report|context|changes|archive|skill>`;

function wantsHelp(args) {
  return args.includes("--help") || args.includes("-h");
}

function describeBootstrapAction(action) {
  if (action.action === "create") return `create ${action.path}`;
  if (action.action === "skip") return `keep existing ${action.path}`;
  if (action.action === "exists") return `already exists ${action.path}`;
  if (action.action === "update") return `update ${action.path}`;
  if (action.action === "overwrite") return `overwrite ${action.path}`;
  return `${action.action} ${action.path}`;
}

function printBootstrapPreview(payload) {
  const data = payload.data;
  printText("");
  printText("OpenNori project setup");
  printText(`Project: ${data.root}`);
  printText("");

  if (data.status === "ready") {
    printText("OpenNori is already ready in this project.");
    printText("Next: tell your agent the goal and ask it to use OpenNori.");
    return;
  }

  printText("This will prepare OpenNori for this project:");
  for (const action of data.install_plan.actions.filter((item) => item.would_write).slice(0, 8)) {
    printText(`- ${describeBootstrapAction(action)}`);
  }
  const remaining = data.install_plan.summary.would_write - Math.min(data.install_plan.summary.would_write, 8);
  if (remaining > 0) printText(`- plus ${remaining} more OpenNori project assets`);
  printText("");
  printText("No files have been written yet.");
}

function printBootstrapResult(payload) {
  const data = payload.data;
  printText("");
  if (data.status === "installed") {
    printText("OpenNori installed.");
    printText(`Created or refreshed ${data.install_plan.summary.will_write} project assets.`);
    printText("Next: tell your agent the goal and ask it to use OpenNori.");
    return;
  }
  if (data.status === "ready") {
    printText("OpenNori is ready.");
    printText("Next: tell your agent the goal and ask it to use OpenNori.");
    return;
  }
  printText(data.next || "OpenNori bootstrap finished.");
}

async function promptConfirm(message) {
  process.stdout.write(`${message} [y/N] `);
  return new Promise((resolve) => {
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", (chunk) => {
      process.stdin.pause();
      resolve(/^y(es)?$/i.test(String(chunk).trim()));
    });
  });
}

async function runBootstrap(args) {
  const root = resolveRoot(args);
  const confirmed = hasFlag(args, "--confirm");

  if (!isInteractive(args)) {
    printJson(await runBootstrapCommand(args.slice(1)));
    return;
  }

  if (confirmed) {
    printBootstrapResult(bootstrapResult({ root, confirmed }));
    return;
  }

  const preview = bootstrapResult({ root, confirmed: false });
  printBootstrapPreview(preview);
  if (preview.data.status === "ready") return;

  const shouldInstall = await promptConfirm("Install OpenNori here?");
  if (!shouldInstall) {
    printText("");
    printText("No changes made.");
    return;
  }

  printBootstrapResult(bootstrapResult({ root, confirmed: true }));
}

const TOP_LEVEL_COMMANDS = {
  doctor: { runner: runDoctorCommand, usage: `${CLI_NAME} doctor --root <project> [--json]` },
  list: { runner: runListCommand, usage: `${CLI_NAME} list --root <project> [--goal <goal-id>] [--json]` },
  install: { runner: runInstallCommand, commandResult: true, usage: `${CLI_NAME} install --root <project> [--skill] [--refresh-skill] [--merge-agent-route] [--dry-run] [--force] [--confirm] [--json]` },
  uninstall: { runner: runUninstallCommand, commandResult: true, usage: `${CLI_NAME} uninstall --root <project> [--include-state] [--dry-run] [--confirm] [--json]` },
  upgrade: { runner: runUpgradeCommand, commandResult: true, usage: `${CLI_NAME} upgrade --root <project> [--skill] [--refresh-skill] [--merge-agent-route] [--dry-run] [--confirm] [--json]` },
  brainstorm: { runner: runBrainstormCommand, usage: `${CLI_NAME} brainstorm --idea "<idea>" --root <project> [--id <id>] [--json]` },
  discover: { runner: runDiscoverCommand, usage: `${CLI_NAME} discover --goal "<goal>" --root <project> [--id <id>] [--json]` },
  draft: { runner: runDraftCommand, commandResult: true, usage: `${CLI_NAME} draft --goal "<goal>" --root <project> [--goal-id <id>] [--json]` },
  init: { runner: runInitCommand, commandResult: true, usage: `${CLI_NAME} init <brief.json> --root <project> [--json]` },
  check: { runner: runCheckCommand, activeGoal: true, commandResult: true, usage: `${CLI_NAME} check --root <project> [--goal <goal-id>] [--json]` },
  approve: { runner: runApproveCommand, activeGoal: true, usage: `${CLI_NAME} approve --root <project> [--goal <goal-id>] [--json]` },
  resume: { runner: runResumeCommand, activeGoal: true, usage: `${CLI_NAME} resume --root <project> [--goal <goal-id>] [--json]` },
  next: { runner: runNextCommand, activeGoal: true, usage: `${CLI_NAME} next --root <project> [--goal <goal-id>] [--json]` },
  evaluate: { runner: runEvaluateCommand, activeGoal: true, usage: `${CLI_NAME} evaluate --root <project> [--goal <goal-id>] [--json]` },
  status: { runner: runStatusCommand, activeGoal: true, usage: `${CLI_NAME} status --root <project> [--goal <goal-id>] [--json]` },
  report: { runner: runReportCommand, activeGoal: true, usage: `${CLI_NAME} report --root <project> [--goal <goal-id>] [--json]` },
  changes: { runner: runChangesCommand, usage: `${CLI_NAME} changes --root <project> [--goal <goal-id>] [--json]` },
  archive: { runner: runArchiveCommand, activeGoal: true, commandResult: true, usage: `${CLI_NAME} archive --root <project> [--goal <goal-id>] [--json]` }
};

const SUBCOMMANDS = {
  architecture: {
    usage: `${CLI_NAME} architecture <profiles|profile|baseline|show|challenge|build-vs-buy> --root <project> [--json]`,
    commands: {
      profiles: { runner: runArchitectureProfilesCommand, sliceStart: 2, usage: `${CLI_NAME} architecture profiles --root <project> [--json]` },
      profile: { runner: runArchitectureProfileCommand, sliceStart: 2, commandResult: true, usage: `${CLI_NAME} architecture profile --root <project> --from <profile.json> [--id <id>] [--force] [--json]` },
      baseline: { runner: runArchitectureBaselineCommand, sliceStart: 2, usage: `${CLI_NAME} architecture baseline --root <project> --goal "<goal>" [--profile <id>] [--confirm] [--json]` },
      show: { runner: runArchitectureShowCommand, sliceStart: 2, usage: `${CLI_NAME} architecture show --root <project> [--json]` },
      challenge: { runner: runArchitectureChallengeCommand, sliceStart: 2, usage: `${CLI_NAME} architecture challenge --root <project> --summary <summary> --evidence <evidence> --recommendation <recommendation> [--json]` },
      "build-vs-buy": { runner: runArchitectureBuildVsBuyCommand, sliceStart: 2, usage: `${CLI_NAME} architecture build-vs-buy --root <project> --area <area> --need <need> --recommendation <reuse|buy|self-build> --summary <summary> [--json]` }
    }
  },
  criterion: {
    commands: {
      update: { runner: runCriterionUpdateCommand, sliceStart: 2, activeGoal: true, commandResult: true, usage: `${CLI_NAME} criterion update --root <project> --criterion <id> --user-story ... --measurement ... --threshold ... [--json]` }
    }
  },
  profile: {
    usage: `${CLI_NAME} profile <add|evidence|show|check> --root <project> [--json]`,
    commands: {
      add: { runner: runProfileAddCommand, sliceStart: 2, activeGoal: true, usage: `${CLI_NAME} profile add --root <project> --type <skill|stack|constraint> --name <name> --strength <must|prefer|avoid> --purpose <purpose> [--json]` },
      evidence: { runner: runProfileEvidenceCommand, sliceStart: 2, activeGoal: true, usage: `${CLI_NAME} profile evidence --root <project> --item <item-id> --result <satisfied|violated|waived> --summary <summary> [--json]` },
      show: { runner: runProfileShowCommand, sliceStart: 2, activeGoal: true },
      check: { runner: runProfileCheckCommand, sliceStart: 2, activeGoal: true }
    }
  },
  evidence: {
    usage: `${CLI_NAME} evidence add --root <project> --criterion <id> --kind <kind> --summary <summary> --result <passing|failing|blocked|waived> [--json]`,
    commands: {
      add: { runner: runEvidenceAddCommand, sliceStart: 2, activeGoal: true, usage: `${CLI_NAME} evidence add --root <project> --criterion <id> --kind <kind> --summary <summary> --result <passing|failing|blocked|waived> [--json]` }
    }
  },
  context: {
    usage: `${CLI_NAME} context export --root <project> [--json]`,
    commands: {
      export: { runner: runContextExportCommand, sliceStart: 2, usage: `${CLI_NAME} context export --root <project> [--json]` }
    }
  },
  skill: {
    usage: `${CLI_NAME} skill export [--pack] [--json]`,
    commands: {
      export: { runner: runSkillExportCommand, sliceStart: 2, commandResult: true, usage: `${CLI_NAME} skill export [--pack] [--json]` }
    }
  }
};

function usageFor(args) {
  const [command, subcommand] = args;
  if (!command || command === "--help" || command === "-h") return TOP_LEVEL_USAGE;
  if (command === "bootstrap") return `${CLI_NAME} bootstrap --root <project> [--confirm] [--json]`;
  if (TOP_LEVEL_COMMANDS[command]) return TOP_LEVEL_COMMANDS[command].usage;

  const subcommandGroup = SUBCOMMANDS[command];
  if (!subcommandGroup) return TOP_LEVEL_USAGE;
  return subcommandGroup.commands[subcommand]?.usage || subcommandGroup.usage || TOP_LEVEL_USAGE;
}

export async function main(args) {
  const command = args[0];
  if (!command || command === "--help" || command === "-h") {
    printJson(ok({ usage: TOP_LEVEL_USAGE, side_effect: "none" }));
    return;
  }

  if (wantsHelp(args)) {
    printJson(ok({ command: [command, args[1]].filter(Boolean).join(" "), usage: usageFor(args), side_effect: "none" }));
    return;
  }

  if (command === "bootstrap") {
    await runBootstrap(args);
    return;
  }

  const topLevelRoute = TOP_LEVEL_COMMANDS[command];
  if (topLevelRoute) {
    await runConfiguredCommand(topLevelRoute, args, args.slice(1));
    return;
  }

  const subcommandRoute = SUBCOMMANDS[command]?.commands[args[1]];
  if (subcommandRoute) {
    await runConfiguredRoute(subcommandRoute, args);
    return;
  }

  printJson(fail("unknown_command", `Unknown command: ${args.join(" ")}`));
  process.exitCode = 2;
}
