import { parseArgs } from "node:util";
import { fail, ok } from "./core.js";
import { bootstrapResult, runBootstrapCommand } from "./cli/commands/bootstrap.js";
import { SUBCOMMANDS, TOP_LEVEL_COMMANDS, TOP_LEVEL_USAGE, usageFor } from "./cli/routes.js";
import { activeGoalRuntime, argValue, resolveRoot } from "./cli/runtime.js";

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
