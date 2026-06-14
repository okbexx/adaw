import { parseArgs } from "citty";
import { bootstrapResult, runBootstrapCommand } from "./commands/bootstrap.ts";

type JsonPrinter = (payload: unknown) => void;

type InitAction = {
  action: string;
  path: string;
  would_write?: boolean;
};

type InitPayload = {
  data: {
    root: string;
    status: string;
    next?: string;
    install_plan: {
      actions: InitAction[];
      summary: {
        would_write: number;
        will_write: number;
      };
    };
  };
};

type InitOptions = {
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
  printJson?: JsonPrinter;
};

type InitCliArgs = {
  root: string;
  confirm: boolean;
  json: boolean;
};

function printText(stdout: NodeJS.WriteStream, line = ""): void {
  stdout.write(`${line}\n`);
}

function parseInitArgs(rawArgs: string[]): InitCliArgs {
  return parseArgs(rawArgs, {
    root: {
      type: "string",
      default: process.cwd()
    },
    confirm: {
      type: "boolean",
      default: false
    },
    json: {
      type: "boolean",
      default: false
    }
  }) as unknown as InitCliArgs;
}

function isInteractive(args: string[], stdin: NodeJS.ReadStream, stdout: NodeJS.WriteStream): boolean {
  return !parseInitArgs(args[0] === "init" ? args.slice(1) : args).json && stdin.isTTY && stdout.isTTY;
}

function asInitPayload(payload: unknown): InitPayload {
  return payload as InitPayload;
}

function describeAction(action: InitAction): string {
  if (action.action === "create") return `create ${action.path}`;
  if (action.action === "skip") return `keep existing ${action.path}`;
  if (action.action === "exists") return `already exists ${action.path}`;
  if (action.action === "update") return `update ${action.path}`;
  if (action.action === "overwrite") return `overwrite ${action.path}`;
  return `${action.action} ${action.path}`;
}

function printInitPreview(stdout: NodeJS.WriteStream, payload: InitPayload): void {
  const data = payload.data;
  printText(stdout, "");
  printText(stdout, "OpenNori project init");
  printText(stdout, `Project: ${data.root}`);
  printText(stdout, "");
  if (data.status === "ready") {
    printText(stdout, "OpenNori is already ready in this project.");
    return;
  }
  printText(stdout, "This will prepare .opennori project state:");
  for (const action of data.install_plan.actions.filter((item) => item.would_write).slice(0, 8)) {
    printText(stdout, `- ${describeAction(action)}`);
  }
  const remaining = data.install_plan.summary.would_write - Math.min(data.install_plan.summary.would_write, 8);
  if (remaining > 0) printText(stdout, `- plus ${remaining} more OpenNori project assets`);
  printText(stdout, "");
  printText(stdout, "No project files have been written yet.");
}

function printInitResult(stdout: NodeJS.WriteStream, payload: InitPayload): void {
  const data = payload.data;
  printText(stdout, "");
  if (data.status === "installed") {
    printText(stdout, "OpenNori project state initialized.");
    printText(stdout, `Created or refreshed ${data.install_plan.summary.will_write} project assets.`);
    printText(stdout, "Next: tell your agent the goal and ask it to use OpenNori.");
    return;
  }
  if (data.status === "ready") {
    printText(stdout, "OpenNori project state is ready.");
    printText(stdout, "Next: tell your agent the goal and ask it to use OpenNori.");
    return;
  }
  printText(stdout, data.next || "OpenNori init finished.");
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

export async function runInit(args: string[], { stdin = process.stdin, stdout = process.stdout, printJson }: InitOptions = {}): Promise<void> {
  const writeJson = printJson || ((payload) => stdout.write(`${JSON.stringify(payload, null, 2)}\n`));
  const initArgs = args[0] === "init" ? args.slice(1) : args;
  const parsed = parseInitArgs(initArgs);

  if (!isInteractive(args, stdin, stdout)) {
    writeJson(await runBootstrapCommand(initArgs));
    return;
  }

  if (parsed.confirm) {
    printInitResult(stdout, asInitPayload(bootstrapResult({ root: parsed.root, confirmed: true })));
    return;
  }

  const preview = asInitPayload(bootstrapResult({ root: parsed.root, confirmed: false }));
  printInitPreview(stdout, preview);
  if (preview.data.status === "ready") return;

  const shouldInit = await promptConfirm(stdin, stdout, "Initialize OpenNori project state?");
  if (!shouldInit) {
    printText(stdout, "");
    printText(stdout, "No changes made.");
    return;
  }

  printInitResult(stdout, asInitPayload(bootstrapResult({ root: preview.data.root, confirmed: true })));
}
