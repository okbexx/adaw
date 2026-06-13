import { parseArgs } from "node:util";
import { refreshManifest } from "./lifecycle.js";
import { fail, ok } from "./core.js";
import { runApproveCommand, runBrainstormCommand, runCriterionUpdateCommand, runDiscoverCommand, runDraftCommand, runEvaluateCommand, runInitCommand, runNextCommand, runResumeCommand, runStatusCommand } from "./cli/commands/acceptance.js";
import { runArchitectureBaselineCommand, runArchitectureBuildVsBuyCommand, runArchitectureChallengeCommand, runArchitectureProfileCommand, runArchitectureProfilesCommand, runArchitectureShowCommand } from "./cli/commands/architecture.js";
import { runContextExportCommand } from "./cli/commands/context.js";
import { runEvidenceAddCommand } from "./cli/commands/evidence.js";
import { bootstrapResult, runBootstrapCommand, runChangesCommand, runCheckCommand, runDoctorCommand, runInstallCommand, runListCommand, runUninstallCommand, runUpgradeCommand } from "./cli/commands/health.js";
import { runProfileAddCommand, runProfileCheckCommand, runProfileEvidenceCommand, runProfileShowCommand } from "./cli/commands/profile.js";
import { runArchiveCommand, runReportCommand } from "./cli/commands/reporting.js";
import { argValue, loadPair, resolveRoot, savePair } from "./cli/runtime.js";
import { runSkillExportCommand } from "./cli/commands/skill.js";

function printJson(payload) {
  console.log(JSON.stringify(payload, null, 2));
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

function usageFor(args) {
  const [command, subcommand] = args;
  if (!command || command === "--help" || command === "-h") return TOP_LEVEL_USAGE;
  if (command === "bootstrap") return `${CLI_NAME} bootstrap --root <project> [--confirm] [--json]`;
  if (command === "install") return `${CLI_NAME} install --root <project> [--skill] [--refresh-skill] [--merge-agent-route] [--dry-run] [--force] [--confirm] [--json]`;
  if (command === "upgrade") return `${CLI_NAME} upgrade --root <project> [--skill] [--refresh-skill] [--merge-agent-route] [--dry-run] [--confirm] [--json]`;
  if (command === "uninstall") return `${CLI_NAME} uninstall --root <project> [--include-state] [--dry-run] [--confirm] [--json]`;
  if (command === "doctor") return `${CLI_NAME} doctor --root <project> [--json]`;
  if (command === "architecture" && subcommand === "profiles") return `${CLI_NAME} architecture profiles --root <project> [--json]`;
  if (command === "architecture" && subcommand === "profile") return `${CLI_NAME} architecture profile --root <project> --from <profile.json> [--id <id>] [--force] [--json]`;
  if (command === "architecture" && subcommand === "baseline") return `${CLI_NAME} architecture baseline --root <project> --goal "<goal>" [--profile <id>] [--confirm] [--json]`;
  if (command === "architecture" && subcommand === "show") return `${CLI_NAME} architecture show --root <project> [--json]`;
  if (command === "architecture" && subcommand === "challenge") return `${CLI_NAME} architecture challenge --root <project> --summary <summary> --evidence <evidence> --recommendation <recommendation> [--json]`;
  if (command === "architecture" && subcommand === "build-vs-buy") return `${CLI_NAME} architecture build-vs-buy --root <project> --area <area> --need <need> --recommendation <reuse|buy|self-build> --summary <summary> [--json]`;
  if (command === "architecture") return `${CLI_NAME} architecture <profiles|profile|baseline|show|challenge|build-vs-buy> --root <project> [--json]`;
  if (command === "brainstorm") return `${CLI_NAME} brainstorm --idea "<idea>" --root <project> [--id <id>] [--json]`;
  if (command === "discover") return `${CLI_NAME} discover --goal "<goal>" --root <project> [--id <id>] [--json]`;
  if (command === "draft") return `${CLI_NAME} draft --goal "<goal>" --root <project> [--goal-id <id>] [--json]`;
  if (command === "init") return `${CLI_NAME} init <brief.json> --root <project> [--json]`;
  if (command === "criterion" && subcommand === "update") return `${CLI_NAME} criterion update --root <project> --criterion <id> --user-story ... --measurement ... --threshold ... [--json]`;
  if (command === "profile" && subcommand === "add") return `${CLI_NAME} profile add --root <project> --type <skill|stack|constraint> --name <name> --strength <must|prefer|avoid> --purpose <purpose> [--json]`;
  if (command === "profile" && subcommand === "evidence") return `${CLI_NAME} profile evidence --root <project> --item <item-id> --result <satisfied|violated|waived> --summary <summary> [--json]`;
  if (command === "profile") return `${CLI_NAME} profile <add|evidence|show|check> --root <project> [--json]`;
  if (command === "evidence" && subcommand === "add") return `${CLI_NAME} evidence add --root <project> --criterion <id> --kind <kind> --summary <summary> --result <passing|failing|blocked|waived> [--json]`;
  if (command === "evidence") return `${CLI_NAME} evidence add --root <project> --criterion <id> --kind <kind> --summary <summary> --result <passing|failing|blocked|waived> [--json]`;
  if (command === "context" && subcommand === "export") return `${CLI_NAME} context export --root <project> [--json]`;
  if (command === "context") return `${CLI_NAME} context export --root <project> [--json]`;
  if (command === "skill" && subcommand === "export") return `${CLI_NAME} skill export [--pack] [--json]`;
  if (command === "skill") return `${CLI_NAME} skill export [--pack] [--json]`;
  if (["list", "check", "approve", "resume", "next", "evaluate", "status", "report", "changes", "archive"].includes(command)) {
    return `${CLI_NAME} ${command} --root <project> [--goal <goal-id>] [--json]`;
  }
  return TOP_LEVEL_USAGE;
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

  if (command === "doctor") {
    printJson(await runDoctorCommand(args.slice(1)));
    return;
  }

  if (command === "architecture" && args[1] === "profiles") {
    printJson(await runArchitectureProfilesCommand(args.slice(2)));
    return;
  }

  if (command === "architecture" && args[1] === "profile") {
    const result = await runArchitectureProfileCommand(args.slice(2));
    printJson(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (command === "architecture" && args[1] === "baseline") {
    printJson(await runArchitectureBaselineCommand(args.slice(2)));
    return;
  }

  if (command === "architecture" && args[1] === "show") {
    printJson(await runArchitectureShowCommand(args.slice(2)));
    return;
  }

  if (command === "architecture" && args[1] === "challenge") {
    printJson(await runArchitectureChallengeCommand(args.slice(2)));
    return;
  }

  if (command === "architecture" && args[1] === "build-vs-buy") {
    printJson(await runArchitectureBuildVsBuyCommand(args.slice(2)));
    return;
  }

  if (command === "list") {
    printJson(await runListCommand(args.slice(1)));
    return;
  }

  if (command === "install") {
    const result = await runInstallCommand(args.slice(1));
    printJson(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (command === "uninstall") {
    const result = await runUninstallCommand(args.slice(1));
    printJson(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (command === "upgrade") {
    const result = await runUpgradeCommand(args.slice(1));
    printJson(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (command === "brainstorm") {
    printJson(await runBrainstormCommand(args.slice(1)));
    return;
  }

  if (command === "discover") {
    printJson(await runDiscoverCommand(args.slice(1)));
    return;
  }

  if (command === "draft") {
    const result = await runDraftCommand(args.slice(1));
    printJson(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (command === "init") {
    const result = await runInitCommand(args.slice(1));
    printJson(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (command === "check") {
    const result = await runCheckCommand(args.slice(1), { loadPair: () => loadPair(args) });
    printJson(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (command === "approve") {
    printJson(await runApproveCommand(args.slice(1), { loadPair: () => loadPair(args) }));
    return;
  }

  if (command === "criterion" && args[1] === "update") {
    const result = await runCriterionUpdateCommand(args.slice(2), { loadPair: () => loadPair(args) });
    printJson(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (command === "profile" && args[1] === "add") {
    printJson(await runProfileAddCommand(args.slice(2), {
      loadPair: () => loadPair(args),
      savePair,
      refreshManifest
    }));
    return;
  }

  if (command === "profile" && args[1] === "evidence") {
    printJson(await runProfileEvidenceCommand(args.slice(2), {
      loadPair: () => loadPair(args),
      savePair,
      refreshManifest
    }));
    return;
  }

  if (command === "profile" && args[1] === "show") {
    printJson(await runProfileShowCommand(args.slice(2), { loadPair: () => loadPair(args) }));
    return;
  }

  if (command === "profile" && args[1] === "check") {
    printJson(await runProfileCheckCommand(args.slice(2), {
      loadPair: () => loadPair(args),
      savePair,
      refreshManifest
    }));
    return;
  }

  if (command === "resume") {
    printJson(await runResumeCommand(args.slice(1), { loadPair: () => loadPair(args) }));
    return;
  }

  if (command === "next") {
    printJson(await runNextCommand(args.slice(1), { loadPair: () => loadPair(args) }));
    return;
  }

  if (command === "evidence" && args[1] === "add") {
    printJson(await runEvidenceAddCommand(args.slice(2), { loadPair: () => loadPair(args) }));
    return;
  }

  if (command === "evaluate") {
    printJson(await runEvaluateCommand(args.slice(1), { loadPair: () => loadPair(args) }));
    return;
  }

  if (command === "status") {
    printJson(await runStatusCommand(args.slice(1), { loadPair: () => loadPair(args) }));
    return;
  }

  if (command === "report") {
    printJson(await runReportCommand(args.slice(1), { loadPair: () => loadPair(args) }));
    return;
  }

  if (command === "context" && args[1] === "export") {
    printJson(await runContextExportCommand(args.slice(2)));
    return;
  }

  if (command === "changes") {
    printJson(await runChangesCommand(args.slice(1)));
    return;
  }

  if (command === "archive") {
    const result = await runArchiveCommand(args.slice(1), { loadPair: () => loadPair(args) });
    printJson(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (command === "skill" && args[1] === "export") {
    const payload = await runSkillExportCommand(args.slice(2));
    printJson(payload);
    if (!payload.ok) process.exitCode = 1;
    return;
  }

  printJson(fail("unknown_command", `Unknown command: ${args.join(" ")}`));
  process.exitCode = 2;
}
