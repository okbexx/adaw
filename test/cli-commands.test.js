import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { runNextCommand, runResumeCommand } from "../src/cli/commands/acceptance.js";
import { runArchitectureProfilesCommand } from "../src/cli/commands/architecture.js";
import { runContextExportCommand } from "../src/cli/commands/context.js";
import { runDoctorCommand, runListCommand } from "../src/cli/commands/health.js";
import { runProfileShowCommand } from "../src/cli/commands/profile.js";
import { runSkillExportCommand } from "../src/cli/commands/skill.js";
import { buildEvidenceLedger, writeJson } from "../src/core.js";

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
