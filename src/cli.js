import { fail, ok } from "./core.js";
import { runBootstrap } from "./cli/bootstrap.js";
import { SUBCOMMANDS, TOP_LEVEL_COMMANDS, TOP_LEVEL_USAGE, usageFor } from "./cli/routes.js";
import { activeGoalRuntime } from "./cli/runtime.js";

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

function wantsHelp(args) {
  return args.includes("--help") || args.includes("-h");
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
    await runBootstrap(args, { printJson });
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
