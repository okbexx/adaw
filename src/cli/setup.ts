import { parseArgs } from "citty";
import { runSetupCommand, setupResult } from "./commands/setup.ts";

type JsonPrinter = (payload: unknown) => void;

type SetupAction = {
  id: string;
  action: string;
  command_display?: string;
  reason: string;
  would_write: boolean;
};

type SetupPayload = {
  ok: boolean;
  data: {
    root: string;
    status: string;
    next?: string;
    setup_plan: {
      actions: SetupAction[];
      summary: {
        would_write: number;
        will_write: number;
      };
    };
  };
};

type SetupOptions = {
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
  printJson?: JsonPrinter;
};

type SetupCliArgs = {
  root: string;
  confirm: boolean;
  dryRun: boolean;
  json: boolean;
};

function printText(stdout: NodeJS.WriteStream, line = ""): void {
  stdout.write(`${line}\n`);
}

function parseSetupArgs(rawArgs: string[]): SetupCliArgs {
  return parseArgs(rawArgs, {
    root: {
      type: "string",
      default: process.cwd()
    },
    confirm: {
      type: "boolean",
      default: false
    },
    dryRun: {
      type: "boolean",
      default: false
    },
    json: {
      type: "boolean",
      default: false
    }
  }) as unknown as SetupCliArgs;
}

function asSetupPayload(payload: unknown): SetupPayload {
  return payload as SetupPayload;
}

function isInteractive(args: string[], stdin: NodeJS.ReadStream, stdout: NodeJS.WriteStream): boolean {
  return !parseSetupArgs(args[0] === "setup" ? args.slice(1) : args).json && stdin.isTTY && stdout.isTTY;
}

async function promptConfirm(stdin: NodeJS.ReadStream, stdout: NodeJS.WriteStream, message: string): Promise<boolean> {
  stdout.write(`${message} [y/N] `);
  return new Promise((resolve) => {
    stdin.setEncoding("utf8");
    stdin.once("data", (chunk) => {
      stdin.pause();
      resolve(/^y(es)?$/i.test(String(chunk).trim()));
    });
  });
}

function printSetupPreview(stdout: NodeJS.WriteStream, payload: SetupPayload): void {
  const data = payload.data;
  printText(stdout, "");
  printText(stdout, "OpenNori setup");
  printText(stdout, `Project: ${data.root}`);
  printText(stdout, "");
  printText(stdout, "This will install the complete OpenNori capability bundle:");
  for (const action of data.setup_plan.actions) {
    const command = action.command_display ? ` (${action.command_display})` : "";
    const prefix = action.would_write ? "-" : "- already ready:";
    printText(stdout, `${prefix} ${action.reason}${command}`);
  }
  printText(stdout, "");
  printText(stdout, "No project files or user-level Codex/npm settings have been changed yet.");
}

function printSetupResult(stdout: NodeJS.WriteStream, payload: SetupPayload): void {
  const data = payload.data;
  printText(stdout, "");
  if (data.status === "ready") {
    printText(stdout, "OpenNori capability bundle is ready.");
    printText(stdout, "Next: open a new Codex session and ask it to use OpenNori for the goal.");
    return;
  }
  printText(stdout, data.next || "OpenNori setup finished.");
}

export async function runSetup(args: string[], { stdin = process.stdin, stdout = process.stdout, printJson }: SetupOptions = {}): Promise<void> {
  const writeJson = printJson || ((payload) => stdout.write(`${JSON.stringify(payload, null, 2)}\n`));
  const setupArgs = args[0] === "setup" ? args.slice(1) : args;
  const parsed = parseSetupArgs(setupArgs);

  if (!isInteractive(args, stdin, stdout)) {
    writeJson(await runSetupCommand(setupArgs));
    return;
  }

  if (parsed.confirm) {
    printSetupResult(stdout, asSetupPayload(setupResult({ root: parsed.root, dryRun: false, confirmed: true })));
    return;
  }

  const preview = asSetupPayload(setupResult({ root: parsed.root, dryRun: true, confirmed: false }));
  printSetupPreview(stdout, preview);
  const shouldInstall = await promptConfirm(stdin, stdout, "Install OpenNori capability bundle?");
  if (!shouldInstall) {
    printText(stdout, "");
    printText(stdout, "No changes made.");
    return;
  }

  printSetupResult(stdout, asSetupPayload(setupResult({ root: preview.data.root, dryRun: false, confirmed: true })));
}
