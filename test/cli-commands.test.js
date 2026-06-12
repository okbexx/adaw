import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { runApproveCommand, runCriterionUpdateCommand, runEvaluateCommand, runNextCommand, runResumeCommand, runStatusCommand } from "../src/cli/commands/acceptance.js";
import { runArchitectureBuildVsBuyCommand, runArchitectureChallengeCommand, runArchitectureProfileCommand, runArchitectureProfilesCommand } from "../src/cli/commands/architecture.js";
import { runContextExportCommand } from "../src/cli/commands/context.js";
import { runEvidenceAddCommand } from "../src/cli/commands/evidence.js";
import { runChangesCommand, runCheckCommand, runDoctorCommand, runListCommand } from "../src/cli/commands/health.js";
import { runProfileAddCommand, runProfileEvidenceCommand, runProfileShowCommand } from "../src/cli/commands/profile.js";
import { runArchiveCommand, runReportCommand } from "../src/cli/commands/reporting.js";
import { runSkillExportCommand } from "../src/cli/commands/skill.js";
import { buildArchitectureBaseline, writeArchitectureBaseline } from "../src/architecture.js";
import { addEvidence, buildEvidenceLedger, writeJson } from "../src/core.js";

const ROOT = path.resolve(import.meta.dirname, "..");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "nori-command-test-"));
}

function writeActiveGoal(root) {
  const contract = {
    schema_version: "opennori/contract-v1",
    goal_id: "module-goal",
    goal: "Ship module command coverage",
    criteria: [
      {
        id: "AC-1",
        user_story: "As a user, I can inspect active goal gaps.",
        measurement: "Run list command module.",
        threshold: "Output includes the current gap."
      }
    ]
  };
  const ledger = buildEvidenceLedger(contract);
  const paths = path.join(root, ".opennori", "active");
  fs.mkdirSync(paths, { recursive: true });
  fs.writeFileSync(path.join(paths, "module-goal.acceptance.md"), "# Module goal\n");
  writeJson(path.join(paths, "module-goal.evidence.json"), { contract, ledger });
}

test("citty command modules preserve agent-readable JSON payloads", async () => {
  const skill = await runSkillExportCommand(["--name=nori-evidence", "--json"]);
  assert.equal(skill.ok, true);
  assert.equal(skill.data.skill_name, "nori-evidence");

  const profiles = await runArchitectureProfilesCommand(["--root", ROOT, "--json"]);
  assert.equal(profiles.ok, true);
  assert.equal(profiles.data.side_effect, "none");
  assert.equal(profiles.data.profiles.some((profile) => profile.id === "typescript-agent-state-cli"), true);

  const doctor = await runDoctorCommand(["--root", ROOT, "--json"]);
  assert.equal(doctor.ok, true);
  assert.equal(doctor.data.name, "opennori");
  assert.equal(doctor.data.side_effect, "none");
});

test("list command module reports active goal gaps without CLI dispatch", async () => {
  const root = tempRoot();
  writeActiveGoal(root);

  const list = await runListCommand(["--root", root, "--json"]);
  assert.equal(list.ok, true);
  assert.equal(list.data.active_goals.length, 1);
  assert.equal(list.data.active_goals[0].goal_id, "module-goal");
  assert.equal(list.data.active_goals[0].current_gap.id, "ACCEPTANCE-BASIS");
});

test("check command module reports acceptance architecture and evidence health", async () => {
  const root = tempRoot();
  const contract = {
    schema_version: "opennori/contract-v1",
    protocol_version: "opennori/v1",
    goal_id: "module-goal",
    goal: "Check module health",
    criteria: [
      {
        id: "AC-1",
        user_story: "As a user, I can check the goal health.",
        measurement: "Open status.",
        threshold: "I can see health warnings."
      }
    ],
    acceptance_basis: { status: "approved" }
  };
  const ledger = buildEvidenceLedger(contract);

  const checked = await runCheckCommand(["--json"], {
    loadPair: () => ({ contract, ledger, root })
  });
  assert.equal(checked.ok, true);
  assert.equal(checked.data.goal_id, "module-goal");
  assert.equal(checked.data.acceptance_quality.status, "clear");
  assert.equal(checked.data.architecture_check.status, "needs-action");
  assert.equal(checked.data.architecture_check.decision, "missing");
  assert.equal(checked.data.evidence_health.status, "clear");
  assert.equal(checked.warnings.some((warning) => warning.type === "architecture"), true);
  assert.equal(checked.next_actions.some((action) => /architecture_check/.test(action)), true);
});

test("architecture build-vs-buy command module records reviewable decisions", async () => {
  const root = tempRoot();

  const decision = await runArchitectureBuildVsBuyCommand([
    "--root", root,
    "--id", "module-parser-choice",
    "--area", "cli",
    "--need", "Parse OpenNori subcommands",
    "--recommendation", "self-build",
    "--summary", "Keep a small parser only when framework migration is blocked.",
    "--current-project", "Current project has a legacy dispatcher.",
    "--standard-library", "node:util parseArgs does not provide nested commands.",
    "--official-sdk", "No official SDK applies.",
    "--json"
  ]);

  assert.equal(decision.ok, true);
  assert.equal(decision.data.decision.schema_version, "opennori/build-vs-buy-v1");
  assert.equal(decision.data.decision.id, "module-parser-choice");
  assert.equal(decision.data.decision.recommendation, "self-build");
  assert.equal(decision.data.decision.current_project, "Current project has a legacy dispatcher.");
  assert.equal(decision.data.decision.standard_library, "node:util parseArgs does not provide nested commands.");
  assert.equal(decision.data.decision.official_sdk, "No official SDK applies.");
  assert.equal(decision.data.decision_path, path.join(root, ".opennori", "architecture", "decisions", "module-parser-choice.json"));
  assert.equal(fs.existsSync(decision.data.decision_path), true);
  assert.equal(fs.existsSync(decision.data.markdown_path), true);
  assert.equal(decision.artifacts.some((artifact) => artifact.kind === "build_vs_buy_decision"), true);
  assert.equal(decision.warnings.some((warning) => warning.type === "build_vs_buy"), true);
  assert.match(fs.readFileSync(decision.data.markdown_path, "utf8"), /Build-vs-Buy Decision/);
});

test("architecture challenge command module records baseline challenges", async () => {
  const root = tempRoot();
  writeArchitectureBaseline(root, buildArchitectureBaseline(root, {
    goal: "Keep architecture reviewable",
    goalId: "module-goal",
    accepted: true
  }));

  const challenge = await runArchitectureChallengeCommand([
    "--root", root,
    "--id", "module-challenge",
    "--summary", "Current project already uses another CLI parser.",
    "--evidence", "package.json contains a parser dependency.",
    "--recommendation", "Ask the user whether to revise the baseline.",
    "--no-user",
    "--json"
  ]);

  assert.equal(challenge.ok, true);
  assert.equal(challenge.data.challenge.schema_version, "opennori/architecture-challenge-v1");
  assert.equal(challenge.data.challenge.id, "module-challenge");
  assert.equal(challenge.data.challenge.needs_user, false);
  assert.equal(challenge.data.challenge.baseline.goal_id, "module-goal");
  assert.equal(challenge.data.architecture.decision, "challenged");
  assert.equal(challenge.data.challenge_path, path.join(root, ".opennori", "architecture", "challenges", "module-challenge.json"));
  assert.equal(fs.existsSync(challenge.data.challenge_path), true);
  assert.equal(fs.existsSync(challenge.data.markdown_path), true);
  assert.equal(challenge.artifacts.some((artifact) => artifact.kind === "architecture_challenge"), true);
  assert.match(fs.readFileSync(challenge.data.markdown_path, "utf8"), /Do not silently replace/);
});

test("architecture profile command module installs and validates project profiles", async () => {
  const root = tempRoot();
  const sourcePath = path.join(root, "team-architecture.json");
  writeJson(sourcePath, {
    id: "module-team-cli",
    title: "Module Team CLI",
    summary: "Use the team command module shape.",
    principles: ["team-command-module"],
    checks: [
      {
        id: "TEAM-1",
        audience: "maintainer",
        statement: "Commands live in modules.",
        review: "Inspect src/cli/commands."
      }
    ],
    build_vs_buy_policy: {
      order: ["current-project-dependency", "mature-open-source-library", "small-local-implementation"],
      require_reason_when_self_building: true
    }
  });

  const added = await runArchitectureProfileCommand(["--root", root, "--from", sourcePath, "--json"]);
  assert.equal(added.ok, true);
  assert.equal(added.data.profile.id, "module-team-cli");
  assert.equal(added.data.profile_path, path.join(root, ".opennori", "architecture", "profiles", "module-team-cli.json"));
  assert.equal(fs.existsSync(added.data.profile_path), true);
  assert.equal(added.data.profiles[0].id, "module-team-cli");
  assert.equal(added.artifacts.some((artifact) => artifact.kind === "architecture_profile"), true);

  const invalidPath = path.join(root, "invalid-architecture.json");
  writeJson(invalidPath, { id: "invalid-profile" });
  const invalid = await runArchitectureProfileCommand(["--root", root, "--from", invalidPath, "--json"]);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.type, "invalid_architecture_profile");
  assert.equal(invalid.issues.some((issue) => issue.path === "summary"), true);
});

test("context export command module can write a review artifact", async () => {
  const root = tempRoot();
  writeActiveGoal(root);
  const outputPath = path.join(root, "context.json");

  const exported = await runContextExportCommand(["--root", root, "--output", outputPath, "--json"]);
  assert.equal(exported.ok, true);
  assert.equal(exported.data.goal_id, "module-goal");
  assert.equal(exported.data.output_path, outputPath);
  assert.equal(exported.artifacts[0].kind, "opennori_context_export");
  assert.equal(JSON.parse(fs.readFileSync(outputPath, "utf8")).goal_id, "module-goal");
});

test("profile show command module reads the active goal via injected loader", async () => {
  const contract = {
    goal_id: "module-goal",
    criteria: [],
    acceptance_basis: { status: "approved" }
  };
  const ledger = { status: "active", criteria: {}, capability_profile: { items: [], evidence: [] } };

  const profile = await runProfileShowCommand(["--json"], {
    loadPair: () => ({ contract, ledger })
  });
  assert.equal(profile.ok, true);
  assert.equal(profile.data.goal_id, "module-goal");
  assert.equal(profile.data.workflow_status, "active");
  assert.equal(profile.data.profile.items.length, 0);
});

test("profile add and evidence modules update compliance and workflow state", async () => {
  const root = tempRoot();
  const acceptancePath = path.join(root, ".opennori", "active", "module-goal.acceptance.md");
  const evidencePath = path.join(root, ".opennori", "active", "module-goal.evidence.json");
  const contract = {
    schema_version: "opennori/contract-v1",
    protocol_version: "opennori/v1",
    goal_id: "module-goal",
    goal: "Use a required Skill",
    criteria: [
      {
        id: "AC-1",
        user_story: "As a user, I can see the required behavior.",
        measurement: "Open the completed flow.",
        threshold: "I can see the expected result."
      }
    ],
    acceptance_basis: { status: "approved" }
  };
  const ledger = buildEvidenceLedger(contract);
  addEvidence(contract, ledger, "AC-1", { kind: "test-summary", summary: "AC-1 passes.", result: "passing" });
  fs.mkdirSync(path.dirname(acceptancePath), { recursive: true });
  fs.writeFileSync(acceptancePath, "# Module goal\n");
  writeJson(evidencePath, { contract, ledger });
  const data = {
    loadPair: () => ({ contract, ledger, acceptancePath, evidencePath, root }),
    savePair: (nextAcceptancePath, nextEvidencePath, nextContract, nextLedger) => writeJson(nextEvidencePath, { contract: nextContract, ledger: nextLedger }),
    refreshManifest: () => {}
  };

  const added = await runProfileAddCommand([
    "--type", "skill",
    "--name", "design-taste-frontend",
    "--strength", "must",
    "--purpose", "Generate a design read before implementation.",
    "--install-policy", "existing_only",
    "--json"
  ], data);
  assert.equal(added.ok, true);
  assert.equal(added.data.workflow_status, "blocked");
  assert.equal(added.data.current_gap.id, "PROFILE-skill-design-taste-frontend");

  const evidenced = await runProfileEvidenceCommand([
    "--item", "skill-design-taste-frontend",
    "--result", "satisfied",
    "--summary", "Agent used design-taste-frontend.",
    "--path", "/Users/jarl/.agents/skills/design-taste-frontend/SKILL.md",
    "--json"
  ], data);
  assert.equal(evidenced.ok, true);
  assert.equal(evidenced.data.workflow_status, "complete");
  assert.equal(evidenced.data.current_gap, null);
  assert.equal(JSON.parse(fs.readFileSync(evidencePath, "utf8")).ledger.capability_profile.items.length, 1);
});

test("next command module returns the current acceptance gap and actions", async () => {
  const contract = {
    goal_id: "module-goal",
    criteria: [
      {
        id: "AC-1",
        user_story: "As a user, I can see the current acceptance gap."
      }
    ],
    acceptance_basis: { status: "approved" }
  };
  const ledger = { status: "active", criteria: { "AC-1": { status: "unknown", evidence: [] } } };

  const next = await runNextCommand(["--json"], {
    loadPair: () => ({ contract, ledger })
  });
  assert.equal(next.ok, true);
  assert.equal(next.data.goal_id, "module-goal");
  assert.equal(next.data.current_gap.id, "AC-1");
  assert.equal(next.data.complete, false);
  assert.equal(next.data.next_recommendation.status, "work-on-current-gap");
  assert.equal(next.next_actions.some((action) => /AC-1/.test(action)), true);
});

test("resume command module includes completion, health, architecture, and next actions", async () => {
  const root = tempRoot();
  const acceptancePath = path.join(root, ".opennori", "active", "module-goal.acceptance.md");
  const evidencePath = path.join(root, ".opennori", "active", "module-goal.evidence.json");
  const contract = {
    goal_id: "module-goal",
    criteria: [],
    acceptance_basis: { status: "approved" }
  };
  const ledger = { status: "complete", criteria: {}, capability_profile: { items: [], evidence: [] } };

  const resume = await runResumeCommand(["--json"], {
    loadPair: () => ({ contract, ledger, acceptancePath, evidencePath, root })
  });
  assert.equal(resume.ok, true);
  assert.equal(resume.data.goal_id, "module-goal");
  assert.equal(resume.data.completion.complete, true);
  assert.equal(resume.data.evidence_health.status, "clear");
  assert.equal(resume.data.architecture.decision, "missing");
  assert.equal(resume.data.acceptance_path, acceptancePath);
  assert.equal(resume.next_actions.some((action) => /next human-facing project goal/.test(action)), true);
});

test("status command module includes criteria and completion state", async () => {
  const root = tempRoot();
  const contract = {
    goal_id: "module-goal",
    criteria: [
      {
        id: "AC-1",
        user_story: "As a user, I can review the current delivery status."
      }
    ],
    acceptance_basis: { status: "approved" }
  };
  const ledger = { status: "active", criteria: { "AC-1": { status: "unknown", evidence: [] } }, capability_profile: { items: [], evidence: [] } };

  const status = await runStatusCommand(["--json"], {
    loadPair: () => ({ contract, ledger, root })
  });
  assert.equal(status.ok, true);
  assert.equal(status.data.goal_id, "module-goal");
  assert.equal(status.data.workflow_status, "active");
  assert.equal(status.data.completion.complete, false);
  assert.equal(status.data.evidence_health.status, "clear");
  assert.equal(status.data.architecture.decision, "missing");
  assert.equal(status.data.criteria.length, 1);
  assert.equal(status.data.criteria[0].id, "AC-1");
  assert.equal(status.next_actions.some((action) => /AC-1/.test(action)), true);
});

test("report command module renders a report artifact", async () => {
  const root = tempRoot();
  const outputPath = path.join(root, "report.md");
  const contract = {
    goal_id: "module-goal",
    goal: "Ship module reporting",
    criteria: [],
    acceptance_basis: { status: "approved" }
  };
  const ledger = { status: "complete", criteria: {}, capability_profile: { items: [], evidence: [] } };

  const report = await runReportCommand(["--output", outputPath, "--json"], {
    loadPair: () => ({ contract, ledger, root })
  });
  assert.equal(report.ok, true);
  assert.equal(report.data.goal_id, "module-goal");
  assert.equal(report.data.report_path, outputPath);
  assert.equal(report.data.completion.complete, true);
  assert.equal(report.data.evidence_health.status, "clear");
  assert.equal(report.artifacts[0].kind, "acceptance_report");
  assert.match(fs.readFileSync(outputPath, "utf8"), /## Decision Summary/);
});

test("archive command module moves complete goals and preserves a report", async () => {
  const root = tempRoot();
  const acceptancePath = path.join(root, ".opennori", "active", "module-goal.acceptance.md");
  const evidencePath = path.join(root, ".opennori", "active", "module-goal.evidence.json");
  const contract = {
    schema_version: "opennori/contract-v1",
    protocol_version: "opennori/v1",
    goal_id: "module-goal",
    goal: "Archive module goal",
    criteria: [
      {
        id: "AC-1",
        user_story: "As a user, I can archive a complete goal.",
        measurement: "Run archive.",
        threshold: "I can see the archived artifacts."
      }
    ],
    acceptance_basis: { status: "approved" }
  };
  const ledger = buildEvidenceLedger(contract);
  addEvidence(contract, ledger, "AC-1", { kind: "test-summary", summary: "AC-1 passes.", result: "passing" });
  fs.mkdirSync(path.dirname(acceptancePath), { recursive: true });
  fs.writeFileSync(acceptancePath, "# Module goal\n");
  writeJson(evidencePath, { contract, ledger });

  const archived = await runArchiveCommand(["--root", root, "--json"], {
    loadPair: () => ({ contract, ledger, acceptancePath, evidencePath, root })
  });
  assert.equal(archived.ok, true);
  assert.equal(archived.data.archived_as, "completed");
  assert.equal(fs.existsSync(acceptancePath), false);
  assert.equal(fs.existsSync(evidencePath), false);
  assert.equal(fs.existsSync(archived.data.acceptance_path), true);
  assert.equal(fs.existsSync(archived.data.evidence_path), true);
  assert.equal(fs.existsSync(archived.data.report_path), true);
});

test("archive command module rejects active goals", async () => {
  const root = tempRoot();
  const acceptancePath = path.join(root, ".opennori", "active", "module-goal.acceptance.md");
  const evidencePath = path.join(root, ".opennori", "active", "module-goal.evidence.json");
  const contract = {
    schema_version: "opennori/contract-v1",
    protocol_version: "opennori/v1",
    goal_id: "module-goal",
    goal: "Do not archive active goal",
    criteria: [
      {
        id: "AC-1",
        user_story: "As a user, I can keep active work in active state.",
        measurement: "Open status.",
        threshold: "I can see the remaining gap."
      }
    ],
    acceptance_basis: { status: "approved" }
  };
  const ledger = buildEvidenceLedger(contract);
  fs.mkdirSync(path.dirname(acceptancePath), { recursive: true });
  fs.writeFileSync(acceptancePath, "# Module goal\n");
  writeJson(evidencePath, { contract, ledger });

  const archived = await runArchiveCommand(["--root", root, "--json"], {
    loadPair: () => ({ contract, ledger, acceptancePath, evidencePath, root })
  });
  assert.equal(archived.ok, false);
  assert.equal(archived.error.type, "not_archivable");
  assert.equal(fs.existsSync(acceptancePath), true);
  assert.equal(fs.existsSync(evidencePath), true);
});

test("evaluate command module recomputes and writes workflow state", async () => {
  const root = tempRoot();
  const acceptancePath = path.join(root, ".opennori", "active", "module-goal.acceptance.md");
  const evidencePath = path.join(root, ".opennori", "active", "module-goal.evidence.json");
  const contract = {
    schema_version: "opennori/contract-v1",
    goal_id: "module-goal",
    goal: "Ship module evaluation",
    criteria: [
      {
        id: "AC-1",
        user_story: "As a user, I can evaluate a completed acceptance criterion."
      }
    ],
    acceptance_basis: { status: "approved" }
  };
  const ledger = buildEvidenceLedger(contract);
  addEvidence(contract, ledger, "AC-1", { kind: "test-summary", summary: "AC-1 passes.", result: "passing" });
  fs.mkdirSync(path.dirname(acceptancePath), { recursive: true });
  fs.writeFileSync(acceptancePath, "# Module goal\n");
  writeJson(evidencePath, { contract, ledger });

  const evaluated = await runEvaluateCommand(["--json"], {
    loadPair: () => ({ contract, ledger, acceptancePath, evidencePath, root })
  });
  assert.equal(evaluated.ok, true);
  assert.equal(evaluated.data.goal_id, "module-goal");
  assert.equal(evaluated.data.workflow_status, "complete");
  assert.equal(evaluated.data.current_gap, null);
  assert.equal(JSON.parse(fs.readFileSync(evidencePath, "utf8")).ledger.status, "complete");
  assert.match(fs.readFileSync(acceptancePath, "utf8"), /\| AC-1 .* passing \|/);
});

test("changes command module groups acceptance and implementation files", async () => {
  const root = tempRoot();
  spawnSync("git", ["init"], { cwd: root, encoding: "utf8" });
  writeActiveGoal(root);
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "index.js"), "console.log('demo')\n");

  const changes = await runChangesCommand(["--root", root, "--json"]);
  assert.equal(changes.ok, true);
  assert.equal(changes.data.changed_files.available, true);
  assert.equal(changes.data.active_goals.length, 1);
  assert.equal(changes.data.changed_files.acceptance.some((item) => item.path === ".opennori/active/module-goal.acceptance.md"), true);
  assert.equal(changes.data.changed_files.implementation.some((item) => item.path === "src/index.js"), true);
});

test("approve command module marks acceptance basis approved and recomputes status", async () => {
  const root = tempRoot();
  const acceptancePath = path.join(root, ".opennori", "active", "module-goal.acceptance.md");
  const evidencePath = path.join(root, ".opennori", "active", "module-goal.evidence.json");
  const contract = {
    schema_version: "opennori/contract-v1",
    goal_id: "module-goal",
    goal: "Approve module acceptance",
    criteria: [
      {
        id: "AC-1",
        user_story: "As a user, I can approve acceptance criteria."
      }
    ],
    acceptance_basis: { status: "draft" }
  };
  const ledger = buildEvidenceLedger(contract);
  addEvidence(contract, ledger, "AC-1", { kind: "test-summary", summary: "AC-1 passes.", result: "passing" });
  fs.mkdirSync(path.dirname(acceptancePath), { recursive: true });
  fs.writeFileSync(acceptancePath, "# Module goal\n");
  writeJson(evidencePath, { contract, ledger });

  const approved = await runApproveCommand(["--summary", "User approved module criteria.", "--json"], {
    loadPair: () => ({ contract, ledger, acceptancePath, evidencePath, root })
  });
  assert.equal(approved.ok, true);
  assert.equal(approved.data.acceptance_basis.status, "approved");
  assert.equal(approved.data.acceptance_basis.summary, "User approved module criteria.");
  assert.equal(approved.data.workflow_status, "complete");
  assert.equal(approved.data.current_gap, null);
  assert.match(fs.readFileSync(acceptancePath, "utf8"), /Status: approved/);
});

test("criterion update command module clears stale evidence after a user revision", async () => {
  const root = tempRoot();
  const acceptancePath = path.join(root, ".opennori", "active", "module-goal.acceptance.md");
  const evidencePath = path.join(root, ".opennori", "active", "module-goal.evidence.json");
  const contract = {
    schema_version: "opennori/contract-v1",
    protocol_version: "opennori/v1",
    goal_id: "module-goal",
    goal: "Revise module acceptance",
    criteria: [
      {
        id: "AC-1",
        user_story: "As a user, I can inspect the old criterion.",
        measurement: "Open the old screen.",
        threshold: "I can see the old behavior."
      }
    ],
    acceptance_basis: { status: "approved" }
  };
  const ledger = buildEvidenceLedger(contract);
  addEvidence(contract, ledger, "AC-1", { kind: "test-summary", summary: "Old evidence passes.", result: "passing" });
  fs.mkdirSync(path.dirname(acceptancePath), { recursive: true });
  fs.writeFileSync(acceptancePath, "# Module goal\n");
  writeJson(evidencePath, { contract, ledger });

  const updated = await runCriterionUpdateCommand([
    "--criterion", "AC-1",
    "--user-story", "As a user, I can inspect the revised criterion.",
    "--measurement", "Open the revised screen.",
    "--threshold", "I can see the revised behavior.",
    "--summary", "User revised AC-1.",
    "--json"
  ], {
    loadPair: () => ({ contract, ledger, acceptancePath, evidencePath, root })
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.data.acceptance_basis.status, "approved");
  assert.equal(updated.data.criterion.user_story, "As a user, I can inspect the revised criterion.");
  assert.equal(updated.data.current_gap.id, "AC-1");
  const written = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  assert.equal(written.ledger.criteria["AC-1"].status, "unknown");
  assert.equal(written.ledger.criteria["AC-1"].evidence.length, 0);
});

test("evidence add command module records flexible reviewable sources", async () => {
  const root = tempRoot();
  const acceptancePath = path.join(root, ".opennori", "active", "module-goal.acceptance.md");
  const evidencePath = path.join(root, ".opennori", "active", "module-goal.evidence.json");
  const contract = {
    schema_version: "opennori/contract-v1",
    protocol_version: "opennori/v1",
    goal_id: "module-goal",
    goal: "Record reviewable evidence",
    criteria: [
      {
        id: "AC-1",
        user_story: "As a user, I can review evidence for the completed behavior.",
        measurement: "Open the evidence report.",
        threshold: "I can see reviewable evidence."
      }
    ],
    acceptance_basis: { status: "approved" }
  };
  const ledger = buildEvidenceLedger(contract);
  fs.mkdirSync(path.dirname(acceptancePath), { recursive: true });
  fs.writeFileSync(acceptancePath, "# Module goal\n");
  writeJson(evidencePath, { contract, ledger });

  const added = await runEvidenceAddCommand([
    "--criterion", "AC-1",
    "--kind", "agent-observation",
    "--basis", "tool-observation",
    "--summary", "The user-visible workflow can be reviewed.",
    "--source", "{\"type\":\"command\",\"label\":\"npm run check\",\"command\":\"npm run check\",\"outcome\":\"passed\"}",
    "--source", "screenshots/reviewable-flow.png",
    "--source-command", "npm run check",
    "--source-path", "src/cli.js",
    "--source-url", "https://example.com/review",
    "--reviewability", "User can rerun the command or open the artifact.",
    "--limitations", "Browser-specific visual review was not performed.",
    "--confidence", "verified",
    "--result", "passing",
    "--json"
  ], {
    loadPair: () => ({ contract, ledger, acceptancePath, evidencePath, root })
  });
  assert.equal(added.ok, true);
  assert.equal(added.data.criterion_status, "passing");
  assert.equal(added.data.latest_evidence.sources.length, 5);
  assert.equal(added.data.latest_evidence.sources[0].command, "npm run check");
  assert.equal(added.data.latest_evidence.sources[1].label, "screenshots/reviewable-flow.png");
  assert.equal(added.data.latest_evidence.sources[2].type, "command");
  assert.equal(added.data.latest_evidence.sources[3].type, "artifact");
  assert.equal(added.data.latest_evidence.sources[4].type, "url");
  assert.equal(JSON.parse(fs.readFileSync(evidencePath, "utf8")).ledger.criteria["AC-1"].status, "passing");
});
