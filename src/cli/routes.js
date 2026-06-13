import { runApproveCommand, runBrainstormCommand, runCriterionUpdateCommand, runDiscoverCommand, runDraftCommand, runEvaluateCommand, runInitCommand, runNextCommand, runResumeCommand, runStatusCommand } from "./commands/acceptance.js";
import { runArchitectureBaselineCommand, runArchitectureBuildVsBuyCommand, runArchitectureChallengeCommand, runArchitectureProfileCommand, runArchitectureProfilesCommand, runArchitectureShowCommand } from "./commands/architecture.js";
import { runCheckCommand } from "./commands/check.js";
import { runChangesCommand } from "./commands/changes.js";
import { runContextExportCommand } from "./commands/context.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runEvidenceAddCommand } from "./commands/evidence.js";
import { runInstallCommand } from "./commands/install.js";
import { runListCommand } from "./commands/list.js";
import { runProfileAddCommand, runProfileCheckCommand, runProfileEvidenceCommand, runProfileShowCommand } from "./commands/profile.js";
import { runArchiveCommand, runReportCommand } from "./commands/reporting.js";
import { runSkillExportCommand } from "./commands/skill.js";
import { runUninstallCommand } from "./commands/uninstall.js";
import { runUpgradeCommand } from "./commands/upgrade.js";

export const CLI_NAME = "opennori";
export const BOOTSTRAP_USAGE = `${CLI_NAME} bootstrap --root <project> [--confirm] [--json]`;
export const TOP_LEVEL_USAGE = `${CLI_NAME} <bootstrap|doctor|install|upgrade|uninstall|architecture|brainstorm|discover|draft|init|list|check|approve|criterion|profile|resume|next|evidence|evaluate|status|report|context|changes|archive|skill>`;

export const TOP_LEVEL_COMMANDS = {
  doctor: { runner: runDoctorCommand, usage: `${CLI_NAME} doctor --root <project> [--json]` },
  list: { runner: runListCommand, usage: `${CLI_NAME} list --root <project> [--goal <goal-id>] [--json]` },
  install: { runner: runInstallCommand, commandResult: true, usage: `${CLI_NAME} install --root <project> [--skill] [--refresh-skill] [--merge-agent-route] [--dry-run] [--force] [--confirm] [--json]` },
  uninstall: { runner: runUninstallCommand, commandResult: true, usage: `${CLI_NAME} uninstall --root <project> [--include-state] [--dry-run] [--confirm] [--json]` },
  upgrade: { runner: runUpgradeCommand, commandResult: true, usage: `${CLI_NAME} upgrade --root <project> [--skill] [--refresh-skill] [--merge-agent-route] [--dry-run] [--confirm] [--json]` },
  brainstorm: { runner: runBrainstormCommand, usage: `${CLI_NAME} brainstorm --idea "<idea>" --root <project> [--id <id>] [--json]` },
  discover: { runner: runDiscoverCommand, usage: `${CLI_NAME} discover --goal "<goal>" --root <project> [--id <id>] [--json]` },
  draft: { runner: runDraftCommand, commandResult: true, usage: `${CLI_NAME} draft --goal "<goal>" --root <project> [--goal-id <id>] [--json]` },
  init: { runner: runInitCommand, commandResult: true, usage: `${CLI_NAME} init <brief.json> --root <project> [--json]` },
  check: { runner: runCheckCommand, activeGoal: true, commandResult: true, usage: `${CLI_NAME} check --root <project> [--goal <goal-id>] [--json]` },
  approve: { runner: runApproveCommand, activeGoal: true, usage: `${CLI_NAME} approve --root <project> [--goal <goal-id>] [--json]` },
  resume: { runner: runResumeCommand, activeGoal: true, usage: `${CLI_NAME} resume --root <project> [--goal <goal-id>] [--json]` },
  next: { runner: runNextCommand, activeGoal: true, usage: `${CLI_NAME} next --root <project> [--goal <goal-id>] [--json]` },
  evaluate: { runner: runEvaluateCommand, activeGoal: true, usage: `${CLI_NAME} evaluate --root <project> [--goal <goal-id>] [--json]` },
  status: { runner: runStatusCommand, activeGoal: true, usage: `${CLI_NAME} status --root <project> [--goal <goal-id>] [--json]` },
  report: { runner: runReportCommand, activeGoal: true, usage: `${CLI_NAME} report --root <project> [--goal <goal-id>] [--json]` },
  changes: { runner: runChangesCommand, usage: `${CLI_NAME} changes --root <project> [--goal <goal-id>] [--json]` },
  archive: { runner: runArchiveCommand, activeGoal: true, commandResult: true, usage: `${CLI_NAME} archive --root <project> [--goal <goal-id>] [--json]` }
};

export const SUBCOMMANDS = {
  architecture: {
    usage: `${CLI_NAME} architecture <profiles|profile|baseline|show|challenge|build-vs-buy> --root <project> [--json]`,
    commands: {
      profiles: { runner: runArchitectureProfilesCommand, sliceStart: 2, usage: `${CLI_NAME} architecture profiles --root <project> [--json]` },
      profile: { runner: runArchitectureProfileCommand, sliceStart: 2, commandResult: true, usage: `${CLI_NAME} architecture profile --root <project> --from <profile.json> [--id <id>] [--force] [--json]` },
      baseline: { runner: runArchitectureBaselineCommand, sliceStart: 2, usage: `${CLI_NAME} architecture baseline --root <project> --goal "<goal>" [--profile <id>] [--confirm] [--json]` },
      show: { runner: runArchitectureShowCommand, sliceStart: 2, usage: `${CLI_NAME} architecture show --root <project> [--json]` },
      challenge: { runner: runArchitectureChallengeCommand, sliceStart: 2, usage: `${CLI_NAME} architecture challenge --root <project> --summary <summary> --evidence <evidence> --recommendation <recommendation> [--json]` },
      "build-vs-buy": { runner: runArchitectureBuildVsBuyCommand, sliceStart: 2, usage: `${CLI_NAME} architecture build-vs-buy --root <project> --area <area> --need <need> --recommendation <reuse|buy|self-build> --summary <summary> [--json]` }
    }
  },
  criterion: {
    commands: {
      update: { runner: runCriterionUpdateCommand, sliceStart: 2, activeGoal: true, commandResult: true, usage: `${CLI_NAME} criterion update --root <project> --criterion <id> --user-story ... --measurement ... --threshold ... [--json]` }
    }
  },
  profile: {
    usage: `${CLI_NAME} profile <add|evidence|show|check> --root <project> [--json]`,
    commands: {
      add: { runner: runProfileAddCommand, sliceStart: 2, activeGoal: true, usage: `${CLI_NAME} profile add --root <project> --type <skill|stack|constraint> --name <name> --strength <must|prefer|avoid> --purpose <purpose> [--json]` },
      evidence: { runner: runProfileEvidenceCommand, sliceStart: 2, activeGoal: true, usage: `${CLI_NAME} profile evidence --root <project> --item <item-id> --result <satisfied|violated|waived> --summary <summary> [--json]` },
      show: { runner: runProfileShowCommand, sliceStart: 2, activeGoal: true },
      check: { runner: runProfileCheckCommand, sliceStart: 2, activeGoal: true }
    }
  },
  evidence: {
    usage: `${CLI_NAME} evidence add --root <project> --criterion <id> --kind <kind> --summary <summary> --result <passing|failing|blocked|waived> [--json]`,
    commands: {
      add: { runner: runEvidenceAddCommand, sliceStart: 2, activeGoal: true, usage: `${CLI_NAME} evidence add --root <project> --criterion <id> --kind <kind> --summary <summary> --result <passing|failing|blocked|waived> [--json]` }
    }
  },
  context: {
    usage: `${CLI_NAME} context export --root <project> [--json]`,
    commands: {
      export: { runner: runContextExportCommand, sliceStart: 2, usage: `${CLI_NAME} context export --root <project> [--json]` }
    }
  },
  skill: {
    usage: `${CLI_NAME} skill export [--pack] [--json]`,
    commands: {
      export: { runner: runSkillExportCommand, sliceStart: 2, commandResult: true, usage: `${CLI_NAME} skill export [--pack] [--json]` }
    }
  }
};

export function usageFor(args) {
  const [command, subcommand] = args;
  if (!command || command === "--help" || command === "-h") return TOP_LEVEL_USAGE;
  if (command === "bootstrap") return BOOTSTRAP_USAGE;
  if (TOP_LEVEL_COMMANDS[command]) return TOP_LEVEL_COMMANDS[command].usage;

  const subcommandGroup = SUBCOMMANDS[command];
  if (!subcommandGroup) return TOP_LEVEL_USAGE;
  return subcommandGroup.commands[subcommand]?.usage || subcommandGroup.usage || TOP_LEVEL_USAGE;
}
