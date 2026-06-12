import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { applyUninstallActions, applyUpgradeActions, autoProfileChecks, bootstrap, buildContextExport, buildInstallPlan, buildManifest, buildUninstallActions, buildUninstallPlan, buildUpgradePlan, installActions, recordAutoProfileChecks, refreshManifest, safeReadManifest, upgradeActions, writeManifest } from "./lifecycle.js";
import { auditAcceptanceQuality, briefFromBrainstorm, briefFromGoal, buildBrainstorm, discoverAcceptance, renderBrainstormMarkdown, renderDiscoveryMarkdown } from "./acceptance.js";
import {
  addEvidence,
  addProfileEvidence,
  addProfileItem,
  buildContractFromBrief,
  buildEvidenceLedger,
  completionAnswer,
  criterionStatusRows,
  currentGap,
  evidenceHealth,
  fail,
  findActivePairs,
  intervention,
  nextRecommendation,
  ok,
  pathsForGoal,
  profileCompliance,
  readJson,
  recomputeWorkflowStatus,
  renderAcceptanceMarkdown,
  slugify,
  syncAcceptanceMarkdown,
  validateContract,
  writeJson
} from "./core.js";
import {
  ARCHITECTURE_CHALLENGE_SCHEMA_VERSION,
  BUILD_VS_BUY_SCHEMA_VERSION,
  architectureBaselinePaths,
  architectureChallengePath,
  architectureProfiles,
  architectureState,
  buildArchitectureBaseline,
  buildVsBuyPath,
  normalizeArchitectureProfile,
  readArchitectureBaseline,
  renderArchitectureChallengeMarkdown,
  renderBuildVsBuyMarkdown,
  renderReportWithArchitecture,
  validateArchitectureProfile,
  writeArchitectureBaseline,
  writeArchitectureProfile
} from "./architecture.js";
import { packagePath } from "./package-root.js";
import { runArchitectureProfilesCommand, runArchitectureShowCommand } from "./cli/commands/architecture.js";
import { runDoctorCommand } from "./cli/commands/health.js";
import { runSkillExportCommand } from "./cli/commands/skill.js";

const PACKAGE_JSON = JSON.parse(fs.readFileSync(packagePath("package.json"), "utf8"));
function printJson(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function printText(line = "") {
  process.stdout.write(`${line}\n`);
}

function parsedArgTokens(args) {
  return parseArgs({ args, allowPositionals: true, strict: false, tokens: true }).tokens;
}

function argValue(args, name, fallback = undefined) {
  const rawName = name.startsWith("--") ? name : `--${name}`;
  const token = parsedArgTokens(args).findLast((item) => item.kind === "option" && item.rawName === rawName);
  if (!token) return fallback;
  if (token.value !== undefined) return token.value;
  const next = args[token.index + 1];
  return next && !next.startsWith("-") ? next : fallback;
}

function hasFlag(args, name) {
  const rawName = name.startsWith("--") ? name : `--${name}`;
  return parsedArgTokens(args).some((item) => item.kind === "option" && item.rawName === rawName);
}

function wantsJson(args) {
  return hasFlag(args, "--json");
}

function isInteractive(args) {
  return !wantsJson(args) && process.stdin.isTTY && process.stdout.isTTY;
}

const CLI_NAME = "opennori";
const TOP_LEVEL_USAGE = `${CLI_NAME} <bootstrap|doctor|install|upgrade|uninstall|architecture|brainstorm|discover|draft|init|list|check|approve|criterion|profile|resume|next|evidence|evaluate|status|report|context|changes|archive|skill>`;

function wantsHelp(args) {
  return args.includes("--help") || args.includes("-h");
}

function usageFor(args) {
  const [command, subcommand] = args;
  if (!command || command === "--help" || command === "-h") return TOP_LEVEL_USAGE;
  if (command === "bootstrap") return `${CLI_NAME} bootstrap --root <project> [--confirm] [--json]`;
  if (command === "install") return `${CLI_NAME} install --root <project> [--skill] [--refresh-skill] [--merge-agent-route] [--dry-run] [--force] [--confirm] [--json]`;
  if (command === "upgrade") return `${CLI_NAME} upgrade --root <project> [--skill] [--refresh-skill] [--merge-agent-route] [--dry-run] [--confirm] [--json]`;
  if (command === "uninstall") return `${CLI_NAME} uninstall --root <project> [--include-state] [--dry-run] [--confirm] [--json]`;
  if (command === "doctor") return `${CLI_NAME} doctor --root <project> [--json]`;
  if (command === "architecture" && subcommand === "profiles") return `${CLI_NAME} architecture profiles --root <project> [--json]`;
  if (command === "architecture" && subcommand === "profile") return `${CLI_NAME} architecture profile --root <project> --from <profile.json> [--id <id>] [--force] [--json]`;
  if (command === "architecture" && subcommand === "baseline") return `${CLI_NAME} architecture baseline --root <project> --goal "<goal>" [--profile <id>] [--confirm] [--json]`;
  if (command === "architecture" && subcommand === "show") return `${CLI_NAME} architecture show --root <project> [--json]`;
  if (command === "architecture" && subcommand === "challenge") return `${CLI_NAME} architecture challenge --root <project> --summary <summary> --evidence <evidence> --recommendation <recommendation> [--json]`;
  if (command === "architecture" && subcommand === "build-vs-buy") return `${CLI_NAME} architecture build-vs-buy --root <project> --area <area> --need <need> --recommendation <reuse|buy|self-build> --summary <summary> [--json]`;
  if (command === "architecture") return `${CLI_NAME} architecture <profiles|profile|baseline|show|challenge|build-vs-buy> --root <project> [--json]`;
  if (command === "brainstorm") return `${CLI_NAME} brainstorm --idea "<idea>" --root <project> [--id <id>] [--json]`;
  if (command === "discover") return `${CLI_NAME} discover --goal "<goal>" --root <project> [--id <id>] [--json]`;
  if (command === "draft") return `${CLI_NAME} draft --goal "<goal>" --root <project> [--goal-id <id>] [--json]`;
  if (command === "init") return `${CLI_NAME} init <brief.json> --root <project> [--json]`;
  if (command === "criterion" && subcommand === "update") return `${CLI_NAME} criterion update --root <project> --criterion <id> --user-story ... --measurement ... --threshold ... [--json]`;
  if (command === "profile" && subcommand === "add") return `${CLI_NAME} profile add --root <project> --type <skill|stack|constraint> --name <name> --strength <must|prefer|avoid> --purpose <purpose> [--json]`;
  if (command === "profile" && subcommand === "evidence") return `${CLI_NAME} profile evidence --root <project> --item <item-id> --result <satisfied|violated|waived> --summary <summary> [--json]`;
  if (command === "profile") return `${CLI_NAME} profile <add|evidence|show|check> --root <project> [--json]`;
  if (command === "evidence" && subcommand === "add") return `${CLI_NAME} evidence add --root <project> --criterion <id> --kind <kind> --summary <summary> --result <passing|failing|blocked|waived> [--json]`;
  if (command === "evidence") return `${CLI_NAME} evidence add --root <project> --criterion <id> --kind <kind> --summary <summary> --result <passing|failing|blocked|waived> [--json]`;
  if (command === "context" && subcommand === "export") return `${CLI_NAME} context export --root <project> [--json]`;
  if (command === "context") return `${CLI_NAME} context export --root <project> [--json]`;
  if (command === "skill" && subcommand === "export") return `${CLI_NAME} skill export [--pack] [--json]`;
  if (command === "skill") return `${CLI_NAME} skill export [--pack] [--json]`;
  if (["list", "check", "approve", "resume", "next", "evaluate", "status", "report", "changes", "archive"].includes(command)) {
    return `${CLI_NAME} ${command} --root <project> [--goal <goal-id>] [--json]`;
  }
  return TOP_LEVEL_USAGE;
}

function describeBootstrapAction(action) {
  if (action.action === "create") return `create ${action.path}`;
  if (action.action === "skip") return `keep existing ${action.path}`;
  if (action.action === "exists") return `already exists ${action.path}`;
  if (action.action === "update") return `update ${action.path}`;
  if (action.action === "overwrite") return `overwrite ${action.path}`;
  return `${action.action} ${action.path}`;
}

function printBootstrapPreview(payload) {
  const data = payload.data;
  printText("");
  printText("OpenNori project setup");
  printText(`Project: ${data.root}`);
  printText("");

  if (data.status === "ready") {
    printText("OpenNori is already ready in this project.");
    printText("Next: tell your agent the goal and ask it to use OpenNori.");
    return;
  }

  printText("This will prepare OpenNori for this project:");
  for (const action of data.install_plan.actions.filter((item) => item.would_write).slice(0, 8)) {
    printText(`- ${describeBootstrapAction(action)}`);
  }
  const remaining = data.install_plan.summary.would_write - Math.min(data.install_plan.summary.would_write, 8);
  if (remaining > 0) printText(`- plus ${remaining} more OpenNori project assets`);
  printText("");
  printText("No files have been written yet.");
}

function printBootstrapResult(payload) {
  const data = payload.data;
  printText("");
  if (data.status === "installed") {
    printText("OpenNori installed.");
    printText(`Created or refreshed ${data.install_plan.summary.will_write} project assets.`);
    printText("Next: tell your agent the goal and ask it to use OpenNori.");
    return;
  }
  if (data.status === "ready") {
    printText("OpenNori is ready.");
    printText("Next: tell your agent the goal and ask it to use OpenNori.");
    return;
  }
  printText(data.next || "OpenNori bootstrap finished.");
}

async function promptConfirm(message) {
  process.stdout.write(`${message} [y/N] `);
  return new Promise((resolve) => {
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", (chunk) => {
      process.stdin.pause();
      resolve(/^y(es)?$/i.test(String(chunk).trim()));
    });
  });
}

async function runBootstrap(args) {
  const root = resolveRoot(args);
  const confirmed = hasFlag(args, "--confirm");

  if (!isInteractive(args)) {
    printJson(bootstrap(root, { confirmed }));
    return;
  }

  if (confirmed) {
    printBootstrapResult(bootstrap(root, { confirmed: true }));
    return;
  }

  const preview = bootstrap(root, { confirmed: false });
  printBootstrapPreview(preview);
  if (preview.data.status === "ready") return;

  const shouldInstall = await promptConfirm("Install OpenNori here?");
  if (!shouldInstall) {
    printText("");
    printText("No changes made.");
    return;
  }

  printBootstrapResult(bootstrap(root, { confirmed: true }));
}

function argValues(args, name) {
  const rawName = name.startsWith("--") ? name : `--${name}`;
  return parsedArgTokens(args)
    .filter((item) => item.kind === "option" && item.rawName === rawName)
    .map((item) => {
      if (item.value !== undefined) return item.value;
      const next = args[item.index + 1];
      return next && !next.startsWith("-") ? next : undefined;
    })
    .filter((value) => value !== undefined);
}

function resolveRoot(args) {
  return path.resolve(argValue(args, "--root", process.cwd()));
}

function relativeTo(root, filePath) {
  return path.relative(root, filePath) || ".";
}

function parseEvidenceSource(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("{")) {
    try {
      return JSON.parse(raw);
    } catch {
      return { type: "reference", label: raw };
    }
  }
  return { type: "reference", label: raw };
}

function evidenceSourcesFromArgs(args) {
  const sources = argValues(args, "--source").map((source) => parseEvidenceSource(source)).filter(Boolean);
  for (const command of argValues(args, "--source-command")) {
    sources.push({ type: "command", label: command, command });
  }
  for (const sourcePath of argValues(args, "--source-path")) {
    sources.push({ type: "artifact", label: sourcePath, path: sourcePath });
  }
  for (const url of argValues(args, "--source-url")) {
    sources.push({ type: "url", label: url, url });
  }
  return sources;
}

function brainstormPaths(root, brainstormId) {
  const dir = path.join(root, ".opennori", "brainstorms");
  return {
    jsonPath: path.join(dir, `${brainstormId}.json`),
    markdownPath: path.join(dir, `${brainstormId}.md`)
  };
}

function discoveryPaths(root, discoveryId) {
  const dir = path.join(root, ".opennori", "brainstorms");
  return {
    jsonPath: path.join(dir, `${discoveryId}.discovery.json`),
    markdownPath: path.join(dir, `${discoveryId}.discovery.md`)
  };
}

function classifyChangedFile(filePath) {
  if (
    filePath.startsWith(".opennori/") ||
    filePath.startsWith("examples/")
  ) {
    return "acceptance";
  }
  return "implementation";
}

function gitChanges(root) {
  const result = spawnSync("git", ["status", "--short", "--untracked-files=all"], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    return { available: false, acceptance: [], implementation: [], raw_error: result.stderr.trim() };
  }

  const grouped = { available: true, acceptance: [], implementation: [] };
  for (const line of result.stdout.split("\n")) {
    if (!line.trim()) continue;
    const status = line.slice(0, 2).trim() || "modified";
    const rawPath = line.slice(3).trim();
    const filePath = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) : rawPath;
    grouped[classifyChangedFile(filePath)].push({ status, path: filePath });
  }
  return grouped;
}

function savePair(acceptancePath, evidencePath, contract, ledger) {
  writeJson(evidencePath, { contract, ledger });
  syncAcceptanceMarkdown(acceptancePath, contract, ledger);
}

function inferRootFromAcceptancePath(acceptancePath) {
  const parts = path.resolve(acceptancePath).split(path.sep);
  const noriIndex = parts.lastIndexOf(".opennori");
  if (noriIndex <= 0) return process.cwd();
  return parts.slice(0, noriIndex).join(path.sep) || path.sep;
}

function loadPair(args) {
  const explicitAcceptance = argValue(args, "--acceptance");
  const explicitEvidence = argValue(args, "--evidence");
  if (explicitAcceptance || explicitEvidence) {
    if (!explicitAcceptance || !explicitEvidence) {
      throw new Error("Both --acceptance and --evidence are required");
    }
    const acceptancePath = path.resolve(explicitAcceptance);
    const evidencePath = path.resolve(explicitEvidence);
    const payload = readJson(evidencePath);
    return {
      contract: payload.contract,
      ledger: payload.ledger,
      acceptancePath,
      evidencePath,
      root: inferRootFromAcceptancePath(acceptancePath)
    };
  }

  const root = resolveRoot(args);
  const goal = argValue(args, "--goal");
  const pairs = findActivePairs(root);
  const pair = goal ? pairs.find((item) => item.goalId === goal) : pairs[0];
  if (!pair) {
    throw new Error(`No active OpenNori goal found under ${root}`);
  }
  if (!goal && pairs.length > 1) {
    throw new Error("Multiple active OpenNori goals found. Pass --goal <goal-id> or explicit --acceptance/--evidence paths.");
  }
  const payload = readJson(pair.evidencePath);
  return {
    contract: payload.contract,
    ledger: payload.ledger,
    acceptancePath: pair.acceptancePath,
    evidencePath: pair.evidencePath,
    root
  };
}

export async function main(args) {
  const command = args[0];
  if (!command || command === "--help" || command === "-h") {
    printJson(ok({ usage: TOP_LEVEL_USAGE, side_effect: "none" }));
    return;
  }

  if (wantsHelp(args)) {
    printJson(ok({ command: [command, args[1]].filter(Boolean).join(" "), usage: usageFor(args), side_effect: "none" }));
    return;
  }

  if (command === "bootstrap") {
    await runBootstrap(args);
    return;
  }

  if (command === "doctor") {
    printJson(await runDoctorCommand(args.slice(1)));
    return;
  }

  if (command === "architecture" && args[1] === "profiles") {
    printJson(await runArchitectureProfilesCommand(args.slice(2)));
    return;
  }

  if (command === "architecture" && args[1] === "profile") {
    const root = resolveRoot(args);
    const source = argValue(args, "--from") || argValue(args, "--path");
    const force = hasFlag(args, "--force");
    if (!source) throw new Error("--from is required");
    const sourcePath = path.resolve(source);
    const profile = normalizeArchitectureProfile(readJson(sourcePath), argValue(args, "--id"));
    const issues = validateArchitectureProfile(profile);
    if (issues.length > 0) {
      printJson({ ...fail("invalid_architecture_profile", "Architecture Profile failed validation", "Add id, title, summary, principles, checks, and build_vs_buy_policy."), issues });
      process.exitCode = 1;
      return;
    }
    const target = writeArchitectureProfile(root, profile, { force });
    refreshManifest(root);
    printJson(ok(
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
    ));
    return;
  }

  if (command === "architecture" && args[1] === "baseline") {
    const root = resolveRoot(args);
    const goal = String(argValue(args, "--goal", "")).trim();
    const profileId = argValue(args, "--profile", "typescript-agent-state-cli");
    const goalId = argValue(args, "--goal-id") || slugify(goal || profileId);
    const confirmed = hasFlag(args, "--confirm");
    if (!goal) throw new Error("--goal is required");
    const baseline = buildArchitectureBaseline(root, {
      profileId,
      goal,
      goalId,
      summary: argValue(args, "--summary"),
      accepted: confirmed
    });
    const paths = architectureBaselinePaths(root);
    if (confirmed) {
      writeArchitectureBaseline(root, baseline);
      refreshManifest(root);
    }
    printJson(ok(
      {
        root,
        confirmed,
        baseline,
        architecture: confirmed ? architectureState(root, goalId) : {
          ...architectureState(root, goalId),
          preview: {
            baseline_path: relativeTo(root, paths.jsonPath),
            markdown_path: relativeTo(root, paths.markdownPath),
            side_effect: "none"
          }
        },
        side_effect: confirmed ? "write" : "none"
      },
      confirmed
        ? [
            { kind: "architecture_baseline", path: paths.jsonPath },
            { kind: "architecture_baseline_markdown", path: paths.markdownPath }
          ]
        : [],
      [],
      confirmed
        ? ["Implement Product AC under this Architecture Baseline. Raise an Architecture Challenge if project evidence conflicts with it."]
        : ["Show this Architecture Baseline to the user and rerun with --confirm only after they accept it."]
    ));
    return;
  }

  if (command === "architecture" && args[1] === "show") {
    printJson(await runArchitectureShowCommand(args.slice(2)));
    return;
  }

  if (command === "architecture" && args[1] === "challenge") {
    const root = resolveRoot(args);
    const baseline = readArchitectureBaseline(root);
    if (!baseline) throw new Error("No Architecture Baseline found. Create one before challenging it.");
    const summary = String(argValue(args, "--summary", "")).trim();
    const evidence = String(argValue(args, "--evidence", "")).trim();
    const recommendation = String(argValue(args, "--recommendation", "")).trim();
    if (!summary) throw new Error("--summary is required");
    if (!evidence) throw new Error("--evidence is required");
    if (!recommendation) throw new Error("--recommendation is required");
    const id = argValue(args, "--id") || slugify(summary.slice(0, 48));
    const challenge = {
      schema_version: ARCHITECTURE_CHALLENGE_SCHEMA_VERSION,
      id,
      status: "open",
      created_at: new Date().toISOString(),
      baseline: {
        profile: baseline.profile,
        goal_id: baseline.goal_id,
        accepted_at: baseline.accepted_at
      },
      summary,
      evidence,
      recommendation,
      needs_user: !hasFlag(args, "--no-user"),
      rule: "Agent may challenge the Architecture Baseline with evidence, but must not silently replace it."
    };
    const paths = architectureChallengePath(root, id);
    writeJson(paths.jsonPath, challenge);
    fs.mkdirSync(path.dirname(paths.markdownPath), { recursive: true });
    fs.writeFileSync(paths.markdownPath, renderArchitectureChallengeMarkdown(challenge));
    refreshManifest(root);
    printJson(ok(
      {
        root,
        challenge,
        architecture: architectureState(root, baseline.goal_id),
        challenge_path: paths.jsonPath,
        markdown_path: paths.markdownPath
      },
      [
        { kind: "architecture_challenge", path: paths.jsonPath },
        { kind: "architecture_challenge_markdown", path: paths.markdownPath }
      ],
      [],
      ["Ask the user to confirm whether to revise or keep the current Architecture Baseline."]
    ));
    return;
  }

  if (command === "architecture" && args[1] === "build-vs-buy") {
    const root = resolveRoot(args);
    const area = String(argValue(args, "--area", "")).trim();
    const need = String(argValue(args, "--need", "")).trim();
    const recommendation = String(argValue(args, "--recommendation", "")).trim();
    const summary = String(argValue(args, "--summary", "")).trim();
    if (!area) throw new Error("--area is required");
    if (!need) throw new Error("--need is required");
    if (!recommendation) throw new Error("--recommendation is required");
    if (!summary) throw new Error("--summary is required");
    const id = argValue(args, "--id") || slugify(`${area}-${need}`.slice(0, 64));
    const decision = {
      schema_version: BUILD_VS_BUY_SCHEMA_VERSION,
      id,
      created_at: new Date().toISOString(),
      area,
      need,
      recommendation,
      status: argValue(args, "--status", "active"),
      summary,
      current_project: argValue(args, "--current-project", ""),
      standard_library: argValue(args, "--standard-library", ""),
      official_sdk: argValue(args, "--official-sdk", ""),
      open_source: argValue(args, "--open-source", ""),
      self_build_reason: argValue(args, "--self-build-reason", ""),
      superseded_by: argValue(args, "--superseded-by", ""),
      superseded_reason: argValue(args, "--superseded-reason", "")
    };
    const paths = buildVsBuyPath(root, id);
    writeJson(paths.jsonPath, decision);
    fs.mkdirSync(path.dirname(paths.markdownPath), { recursive: true });
    fs.writeFileSync(paths.markdownPath, renderBuildVsBuyMarkdown(decision));
    refreshManifest(root);
    printJson(ok(
      {
        root,
        decision,
        decision_path: paths.jsonPath,
        markdown_path: paths.markdownPath,
        architecture: architectureState(root)
      },
      [
        { kind: "build_vs_buy_decision", path: paths.jsonPath },
        { kind: "build_vs_buy_markdown", path: paths.markdownPath }
      ],
      decision.recommendation === "self-build" && !decision.self_build_reason
        ? [{ type: "build_vs_buy", message: "Self-build recommendation should include --self-build-reason." }]
        : [],
      ["Use this decision as architecture evidence when implementing related acceptance gaps."]
    ));
    return;
  }

  if (command === "list") {
    const root = resolveRoot(args);
    const pairs = findActivePairs(root).map((pair) => {
      const payload = readJson(pair.evidencePath);
      return {
        goal_id: pair.goalId,
        status: payload.ledger?.status || "unknown",
        current_gap: currentGap(payload.contract, payload.ledger),
        acceptance_path: pair.acceptancePath,
        evidence_path: pair.evidencePath
      };
    });
    printJson(ok({ root, active_goals: pairs }));
    return;
  }

  if (command === "install") {
    const root = resolveRoot(args);
    const dryRun = hasFlag(args, "--dry-run");
    const force = hasFlag(args, "--force");
    const confirmed = hasFlag(args, "--confirm");
    const requestedSkill = hasFlag(args, "--skill");
    const refreshSkill = hasFlag(args, "--refresh-skill");
    const mergeAgentRoute = hasFlag(args, "--merge-agent-route");
    if ((force || refreshSkill || mergeAgentRoute) && !dryRun && !confirmed) {
      const previewFlags = [
        "--dry-run",
        force ? "--force" : null,
        requestedSkill ? "--skill" : null,
        refreshSkill ? "--refresh-skill" : null,
        mergeAgentRoute ? "--merge-agent-route" : null,
        "--json"
      ].filter(Boolean).join(" ");
      printJson(fail(
        "confirm_required",
        "Install may update existing OpenNori-managed project assets.",
        `Run opennori install --root <project> ${previewFlags} first, then rerun with --confirm if the planned updates are acceptable.`
      ));
      process.exitCode = 1;
      return;
    }
    const actions = installActions(root, { dryRun, force, requestedSkill, refreshSkill, mergeAgentRoute });
    const manifestAction = actions.find((action) => action.kind === "manifest");
    const installPlan = buildInstallPlan(root, actions, { dryRun, force, requestedSkill, refreshSkill, mergeAgentRoute });

    printJson(ok({
      root,
      dry_run: dryRun,
      force,
      confirmed,
      install_plan: installPlan,
      actions: installPlan.actions,
      manifest: manifestAction.manifest
    }));
    return;
  }

  if (command === "uninstall") {
    const root = resolveRoot(args);
    const dryRun = hasFlag(args, "--dry-run");
    const confirmed = hasFlag(args, "--confirm");
    const includeState = hasFlag(args, "--include-state");
    const actions = buildUninstallActions(root, { includeState });
    const uninstallPlan = buildUninstallPlan(root, actions, { dryRun, includeState });

    if (!dryRun && !confirmed) {
      printJson(fail(
        "confirm_required",
        "Uninstall removes OpenNori-managed project assets.",
        "Run opennori uninstall --root <project> --dry-run --json first, then rerun with --confirm if the planned removals are acceptable."
      ));
      process.exitCode = 1;
      return;
    }

    if (!dryRun) {
      applyUninstallActions(actions);
    }

    printJson(ok({
      root,
      dry_run: dryRun,
      confirmed,
      include_state: includeState,
      uninstall_plan: uninstallPlan,
      actions: uninstallPlan.actions
    }));
    return;
  }

  if (command === "upgrade") {
    const root = resolveRoot(args);
    const dryRun = hasFlag(args, "--dry-run");
    const confirmed = hasFlag(args, "--confirm");
    const requestedSkill = hasFlag(args, "--skill") || hasFlag(args, "--refresh-skill");
    const mergeAgentRoute = hasFlag(args, "--merge-agent-route");
    const actions = upgradeActions(root, { requestedSkill, mergeAgentRoute });
    const upgradePlan = buildUpgradePlan(root, actions, { dryRun, requestedSkill, mergeAgentRoute });

    if (!dryRun && !confirmed) {
      printJson(fail(
        "confirm_required",
        "Upgrade refreshes OpenNori manifest, protocol, and optionally Skill Pack assets.",
        "Run opennori upgrade --root <project> --dry-run --json first, then rerun with --confirm if the planned updates are acceptable."
      ));
      process.exitCode = 1;
      return;
    }

    if (!dryRun && actions.some((action) => action.action === "missing")) {
      printJson(fail(
        "install_required",
        "Upgrade found missing OpenNori entry assets.",
        "Run opennori install --root <project> --dry-run --json before upgrading missing assets."
      ));
      process.exitCode = 1;
      return;
    }

    if (!dryRun) {
      applyUpgradeActions(actions);
      writeManifest(root);
    }

    const nextActions = dryRun
      ? ["Review the upgrade plan, then rerun with --confirm if the planned updates are acceptable."]
      : ["Run opennori check --root <project> --json to audit existing active Nori Contracts for underspecified ACs before continuing work."];

    printJson(ok({
      root,
      dry_run: dryRun,
      confirmed,
      upgrade_plan: upgradePlan,
      actions: upgradePlan.actions,
      manifest: dryRun ? buildManifest(root) : safeReadManifest(root)
    }, [], [], nextActions));
    return;
  }

  if (command === "brainstorm") {
    const root = resolveRoot(args);
    const idea = String(argValue(args, "--idea", "")).trim();
    if (!idea) throw new Error("--idea is required");
    const brainstorm = buildBrainstorm(idea, argValue(args, "--id"));
    const paths = brainstormPaths(root, brainstorm.id);
    writeJson(paths.jsonPath, brainstorm);
    fs.mkdirSync(path.dirname(paths.markdownPath), { recursive: true });
    fs.writeFileSync(paths.markdownPath, renderBrainstormMarkdown(brainstorm));
    refreshManifest(root);
    printJson(ok(
      {
        brainstorm_id: brainstorm.id,
        status: brainstorm.status,
        idea: brainstorm.idea,
        candidates: brainstorm.candidates,
        brainstorm_path: paths.jsonPath,
        markdown_path: paths.markdownPath,
        is_acceptance_contract: false
      },
      [
        { kind: "brainstorm_source", path: paths.jsonPath },
        { kind: "brainstorm_markdown", path: paths.markdownPath }
      ],
      [],
      ["Ask the user to choose or revise a candidate before running opennori draft."]
    ));
    return;
  }

  if (command === "discover") {
    const root = resolveRoot(args);
    const goal = String(argValue(args, "--goal", argValue(args, "--idea", ""))).trim();
    if (!goal) throw new Error("--goal is required");
    const discovery = discoverAcceptance(goal, argValue(args, "--id"));
    const paths = discoveryPaths(root, discovery.id);
    writeJson(paths.jsonPath, discovery);
    fs.mkdirSync(path.dirname(paths.markdownPath), { recursive: true });
    fs.writeFileSync(paths.markdownPath, renderDiscoveryMarkdown(discovery));
    refreshManifest(root);
    printJson(ok(
      {
        discovery_id: discovery.id,
        status: discovery.status,
        goal: discovery.goal,
        gaps: discovery.gaps,
        questions: discovery.gaps.map((gap) => gap.question),
        discovery_path: paths.jsonPath,
        markdown_path: paths.markdownPath,
        is_acceptance_contract: false
      },
      [
        { kind: "acceptance_discovery", path: paths.jsonPath },
        { kind: "acceptance_discovery_markdown", path: paths.markdownPath }
      ],
      [],
      [discovery.next]
    ));
    return;
  }

  if (command === "draft") {
    const root = resolveRoot(args);
    const brainstormId = argValue(args, "--from-brainstorm");
    let brief;
    if (brainstormId) {
      const candidateId = argValue(args, "--candidate");
      if (!candidateId) throw new Error("--candidate is required with --from-brainstorm");
      brief = briefFromBrainstorm(readJson(brainstormPaths(root, brainstormId).jsonPath), candidateId);
    } else {
      const goal = String(argValue(args, "--goal", "")).trim();
      if (!goal) throw new Error("--goal is required");
      brief = briefFromGoal(goal, argValue(args, "--goal-id"));
    }
    const contract = buildContractFromBrief(brief);
    const ledger = buildEvidenceLedger(contract);
    const issues = validateContract(contract, ledger);
    if (issues.length > 0) {
      printJson({ ...fail("invalid_acceptance", "Draft does not produce a valid OpenNori contract", "Rewrite ACs from the user's perspective"), issues });
      process.exitCode = 1;
      return;
    }
    const paths = pathsForGoal(root, contract.goal_id);
    fs.mkdirSync(path.dirname(paths.acceptancePath), { recursive: true });
    fs.writeFileSync(paths.acceptancePath, renderAcceptanceMarkdown(contract, ledger));
    writeJson(paths.evidencePath, { contract, ledger });
    refreshManifest(root);
    printJson(ok(
      {
        goal_id: contract.goal_id,
        acceptance_basis: contract.acceptance_basis,
        acceptance_path: paths.acceptancePath,
        evidence_path: paths.evidencePath,
        criteria: contract.criteria,
        current_gap: currentGap(contract, ledger)
      },
      [
        { kind: "draft_acceptance_contract", path: paths.acceptancePath },
        { kind: "evidence_ledger", path: paths.evidencePath }
      ],
      [],
      ["Ask the user to approve or revise these acceptance criteria before implementation."]
    ));
    return;
  }

  if (command === "init") {
    const briefPath = path.resolve(args[1] || "");
    const root = resolveRoot(args);
    const brief = readJson(briefPath);
    const contract = buildContractFromBrief(brief);
    const ledger = buildEvidenceLedger(contract);
    const issues = validateContract(contract, ledger);
    if (issues.length > 0) {
      printJson({ ...fail("invalid_acceptance", "Brief does not produce a valid OpenNori contract", "Rewrite ACs from the user's perspective"), issues });
      process.exitCode = 1;
      return;
    }

    const paths = pathsForGoal(root, contract.goal_id);
    const evidencePayload = { contract, ledger };
    fs.mkdirSync(path.dirname(paths.acceptancePath), { recursive: true });
    fs.writeFileSync(paths.acceptancePath, renderAcceptanceMarkdown(contract, ledger));
    writeJson(paths.evidencePath, evidencePayload);
    refreshManifest(root);

    printJson(ok(
      {
        goal_id: contract.goal_id,
        acceptance_path: paths.acceptancePath,
        evidence_path: paths.evidencePath,
        current_gap: currentGap(contract, ledger)
      },
      [
        { kind: "acceptance_contract", path: paths.acceptancePath },
        { kind: "evidence_ledger", path: paths.evidencePath }
      ],
      [],
      ["Run opennori next --acceptance <path> --evidence <path> --json before choosing implementation work."]
    ));
    return;
  }

  if (command === "check") {
    const { contract, ledger, root } = loadPair(args);
    const issues = validateContract(contract, ledger);
    if (issues.length > 0) {
      printJson({ ...fail("invalid_acceptance", "Acceptance contract failed validation", "Fix reported issues before continuing"), issues });
      process.exitCode = 1;
      return;
    }
    const acceptanceQuality = auditAcceptanceQuality(contract);
    const warnings = acceptanceQuality.findings.map((finding) => ({
      type: "acceptance_quality",
      criterion_id: finding.criterion_id,
      gap_id: finding.gap_id,
      message: finding.question
    }));
    const nextActions = acceptanceQuality.status === "needs-user-review"
      ? ["Ask the user the acceptance_quality questions, then revise the affected criteria before relying on this contract as complete."]
      : [];
    const architecture = architectureState(root, contract.goal_id);
    const architectureWarnings = [];
    if (architecture.decision === "missing") {
      architectureWarnings.push({
        type: "architecture",
        message: "Active goal has no Architecture Baseline.",
        recovery: "Preview an Architecture Baseline, show it to the user, then rerun opennori architecture baseline --root <project> --goal <goal> --confirm --json after confirmation."
      });
    }
    if (architecture.decision === "draft") {
      architectureWarnings.push({
        type: "architecture",
        message: "Architecture Baseline is still draft.",
        recovery: "Ask the user to confirm or revise the baseline before implementation."
      });
    }
    if (architecture.decision === "invalid") {
      architectureWarnings.push({
        type: "architecture",
        message: "Architecture Baseline is invalid.",
        recovery: "Inspect .opennori/architecture/baseline.json, fix the reported issues, then rerun opennori check."
      });
    }
    if (architecture.decision === "challenged") {
      architectureWarnings.push({
        type: "architecture",
        message: "Architecture Baseline has open challenges.",
        recovery: "Ask the user to resolve the Architecture Challenge before claiming architecture completion."
      });
    }
    if (!architecture.agent_surface.guide.installed || !architecture.agent_surface.guide.in_sync) {
      architectureWarnings.push({
        type: "architecture",
        message: ".opennori/agent-guide.md is missing or stale.",
        recovery: "Preview opennori install --root <project> --merge-agent-route --dry-run --json, then confirm the refresh if acceptable."
      });
    }
    if (!architecture.agent_surface.agents.references_baseline && !architecture.agent_surface.claude.references_baseline) {
      architectureWarnings.push({
        type: "architecture",
        message: "No project agent route references the Architecture Baseline.",
        recovery: "Preview opennori install --root <project> --merge-agent-route --dry-run --json, then confirm the non-destructive merge if acceptable."
      });
    }
    const architectureStatus = architectureWarnings.length > 0 ? "needs-action" : "clear";
    const buildVsBuyWarnings = architecture.build_vs_buy.findings.map((finding) => ({
      type: "build_vs_buy",
      decision_id: finding.decision_id,
      severity: finding.severity,
      issue: finding.issue,
      message: finding.message,
      recovery: finding.recovery
    }));
    const health = evidenceHealth(contract, ledger);
    const evidenceHealthWarnings = health.findings.map((finding) => ({
      type: "evidence_health",
      criterion_id: finding.criterion_id,
      severity: finding.severity,
      issue: finding.issue,
      message: finding.message,
      recovery: finding.recovery
    }));
    const combinedWarnings = [...warnings, ...architectureWarnings, ...buildVsBuyWarnings, ...evidenceHealthWarnings];
    if (architectureStatus === "needs-action") {
      nextActions.push("Resolve architecture_check warnings before treating this goal as architecture-complete.");
    }
    if (architecture.build_vs_buy.status !== "clear") {
      nextActions.push("Resolve build_vs_buy warnings before treating custom infrastructure as mature.");
    }
    if (health.status !== "clear") {
      nextActions.push("Review evidence_health warnings before treating this goal as confidently complete.");
    }
    printJson(ok({
      goal_id: contract.goal_id,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger),
      statuses: Object.fromEntries(Object.entries(ledger.criteria).map(([id, state]) => [id, state.status])),
      acceptance_quality: acceptanceQuality,
      architecture_check: {
        status: architectureStatus,
        decision: architecture.decision,
        warnings: architectureWarnings,
        architecture
      },
      evidence_health: health
    }, [], combinedWarnings, nextActions));
    return;
  }

  if (command === "approve") {
    const { contract, ledger, acceptancePath, evidencePath, root } = loadPair(args);
    contract.acceptance_basis = {
      status: "approved",
      summary: argValue(args, "--summary", "User approved acceptance criteria."),
      approved_at: new Date().toISOString()
    };
    recomputeWorkflowStatus(contract, ledger);
    savePair(acceptancePath, evidencePath, contract, ledger);
    refreshManifest(root);
    printJson(ok({
      goal_id: contract.goal_id,
      acceptance_basis: contract.acceptance_basis,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger)
    }));
    return;
  }

  if (command === "criterion" && args[1] === "update") {
    const { contract, ledger, acceptancePath, evidencePath, root } = loadPair(args);
    const criterionId = argValue(args, "--criterion");
    if (!criterionId) throw new Error("--criterion is required");
    const criterion = contract.criteria.find((item) => item.id === criterionId);
    if (!criterion) throw new Error(`Criterion not found: ${criterionId}`);

    const before = {
      user_story: criterion.user_story,
      measurement: criterion.measurement,
      threshold: criterion.threshold,
      risk: criterion.risk
    };
    criterion.user_story = argValue(args, "--user-story", criterion.user_story);
    criterion.measurement = argValue(args, "--measurement", criterion.measurement);
    criterion.threshold = argValue(args, "--threshold", criterion.threshold);
    criterion.risk = argValue(args, "--risk", criterion.risk);
    const changed = (
      before.user_story !== criterion.user_story ||
      before.measurement !== criterion.measurement ||
      before.threshold !== criterion.threshold ||
      before.risk !== criterion.risk
    );
    if (changed && ledger.criteria[criterionId]) {
      ledger.criteria[criterionId] = {
        status: "unknown",
        confidence: "none",
        required: criterion.required !== false,
        risk: criterion.risk || "medium",
        evidence: []
      };
    }
    contract.acceptance_basis = {
      status: "approved",
      summary: argValue(args, "--summary", `User revised ${criterionId}.`),
      approved_at: new Date().toISOString()
    };
    const issues = validateContract(contract, ledger);
    if (issues.length > 0) {
      printJson({ ...fail("invalid_acceptance", "Updated criterion failed validation", "Rewrite the criterion from the user's perspective"), issues });
      process.exitCode = 1;
      return;
    }

    recomputeWorkflowStatus(contract, ledger);
    savePair(acceptancePath, evidencePath, contract, ledger);
    refreshManifest(root);
    printJson(ok({
      goal_id: contract.goal_id,
      criterion,
      acceptance_basis: contract.acceptance_basis,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger)
    }));
    return;
  }

  if (command === "profile" && args[1] === "add") {
    const { contract, ledger, acceptancePath, evidencePath, root } = loadPair(args);
    const item = {
      id: argValue(args, "--id"),
      type: argValue(args, "--type", "constraint"),
      name: argValue(args, "--name"),
      strength: argValue(args, "--strength", "prefer"),
      purpose: argValue(args, "--purpose", ""),
      scope: argValue(args, "--scope", ""),
      install_policy: argValue(args, "--install-policy", "ask_before_install")
    };
    addProfileItem(ledger, item);
    recomputeWorkflowStatus(contract, ledger);
    savePair(acceptancePath, evidencePath, contract, ledger);
    refreshManifest(root);
    printJson(ok({
      goal_id: contract.goal_id,
      profile: ledger.capability_profile,
      compliance: profileCompliance(ledger),
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger)
    }));
    return;
  }

  if (command === "profile" && args[1] === "evidence") {
    const { contract, ledger, acceptancePath, evidencePath, root } = loadPair(args);
    const itemId = argValue(args, "--item");
    if (!itemId) throw new Error("--item is required");
    const evidence = {
      result: argValue(args, "--result", "satisfied"),
      summary: argValue(args, "--summary", ""),
      path: argValue(args, "--path")
    };
    if (!evidence.summary) throw new Error("--summary is required");
    addProfileEvidence(ledger, itemId, evidence);
    recomputeWorkflowStatus(contract, ledger);
    savePair(acceptancePath, evidencePath, contract, ledger);
    refreshManifest(root);
    printJson(ok({
      goal_id: contract.goal_id,
      item: itemId,
      compliance: profileCompliance(ledger),
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger)
    }));
    return;
  }

  if (command === "profile" && args[1] === "show") {
    const { contract, ledger } = loadPair(args);
    printJson(ok({
      goal_id: contract.goal_id,
      profile: ledger.capability_profile || { items: [], evidence: [] },
      compliance: profileCompliance(ledger),
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger)
    }));
    return;
  }

  if (command === "profile" && args[1] === "check") {
    const { contract, ledger, acceptancePath, evidencePath, root } = loadPair(args);
    const record = hasFlag(args, "--record");
    const checks = autoProfileChecks(root, ledger);
    if (record) {
      recordAutoProfileChecks(ledger, checks);
      recomputeWorkflowStatus(contract, ledger);
      savePair(acceptancePath, evidencePath, contract, ledger);
      refreshManifest(root);
    }
    printJson(ok({
      goal_id: contract.goal_id,
      recorded: record,
      checks,
      profile: ledger.capability_profile || { items: [], evidence: [] },
      compliance: profileCompliance(ledger),
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger)
    }));
    return;
  }

  if (command === "resume") {
    const { contract, ledger, acceptancePath, evidencePath, root } = loadPair(args);
    const recommendation = nextRecommendation(contract, ledger);
    printJson(ok({
      goal_id: contract.goal_id,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger),
      completion: completionAnswer(contract, ledger),
      intervention: intervention(contract, ledger),
      evidence_health: evidenceHealth(contract, ledger),
      architecture: architectureState(root, contract.goal_id),
      next_recommendation: recommendation,
      acceptance_path: acceptancePath,
      evidence_path: evidencePath
    }, [], [], recommendation.actions));
    return;
  }

  if (command === "next") {
    const { contract, ledger } = loadPair(args);
    const recommendation = nextRecommendation(contract, ledger);
    printJson(ok({
      goal_id: contract.goal_id,
      current_gap: currentGap(contract, ledger),
      complete: currentGap(contract, ledger) === null,
      next_recommendation: recommendation
    }, [], [], recommendation.actions));
    return;
  }

  if (command === "evidence" && args[1] === "add") {
    const { contract, ledger, acceptancePath, evidencePath, root } = loadPair(args);
    const criterionId = argValue(args, "--criterion");
    if (!criterionId) throw new Error("--criterion is required");
    const sources = evidenceSourcesFromArgs(args);
    const evidence = {
      kind: argValue(args, "--kind", "manual"),
      basis: argValue(args, "--basis"),
      summary: argValue(args, "--summary", ""),
      result: argValue(args, "--result", "passing"),
      confidence: argValue(args, "--confidence"),
      path: argValue(args, "--path"),
      sources,
      reviewability: argValue(args, "--reviewability"),
      limitations: argValue(args, "--limitations")
    };
    if (!evidence.summary) throw new Error("--summary is required");
    addEvidence(contract, ledger, criterionId, evidence);
    writeJson(evidencePath, { contract, ledger });
    syncAcceptanceMarkdown(acceptancePath, contract, ledger);
    refreshManifest(root);
    printJson(ok({
      goal_id: contract.goal_id,
      criterion: criterionId,
      criterion_status: ledger.criteria[criterionId].status,
      confidence: ledger.criteria[criterionId].confidence,
      latest_evidence: criterionStatusRows(contract, ledger).find((row) => row.id === criterionId)?.latest_evidence,
      gate: ledger.criteria[criterionId].evidence.at(-1)?.gate,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger)
    }));
    return;
  }

  if (command === "evaluate") {
    const { contract, ledger, acceptancePath, evidencePath, root } = loadPair(args);
    recomputeWorkflowStatus(contract, ledger);
    writeJson(evidencePath, { contract, ledger });
    syncAcceptanceMarkdown(acceptancePath, contract, ledger);
    refreshManifest(root);
    printJson(ok({
      goal_id: contract.goal_id,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger)
    }));
    return;
  }

  if (command === "status") {
    const { contract, ledger, root } = loadPair(args);
    const recommendation = nextRecommendation(contract, ledger);
    printJson(ok({
      goal_id: contract.goal_id,
      workflow_status: ledger.status,
      current_gap: currentGap(contract, ledger),
      completion: completionAnswer(contract, ledger),
      intervention: intervention(contract, ledger),
      evidence_health: evidenceHealth(contract, ledger),
      architecture: architectureState(root, contract.goal_id),
      next_recommendation: recommendation,
      criteria: criterionStatusRows(contract, ledger)
    }, [], [], recommendation.actions));
    return;
  }

  if (command === "report") {
    const { contract, ledger, root } = loadPair(args);
    const output = path.resolve(argValue(args, "--output") || pathsForGoal(root, contract.goal_id).reportPath);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, renderReportWithArchitecture(root, contract, ledger));
    refreshManifest(root);
    const recommendation = nextRecommendation(contract, ledger);
    printJson(ok(
      {
        goal_id: contract.goal_id,
        report_path: output,
        workflow_status: ledger.status,
        current_gap: currentGap(contract, ledger),
        completion: completionAnswer(contract, ledger),
        intervention: intervention(contract, ledger),
        evidence_health: evidenceHealth(contract, ledger),
        architecture: architectureState(root, contract.goal_id),
        next_recommendation: recommendation
      },
      [{ kind: "acceptance_report", path: output }],
      [],
      recommendation.actions
    ));
    return;
  }

  if (command === "context" && args[1] === "export") {
    const root = resolveRoot(args);
    const goal = argValue(args, "--goal");
    const pairs = findActivePairs(root);
    const pair = goal ? pairs.find((item) => item.goalId === goal) : pairs[0];
    if (!pair) throw new Error(`No active OpenNori goal found under ${root}`);
    if (!goal && pairs.length > 1) {
      throw new Error("Multiple active OpenNori goals found. Pass --goal <goal-id>.");
    }
    const context = buildContextExport(root, pair);
    const output = argValue(args, "--output");
    if (output) {
      const outputPath = path.resolve(output);
      writeJson(outputPath, context);
      printJson(ok(
        { ...context, output_path: outputPath },
        [{ kind: "opennori_context_export", path: outputPath }],
        [],
        context.next_recommendation.actions
      ));
      return;
    }
    printJson(ok(context, [], [], context.next_recommendation.actions));
    return;
  }

  if (command === "changes") {
    const root = resolveRoot(args);
    const pairs = findActivePairs(root).map((pair) => {
      const payload = readJson(pair.evidencePath);
      return {
        goal_id: pair.goalId,
        workflow_status: payload.ledger?.status || "unknown",
        current_gap: currentGap(payload.contract, payload.ledger)
      };
    });
    printJson(ok({
      root,
      active_goals: pairs,
      changed_files: gitChanges(root)
    }));
    return;
  }

  if (command === "archive") {
    const root = resolveRoot(args);
    const { contract, ledger, acceptancePath, evidencePath } = loadPair(args);
    recomputeWorkflowStatus(contract, ledger);
    if (ledger.status !== "complete" && ledger.status !== "blocked") {
      printJson(fail("not_archivable", `Goal ${contract.goal_id} is ${ledger.status}`, "Only complete or blocked OpenNori goals can be archived."));
      process.exitCode = 1;
      return;
    }

    const archiveDir = ledger.status === "complete" ? "completed" : "blocked";
    const targetAcceptance = path.join(root, ".opennori", archiveDir, path.basename(acceptancePath));
    const targetEvidence = path.join(root, ".opennori", archiveDir, path.basename(evidencePath));
    const reportPath = pathsForGoal(root, contract.goal_id).reportPath;
    for (const target of [targetAcceptance, targetEvidence]) {
      if (fs.existsSync(target) && !hasFlag(args, "--force")) {
        printJson(fail("archive_target_exists", `Archive target exists: ${relativeTo(root, target)}`, "Pass --force or move the existing archive file."));
        process.exitCode = 1;
        return;
      }
    }

    writeJson(evidencePath, { contract, ledger });
    syncAcceptanceMarkdown(acceptancePath, contract, ledger);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, renderReportWithArchitecture(root, contract, ledger));
    fs.mkdirSync(path.dirname(targetAcceptance), { recursive: true });
    fs.renameSync(acceptancePath, targetAcceptance);
    fs.renameSync(evidencePath, targetEvidence);
    refreshManifest(root);
    printJson(ok(
      {
        goal_id: contract.goal_id,
        archived_as: archiveDir,
        acceptance_path: targetAcceptance,
        evidence_path: targetEvidence,
        report_path: reportPath
      },
      [
        { kind: "archived_acceptance_contract", path: targetAcceptance },
        { kind: "archived_evidence_ledger", path: targetEvidence },
        { kind: "acceptance_report", path: reportPath }
      ]
    ));
    return;
  }

  if (command === "skill" && args[1] === "export") {
    const payload = await runSkillExportCommand(args.slice(2));
    printJson(payload);
    if (!payload.ok) process.exitCode = 1;
    return;
  }

  printJson(fail("unknown_command", `Unknown command: ${args.join(" ")}`));
  process.exitCode = 2;
}
