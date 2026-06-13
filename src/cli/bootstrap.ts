import { bootstrapResult, runBootstrapCommand } from "./commands/bootstrap.ts";
import { parseArgs } from "citty";

type JsonPrinter = (payload: unknown) => void;

type BootstrapAction = {
  action: string;
  path: string;
  would_write?: boolean;
};

type BootstrapPayload = {
  data: {
    root: string;
    status: string;
    next?: string;
    install_plan: {
      actions: BootstrapAction[];
      summary: {
        would_write: number;
        will_write: number;
      };
    };
  };
};

type BootstrapOptions = {
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
  printJson?: JsonPrinter;
};

type BootstrapCliArgs = {
  root: string;
  confirm: boolean;
  json: boolean;
};

function printText(stdout: NodeJS.WriteStream, line = ""): void {
  stdout.write(`${line}\n`);
}

function describeBootstrapAction(action: BootstrapAction): string {
  if (action.action === "create") return `create ${action.path}`;
  if (action.action === "skip") return `keep existing ${action.path}`;
  if (action.action === "exists") return `already exists ${action.path}`;
  if (action.action === "update") return `update ${action.path}`;
  if (action.action === "overwrite") return `overwrite ${action.path}`;
  return `${action.action} ${action.path}`;
}

function printBootstrapPreview(stdout: NodeJS.WriteStream, payload: BootstrapPayload): void {
  const data = payload.data;
  printText(stdout, "");
  printText(stdout, "OpenNori project setup");
  printText(stdout, `Project: ${data.root}`);
  printText(stdout, "");

  if (data.status === "ready") {
    printText(stdout, "OpenNori is already ready in this project.");
    printText(stdout, "Next: tell your agent the goal and ask it to use OpenNori.");
    return;
  }

  printText(stdout, "This will prepare OpenNori for this project:");
  for (const action of data.install_plan.actions.filter((item) => item.would_write).slice(0, 8)) {
    printText(stdout, `- ${describeBootstrapAction(action)}`);
  }
  const remaining = data.install_plan.summary.would_write - Math.min(data.install_plan.summary.would_write, 8);
  if (remaining > 0) printText(stdout, `- plus ${remaining} more OpenNori project assets`);
  printText(stdout, "");
  printText(stdout, "No files have been written yet.");
}

function printBootstrapResult(stdout: NodeJS.WriteStream, payload: BootstrapPayload): void {
  const data = payload.data;
  printText(stdout, "");
  if (data.status === "installed") {
    printText(stdout, "OpenNori installed.");
    printText(stdout, `Created or refreshed ${data.install_plan.summary.will_write} project assets.`);
    printText(stdout, "Next: tell your agent the goal and ask it to use OpenNori.");
    return;
  }
  if (data.status === "ready") {
    printText(stdout, "OpenNori is ready.");
    printText(stdout, "Next: tell your agent the goal and ask it to use OpenNori.");
    return;
  }
  printText(stdout, data.next || "OpenNori bootstrap finished.");
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

function isInteractive(args: string[], stdin: NodeJS.ReadStream, stdout: NodeJS.WriteStream): boolean {
  return !parseBootstrapArgs(args[0] === "bootstrap" ? args.slice(1) : args).json && stdin.isTTY && stdout.isTTY;
}

function asBootstrapPayload(payload: unknown): BootstrapPayload {
  return payload as BootstrapPayload;
}

function parseBootstrapArgs(rawArgs: string[]): BootstrapCliArgs {
  const args = parseArgs(rawArgs, {
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
  }) as unknown as BootstrapCliArgs;
  return args;
}

export async function runBootstrap(args: string[], { stdin = process.stdin, stdout = process.stdout, printJson }: BootstrapOptions = {}): Promise<void> {
  const writeJson = printJson || ((payload) => stdout.write(`${JSON.stringify(payload, null, 2)}\n`));
  const bootstrapArgs = args[0] === "bootstrap" ? args.slice(1) : args;
  const parsed = parseBootstrapArgs(bootstrapArgs);

  if (!isInteractive(args, stdin, stdout)) {
    writeJson(await runBootstrapCommand(bootstrapArgs));
    return;
  }

  if (parsed.confirm) {
    printBootstrapResult(stdout, asBootstrapPayload(bootstrapResult({ root: parsed.root, confirmed: true })));
    return;
  }

  const preview = asBootstrapPayload(bootstrapResult({ root: parsed.root, confirmed: false }));
  printBootstrapPreview(stdout, preview);
  if (preview.data.status === "ready") return;

  const shouldInstall = await promptConfirm(stdin, stdout, "Install OpenNori here?");
  if (!shouldInstall) {
    printText(stdout, "");
    printText(stdout, "No changes made.");
    return;
  }

  printBootstrapResult(stdout, asBootstrapPayload(bootstrapResult({ root: preview.data.root, confirmed: true })));
}
