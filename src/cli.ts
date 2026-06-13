import { fail, ok } from "./core.js";
import { runBootstrap } from "./cli/bootstrap.ts";
import { CLI_NAME, commandLabelFor, resolveCliCommand, runCliCommand, usageFor } from "./cli/command-tree.ts";

type CommandPayload = {
  ok?: boolean;
};

type JsonPrinter = (payload: unknown) => void;

function printJson(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2));
}

function printCommandResult(payload: CommandPayload): void {
  printJson(payload);
  if (!payload.ok) process.exitCode = 1;
}

function wantsHelp(args: string[]): boolean {
  return args.includes("--help") || args.includes("-h");
}

export async function main(args: string[]): Promise<void> {
  const command = args[0];
  if (!command || command === "--help" || command === "-h") {
    printJson(ok({ usage: await usageFor([]), side_effect: "none" }));
    return;
  }

  if (wantsHelp(args)) {
    printJson(ok({ command: await commandLabelFor(args), usage: await usageFor(args), side_effect: "none" }));
    return;
  }

  if (command === "bootstrap") {
    await runBootstrap(args, { printJson } as { printJson: JsonPrinter });
    return;
  }

  const resolved = await resolveCliCommand(args);
  if (!resolved.ok) {
    printJson(fail("unknown_command", resolved.message, `Run ${CLI_NAME} --help to inspect available commands.`));
    process.exitCode = 2;
    return;
  }

  const payload = await runCliCommand(resolved);
  if (resolved.policy.commandResult) printCommandResult(payload as CommandPayload);
  else printJson(payload);
}
