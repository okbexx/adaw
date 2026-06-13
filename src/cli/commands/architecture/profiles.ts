import { defineCommand } from "citty";
import { architectureProfiles } from "../../../architecture.ts";
import { ok } from "../../../core.ts";
import { runJsonCommand } from "../../runtime.ts";
import { jsonArg, resolveRoot, rootArg } from "./shared.ts";

export const architectureProfilesCommand = defineCommand({
  meta: {
    name: "profiles",
    description: "List reviewable OpenNori Architecture Profiles."
  },
  args: {
    root: rootArg,
    json: jsonArg
  },
  run({ args }) {
    const root = resolveRoot(args.root);
    return ok({
      root,
      profiles: architectureProfiles(root),
      side_effect: "none"
    });
  }
});

export async function runArchitectureProfilesCommand(rawArgs: string[]) {
  return runJsonCommand(architectureProfilesCommand, rawArgs);
}
