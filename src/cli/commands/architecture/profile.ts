import path from "node:path";
import { defineCommand } from "citty";
import {
  architectureProfiles,
  normalizeArchitectureProfile,
  validateArchitectureProfile,
  writeArchitectureProfile
} from "../../../architecture.ts";
import { fail, ok, readJson } from "../../../core.ts";
import { refreshManifest } from "../../../lifecycle.ts";
import { runJsonCommand } from "../../runtime.ts";
import type { ArchitectureProfile } from "../../../types.ts";
import { jsonArg, resolveRoot, rootArg } from "./shared.ts";

export const architectureProfileCommand = defineCommand({
  meta: {
    name: "profile",
    description: "Install a project Architecture Profile from a JSON file."
  },
  args: {
    root: rootArg,
    from: {
      type: "string",
      description: "Path to Architecture Profile JSON."
    },
    path: {
      type: "string",
      description: "Alias for --from."
    },
    id: {
      type: "string",
      description: "Optional profile id override."
    },
    force: {
      type: "boolean",
      description: "Overwrite an existing profile after review.",
      default: false
    },
    json: jsonArg
  },
  run({ args }) {
    const root = resolveRoot(args.root);
    const source = args.from || args.path;
    if (!source) throw new Error("--from is required");
    const sourcePath = path.resolve(String(source));
    const profile = normalizeArchitectureProfile(readJson<Partial<ArchitectureProfile>>(sourcePath), args.id);
    const issues = validateArchitectureProfile(profile);
    if (issues.length > 0) {
      return { ...fail("invalid_architecture_profile", "Architecture Profile failed validation", "Add id, title, summary, principles, checks, and build_vs_buy_policy."), issues };
    }
    const target = writeArchitectureProfile(root, profile, { force: Boolean(args.force) });
    refreshManifest(root);
    return ok(
      {
        root,
        profile,
        profile_path: target,
        profiles: architectureProfiles(root),
        side_effect: "write"
      },
      [
        { kind: "architecture_profile", path: target }
      ],
      [],
      ["Preview an Architecture Baseline with this profile, then ask the user to confirm before implementation."]
    );
  }
});

export async function runArchitectureProfileCommand(rawArgs: string[]) {
  return runJsonCommand(architectureProfileCommand, rawArgs);
}
