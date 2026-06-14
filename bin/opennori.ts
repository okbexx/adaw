#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "../src/cli.ts";

export function commandArgsFromProcessArgs(args: string[]): string[] {
  const firstArg = args[0];
  return args.length === 0 || (firstArg !== undefined && firstArg.startsWith("-") && !["--help", "-h"].includes(firstArg))
    ? ["setup", ...args]
    : args;
}

function printFatalError(error: unknown): void {
  console.error(JSON.stringify({
    ok: false,
    error: {
      type: "unexpected_error",
      message: error instanceof Error ? error.message : String(error)
    }
  }, null, 2));
}

export async function mainFromProcess(args = process.argv.slice(2)): Promise<void> {
  await main(commandArgsFromProcessArgs(args));
}

function isDirectEntrypoint(): boolean {
  const invokedPath = process.argv[1];
  if (invokedPath === undefined) return false;
  const currentPath = fileURLToPath(import.meta.url);
  try {
    return fs.realpathSync(path.resolve(invokedPath)) === fs.realpathSync(currentPath);
  } catch {
    return path.resolve(invokedPath) === currentPath;
  }
}

if (isDirectEntrypoint()) {
  mainFromProcess().catch((error: unknown) => {
    printFatalError(error);
    process.exitCode = 1;
  });
}
