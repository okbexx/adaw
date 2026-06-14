import type { CommandDef, SubCommandsDef } from "citty";
import { defineCommand, runCommand } from "citty";
import { approveCommand, brainstormCommand, criterionAddCommand, criterionUpdateCommand, discoverCommand, draftCommand, evaluateCommand, initCommand, nextCommand, resumeCommand, statusCommand } from "./commands/acceptance.ts";
import { architectureBaselineCommand, architectureBuildVsBuyCommand, architectureChallengeCommand, architectureProfileCommand, architectureProfilesCommand, architectureShowCommand } from "./commands/architecture.ts";
import { bootstrapCommand } from "./commands/bootstrap.ts";
import { changesCommand } from "./commands/changes.ts";
import { checkCommand } from "./commands/check.ts";
import { contextExportCommand } from "./commands/context.ts";
import { doctorCommand } from "./commands/doctor.ts";
import { evidenceAddCommand, evidencePruneCommand } from "./commands/evidence.ts";
import { installCommand } from "./commands/install.ts";
import { listCommand } from "./commands/list.ts";
import { profileAddCommand, profileCheckCommand, profileEvidenceCommand, profileShowCommand } from "./commands/profile.ts";
import { archiveCommand, reportCommand } from "./commands/reporting.ts";
import { setupCommand } from "./commands/setup.ts";
import { uninstallCommand } from "./commands/uninstall.ts";
import { upgradeCommand } from "./commands/upgrade.ts";
import { activeGoalRuntime, withActiveGoalWriteLock } from "./runtime.ts";

type Resolvable<T> = T | Promise<T> | (() => T | Promise<T>);
type AnyCommand = CommandDef<any>;
type UsageArgDefinition = {
  type?: string;
  required?: boolean;
  default?: unknown;
};

type CommandPolicy = {
  activeGoal?: boolean;
  activeGoalWrite?: boolean;
  commandResult?: boolean;
};

export type ResolvedCliCommand = {
  ok: true;
  command: AnyCommand;
  parent?: AnyCommand;
  path: string[];
  rawArgs: string[];
  policy: CommandPolicy;
} | {
  ok: false;
  path: string[];
  message: string;
};

const COMMAND_POLICIES = new WeakMap<AnyCommand, CommandPolicy>();

export const CLI_NAME = "opennori";

function withPolicy<T extends AnyCommand>(command: T, policy: CommandPolicy = {}): T {
  COMMAND_POLICIES.set(command, policy);
  return command;
}

function groupCommand(name: string, description: string, subCommands: SubCommandsDef): AnyCommand {
  return defineCommand({
    meta: { name, description },
    subCommands
  }) as AnyCommand;
}

function asCommand(command: unknown): AnyCommand {
  return command as AnyCommand;
}

const architectureCommand = groupCommand("architecture", "Review and manage OpenNori Architecture Baselines.", {
  profiles: asCommand(architectureProfilesCommand),
  profile: withPolicy(asCommand(architectureProfileCommand), { commandResult: true }),
  baseline: asCommand(architectureBaselineCommand),
  show: asCommand(architectureShowCommand),
  challenge: asCommand(architectureChallengeCommand),
  "build-vs-buy": asCommand(architectureBuildVsBuyCommand)
});

const criterionCommand = groupCommand("criterion", "Revise human-centered acceptance criteria.", {
  add: withPolicy(asCommand(criterionAddCommand), { activeGoal: true, activeGoalWrite: true, commandResult: true }),
  update: withPolicy(asCommand(criterionUpdateCommand), { activeGoal: true, activeGoalWrite: true, commandResult: true })
});

const profileCommand = groupCommand("profile", "Manage Nori Profile execution preferences.", {
  add: withPolicy(asCommand(profileAddCommand), { activeGoal: true, activeGoalWrite: true }),
  evidence: withPolicy(asCommand(profileEvidenceCommand), { activeGoal: true, activeGoalWrite: true }),
  show: withPolicy(asCommand(profileShowCommand), { activeGoal: true }),
  check: withPolicy(asCommand(profileCheckCommand), { activeGoal: true, activeGoalWrite: true })
});

const evidenceCommand = groupCommand("evidence", "Record OpenNori acceptance evidence.", {
  add: withPolicy(asCommand(evidenceAddCommand), { activeGoal: true, activeGoalWrite: true }),
  prune: withPolicy(asCommand(evidencePruneCommand), { activeGoal: true, activeGoalWrite: true })
});

const contextCommand = groupCommand("context", "Export OpenNori context for review tools.", {
  export: withPolicy(asCommand(contextExportCommand), { activeGoal: true })
});

export const rootCommand = defineCommand({
  meta: {
    name: CLI_NAME,
    description: "OpenNori acceptance-driven agent state CLI."
  },
  subCommands: {
    setup: withPolicy(asCommand(setupCommand), { commandResult: true }),
    bootstrap: asCommand(bootstrapCommand),
    doctor: asCommand(doctorCommand),
    list: asCommand(listCommand),
    install: withPolicy(asCommand(installCommand), { commandResult: true }),
    uninstall: withPolicy(asCommand(uninstallCommand), { commandResult: true }),
    upgrade: withPolicy(asCommand(upgradeCommand), { commandResult: true }),
    brainstorm: asCommand(brainstormCommand),
    discover: asCommand(discoverCommand),
    draft: withPolicy(asCommand(draftCommand), { commandResult: true }),
    init: withPolicy(asCommand(initCommand), { commandResult: true }),
    check: withPolicy(asCommand(checkCommand), { activeGoal: true, commandResult: true }),
    approve: withPolicy(asCommand(approveCommand), { activeGoal: true, activeGoalWrite: true }),
    resume: withPolicy(asCommand(resumeCommand), { activeGoal: true }),
    next: withPolicy(asCommand(nextCommand), { activeGoal: true }),
    evaluate: withPolicy(asCommand(evaluateCommand), { activeGoal: true, activeGoalWrite: true }),
    status: withPolicy(asCommand(statusCommand), { activeGoal: true }),
    report: withPolicy(asCommand(reportCommand), { activeGoal: true }),
    changes: asCommand(changesCommand),
    archive: withPolicy(asCommand(archiveCommand), { activeGoal: true, activeGoalWrite: true, commandResult: true }),
    architecture: architectureCommand,
    criterion: criterionCommand,
    profile: profileCommand,
    evidence: evidenceCommand,
    context: contextCommand
  }
}) as AnyCommand;

async function resolveValue<T>(value: Resolvable<T> | undefined): Promise<T | undefined> {
  if (typeof value === "function") return await (value as () => T | Promise<T>)();
  return await value;
}

async function commandName(command: AnyCommand, fallback: string): Promise<string> {
  const meta = await resolveValue(command.meta);
  return meta?.name || fallback;
}

async function subCommandsFor(command: AnyCommand): Promise<SubCommandsDef | undefined> {
  return await resolveValue(command.subCommands);
}

function firstSubCommandIndex(rawArgs: string[]): number {
  return rawArgs.findIndex((arg) => arg !== "--" && !arg.startsWith("-"));
}

async function findSubCommand(subCommands: SubCommandsDef, name: string): Promise<{ key: string; command: AnyCommand } | null> {
  if (name in subCommands) {
    return { key: name, command: asCommand(await resolveValue(subCommands[name]) as CommandDef) };
  }

  for (const [key, subCommand] of Object.entries(subCommands)) {
    const command = asCommand(await resolveValue(subCommand) as CommandDef);
    const meta = await resolveValue(command.meta);
    const aliases = Array.isArray(meta?.alias) ? meta.alias : meta?.alias ? [meta.alias] : [];
    if (aliases.includes(name)) return { key, command };
  }

  return null;
}

export async function resolveCliCommand(rawArgs: string[]): Promise<ResolvedCliCommand> {
  let command = asCommand(rootCommand);
  let parent: AnyCommand | undefined;
  let remaining = rawArgs;
  const path: string[] = [];

  while (true) {
    const subCommands = await subCommandsFor(command);
    if (!subCommands || Object.keys(subCommands).length === 0) {
      return {
        ok: true,
        command,
        parent,
        path,
        rawArgs: remaining,
        policy: COMMAND_POLICIES.get(command) || {}
      };
    }

    const index = firstSubCommandIndex(remaining);
    const explicitName = index >= 0 ? remaining[index] : undefined;
    if (!explicitName) {
      return {
        ok: false,
        path,
        message: path.length > 0
          ? `No subcommand specified for ${[CLI_NAME, ...path].join(" ")}`
          : `No command specified for ${CLI_NAME}`
      };
    }

    const resolved = await findSubCommand(subCommands, explicitName);
    if (!resolved) {
      return {
        ok: false,
        path,
        message: `Unknown command: ${[...path, explicitName].join(" ")}`
      };
    }

    parent = command;
    command = resolved.command;
    path.push(resolved.key);
    remaining = remaining.slice(index + 1);
  }
}

function kebabCase(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function valueHint(name: string): string {
  return `<${kebabCase(name)}>`;
}

async function argsUsage(command: AnyCommand): Promise<string> {
  const args = (await resolveValue(command.args) || {}) as Record<string, UsageArgDefinition>;
  return Object.entries(args)
    .map(([name, definition]) => {
      if (definition.type === "positional") {
        const token = valueHint(name).toUpperCase();
        return definition.required === false || definition.default !== undefined ? `[${token}]` : token;
      }
      const flag = `--${kebabCase(name)}`;
      if (definition.type === "boolean") return definition.required ? flag : `[${flag}]`;
      const token = `${flag} ${valueHint(name)}`;
      return definition.required ? token : `[${token}]`;
    })
    .join(" ");
}

export async function usageFor(rawArgs: string[]): Promise<string> {
  const argsWithoutHelp = rawArgs.filter((arg) => arg !== "--help" && arg !== "-h");
  const resolved = argsWithoutHelp.length > 0 ? await resolveCliCommand(argsWithoutHelp) : { ok: true as const, command: rootCommand, path: [], rawArgs: [], policy: {} };
  const command = resolved.ok ? resolved.command : rootCommand;
  const path = resolved.ok ? resolved.path : [];
  const subCommands = await subCommandsFor(command);
  const commandLabel = [CLI_NAME, ...path].join(" ");
  const usageParts = [commandLabel];

  const options = await argsUsage(command);
  if (options) usageParts.push(options);
  if (subCommands && Object.keys(subCommands).length > 0) usageParts.push(`<${Object.keys(subCommands).join("|")}>`);

  return usageParts.join(" ");
}

export async function commandLabelFor(rawArgs: string[]): Promise<string> {
  const resolved = await resolveCliCommand(rawArgs.filter((arg) => arg !== "--help" && arg !== "-h"));
  if (!resolved.ok) return [CLI_NAME, ...resolved.path].join(" ");
  const name = await commandName(resolved.command, resolved.path.at(-1) || CLI_NAME);
  if (resolved.path.length === 0) return name;
  return [CLI_NAME, ...resolved.path].join(" ");
}

export async function runCliCommand(resolved: Extract<ResolvedCliCommand, { ok: true }>): Promise<unknown> {
  const runtime = resolved.policy.activeGoal ? activeGoalRuntime() : {};
  const execute = async () => {
    const { result } = await runCommand(resolved.command, {
      rawArgs: resolved.rawArgs,
      data: {
        ...runtime,
        rawArgs: resolved.rawArgs
      }
    });
    return result;
  };
  return resolved.policy.activeGoal
    ? withActiveGoalWriteLock(resolved.rawArgs, execute)
    : execute();
}
