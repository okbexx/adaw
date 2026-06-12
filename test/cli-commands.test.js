import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { runApproveCommand, runCriterionUpdateCommand, runEvaluateCommand, runNextCommand, runResumeCommand, runStatusCommand } from "../src/cli/commands/acceptance.js";
import { runArchitectureProfilesCommand } from "../src/cli/commands/architecture.js";
import { runContextExportCommand } from "../src/cli/commands/context.js";
import { runChangesCommand, runDoctorCommand, runListCommand } from "../src/cli/commands/health.js";
import { runProfileAddCommand, runProfileEvidenceCommand, runProfileShowCommand } from "../src/cli/commands/profile.js";
import { runReportCommand } from "../src/cli/commands/reporting.js";
import { runSkillExportCommand } from "../src/cli/commands/skill.js";
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
