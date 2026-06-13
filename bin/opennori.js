#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceEntrypoint = path.join(root, "bin", "opennori.ts");
const builtEntrypoint = path.join(root, "dist", "bin", "opennori.js");

function isSourceCheckout() {
  return fs.existsSync(path.join(root, ".git"));
}

function supportsNativeTypeScript() {
  return process.features?.typescript === "strip";
}

function runNativeTypeScriptSource() {
  const child = spawn(process.execPath, [sourceEntrypoint, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: process.env
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exitCode = code ?? 1;
  });
}

async function runBuiltEntrypoint() {
  const entrypoint = await import(pathToFileURL(builtEntrypoint).href);
  await entrypoint.mainFromProcess();
}

if (isSourceCheckout() && fs.existsSync(sourceEntrypoint) && supportsNativeTypeScript()) {
  runNativeTypeScriptSource();
} else {
  await runBuiltEntrypoint();
}
