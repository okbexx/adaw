#!/usr/bin/env node
import { main } from "../src/cli.js";

main(process.argv.slice(2)).catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: {
      type: "unexpected_error",
      message: error instanceof Error ? error.message : String(error)
    }
  }, null, 2));
  process.exitCode = 1;
});
