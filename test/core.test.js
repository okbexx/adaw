import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const CLI = path.join(ROOT, "bin", "adaw.js");

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8"
  });
  if (result.status !== (options.status ?? 0)) {
    throw new Error(result.stderr || result.stdout);
  }
  return JSON.parse(result.stdout);
}

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "adaw-test-"));
}

test("init creates markdown contract and evidence ledger", () => {
  const root = tempRoot();
  const payload = run(["init", "examples/adaw-self.json", "--root", root, "--json"]);

  assert.equal(payload.ok, true);
  assert.equal(payload.data.goal_id, "adaw-self");
  assert.equal(payload.data.current_gap.id, "AC-P-1");
  assert.equal(fs.existsSync(payload.data.acceptance_path), true);
  assert.equal(fs.existsSync(payload.data.evidence_path), true);

  const acceptance = fs.readFileSync(payload.data.acceptance_path, "utf8");
  assert.match(acceptance, /User Acceptance Criteria/);
  assert.match(acceptance, /\| ID \| Layer \|/);
  assert.match(acceptance, /Codex 对话/);
  assert.doesNotMatch(acceptance, /Step 1/);
});

test("next returns the current acceptance gap, not a process step", () => {
  const root = tempRoot();
  const init = run(["init", "examples/adaw-self.json", "--root", root, "--json"]);
  const payload = run([
    "next",
    "--acceptance", init.data.acceptance_path,
    "--evidence", init.data.evidence_path,
    "--json"
  ]);

  assert.equal(payload.ok, true);
  assert.equal(payload.data.current_gap.id, "AC-P-1");
  assert.match(payload.data.current_gap.reason, /no user-understandable evidence/);
});

test("resume and status recover active goal from repository files", () => {
  const root = tempRoot();
  const init = run(["init", "examples/adaw-self.json", "--root", root, "--json"]);

  const resume = run(["resume", "--root", root, "--json"]);
  assert.equal(resume.ok, true);
  assert.equal(resume.data.goal_id, "adaw-self");
  assert.equal(resume.data.current_gap.id, "AC-P-1");
  assert.equal(resume.data.completion.complete, false);

  run([
    "evidence", "add",
    "--root", root,
    "--criterion", "AC-P-1",
    "--kind", "test-summary",
    "--summary", "Draft acceptance criteria are visible.",
    "--result", "passing",
    "--json"
  ]);

  const status = run(["status", "--root", root, "--json"]);
  assert.equal(status.data.current_gap.id, "AC-P-2");
  assert.equal(status.data.intervention.required, false);

  const acceptance = fs.readFileSync(init.data.acceptance_path, "utf8");
  assert.match(acceptance, /AC-P-1 .* passing/);
});

test("draft requires user approval before completion evidence can finish the workflow", () => {
  const root = tempRoot();
  const draft = run(["draft", "--goal", "Ship an ADAW-backed task", "--root", root, "--json"]);
  assert.equal(draft.data.acceptance_basis.status, "draft");
  assert.equal(draft.data.current_gap.id, "ACCEPTANCE-BASIS");

  const acceptance = fs.readFileSync(draft.data.acceptance_path, "utf8");
  assert.match(acceptance, /## Acceptance Basis/);
  assert.match(acceptance, /Status: draft/);

  const ledger = JSON.parse(fs.readFileSync(draft.data.evidence_path, "utf8"));
  for (const criterion of Object.keys(ledger.ledger.criteria)) {
    run([
      "evidence", "add",
      "--acceptance", draft.data.acceptance_path,
      "--evidence", draft.data.evidence_path,
      "--criterion", criterion,
      "--kind", "test-summary",
      "--summary", `${criterion} has evidence.`,
      "--result", "passing",
      "--json"
    ]);
  }

  const beforeApprove = run([
    "evaluate",
    "--acceptance", draft.data.acceptance_path,
    "--evidence", draft.data.evidence_path,
    "--json"
  ]);
  assert.equal(beforeApprove.data.workflow_status, "active");
  assert.equal(beforeApprove.data.current_gap.id, "ACCEPTANCE-BASIS");

  const approved = run(["approve", "--root", root, "--summary", "User approved criteria.", "--json"]);
  assert.equal(approved.data.acceptance_basis.status, "approved");
  assert.equal(approved.data.workflow_status, "complete");
});

test("brainstorm creates selectable acceptance directions, not a process plan", () => {
  const root = tempRoot();
  const brainstorm = run([
    "brainstorm",
    "--idea", "我想让 ADAW 支持头脑风暴",
    "--root", root,
    "--json"
  ]);

  assert.equal(brainstorm.data.status, "draft-source");
  assert.equal(brainstorm.data.is_acceptance_contract, false);
  assert.equal(brainstorm.data.candidates.length, 3);
  assert.equal(fs.existsSync(brainstorm.data.brainstorm_path), true);
  assert.equal(fs.existsSync(brainstorm.data.markdown_path), true);

  const text = fs.readFileSync(brainstorm.data.markdown_path, "utf8");
  assert.match(text, /Acceptance directions/);
  assert.match(text, /not an acceptance contract/);
  assert.doesNotMatch(text, /Implementation plan/);
  assert.doesNotMatch(text, /Step 1/);

  const draft = run([
    "draft",
    "--from-brainstorm", brainstorm.data.brainstorm_id,
    "--candidate", "A",
    "--root", root,
    "--json"
  ]);
  assert.equal(draft.data.acceptance_basis.status, "draft");
  assert.equal(draft.data.current_gap.id, "ACCEPTANCE-BASIS");
  assert.equal(draft.data.criteria.every((criterion) => criterion.user_story.startsWith("作为用户")), true);
});

test("capability profile records required skills and blocks completion until satisfied", () => {
  const root = tempRoot();
  const init = run(["draft", "--goal", "Build a frontend page", "--root", root, "--json"]);
  const ledger = JSON.parse(fs.readFileSync(init.data.evidence_path, "utf8"));

  run(["approve", "--root", root, "--summary", "User approved frontend acceptance criteria.", "--json"]);
  for (const criterion of Object.keys(ledger.ledger.criteria)) {
    run([
      "evidence", "add",
      "--root", root,
      "--criterion", criterion,
      "--kind", "test-summary",
      "--summary", `${criterion} is satisfied.`,
      "--result", "passing",
      "--json"
    ]);
  }

  const must = run([
    "profile", "add",
    "--root", root,
    "--type", "skill",
    "--name", "design-taste-frontend",
    "--strength", "must",
    "--purpose", "Generate design read and global theme tokens before implementation.",
    "--scope", "landing pages, portfolios, and redesigns",
    "--install-policy", "existing_only",
    "--json"
  ]);
  assert.equal(must.data.workflow_status, "blocked");
  assert.equal(must.data.current_gap.id, "PROFILE-skill-design-taste-frontend");

  const prefer = run([
    "profile", "add",
    "--root", root,
    "--type", "stack",
    "--name", "radix-ui",
    "--strength", "prefer",
    "--purpose", "Use accessible primitives for custom components.",
    "--install-policy", "ask_before_install",
    "--json"
  ]);
  assert.equal(prefer.data.compliance.statuses.some((item) => item.name === "radix-ui" && item.strength === "prefer"), true);

  const afterEvidence = run([
    "profile", "evidence",
    "--root", root,
    "--item", "skill-design-taste-frontend",
    "--result", "satisfied",
    "--summary", "Agent used design-taste-frontend for the design read and theme token pass.",
    "--path", "/Users/jarl/.agents/skills/design-taste-frontend/SKILL.md",
    "--json"
  ]);
  assert.equal(afterEvidence.data.workflow_status, "complete");

  const report = run(["report", "--root", root, "--json"]);
  const text = fs.readFileSync(report.data.report_path, "utf8");
  assert.match(text, /Capability Profile/);
  assert.match(text, /design-taste-frontend/);
  assert.match(text, /radix-ui/);
});

test("evidence can drive the workflow to complete and render a human report", () => {
  const root = tempRoot();
  const init = run(["init", "examples/adaw-self.json", "--root", root, "--json"]);
  const ledger = JSON.parse(fs.readFileSync(init.data.evidence_path, "utf8"));

  for (const criterion of Object.keys(ledger.ledger.criteria)) {
    run([
      "evidence", "add",
      "--acceptance", init.data.acceptance_path,
      "--evidence", init.data.evidence_path,
      "--criterion", criterion,
      "--kind", "test-summary",
      "--summary", `${criterion} has user-understandable evidence.`,
      "--result", "passing",
      "--json"
    ]);
  }

  const evaluated = run([
    "evaluate",
    "--acceptance", init.data.acceptance_path,
    "--evidence", init.data.evidence_path,
    "--json"
  ]);
  assert.equal(evaluated.data.workflow_status, "complete");

  const report = run([
    "report",
    "--acceptance", init.data.acceptance_path,
    "--evidence", init.data.evidence_path,
    "--root", root,
    "--json"
  ]);
  const text = fs.readFileSync(report.data.report_path, "utf8");
  assert.match(text, /Current status: complete/);
  assert.match(text, /AC-Z-5/);
  assert.match(text, /None\. All required acceptance criteria/);
  assert.doesNotMatch(text, /Implementation plan/);
});

test("blocked criteria produce a concrete intervention answer", () => {
  const root = tempRoot();
  run(["init", "examples/adaw-self.json", "--root", root, "--json"]);

  const blocked = run([
    "evidence", "add",
    "--root", root,
    "--criterion", "AC-O-5",
    "--kind", "human-confirmation",
    "--summary", "Choose whether ADAW should pause or continue without external credentials.",
    "--result", "blocked",
    "--json"
  ]);
  assert.equal(blocked.data.workflow_status, "blocked");

  const status = run(["status", "--root", root, "--json"]);
  assert.equal(status.data.intervention.required, true);
  assert.equal(status.data.intervention.criterion, "AC-O-5");
  assert.match(status.data.intervention.action, /Choose whether ADAW should pause/);
});

test("high-risk criteria require strong evidence before passing", () => {
  const root = tempRoot();
  const init = run(["init", "examples/adaw-self.json", "--root", root, "--json"]);

  const weak = run([
    "evidence", "add",
    "--acceptance", init.data.acceptance_path,
    "--evidence", init.data.evidence_path,
    "--criterion", "AC-P-4",
    "--kind", "agent-summary",
    "--summary", "Agent says recovery works.",
    "--result", "passing",
    "--json"
  ]);

  assert.equal(weak.data.criterion_status, "failing");
  assert.equal(weak.data.confidence, "strong-evidence-required");
  assert.equal(weak.data.gate, "downgraded_high_risk_requires_strong_evidence");

  const strong = run([
    "evidence", "add",
    "--acceptance", init.data.acceptance_path,
    "--evidence", init.data.evidence_path,
    "--criterion", "AC-P-4",
    "--kind", "review-result",
    "--summary", "Reviewer verified recovery from repository files.",
    "--result", "passing",
    "--json"
  ]);

  assert.equal(strong.data.criterion_status, "passing");
  assert.equal(strong.data.confidence, "verified");
  assert.equal(strong.data.gate, "accepted");
});

test("protocol v1 example contains concrete user tool operations", () => {
  const brief = JSON.parse(fs.readFileSync(path.join(ROOT, "examples", "adaw-self.json"), "utf8"));
  assert.equal(brief.criteria.length, 21);
  assert.deepEqual(new Set(brief.criteria.map((criterion) => criterion.layer)), new Set(["protocol", "operator", "productization"]));
  assert.equal(brief.criteria.filter((criterion) => criterion.id.startsWith("AC-P-")).length, 5);
  assert.equal(brief.criteria.filter((criterion) => criterion.id.startsWith("AC-O-")).length, 8);
  assert.equal(brief.criteria.filter((criterion) => criterion.id.startsWith("AC-Z-")).length, 8);

  const expectedTools = [
    "Codex 对话",
    "编辑器或文件浏览器",
    "新的 Codex 会话",
    "Capability Profile",
    ".adaw",
    "ADAW 报告",
    "Git 或 PR diff",
    "adaw install",
    "adaw doctor",
    "adaw list"
  ];

  const joined = JSON.stringify(brief, null, 2);
  for (const tool of expectedTools) {
    assert.match(joined, new RegExp(tool));
  }
});

test("skill export gives agents the full ADAW command loop", () => {
  const payload = run(["skill", "export", "--json"]);
  assert.match(payload.data.skill_md, /adaw brainstorm/);
  assert.match(payload.data.skill_md, /candidate acceptance directions/);
  assert.match(payload.data.skill_md, /adaw draft/);
  assert.match(payload.data.skill_md, /adaw approve/);
  assert.match(payload.data.skill_md, /adaw criterion update/);
  assert.match(payload.data.skill_md, /adaw resume/);
  assert.match(payload.data.skill_md, /adaw next/);
  assert.match(payload.data.skill_md, /adaw evidence add/);
  assert.match(payload.data.skill_md, /adaw evaluate/);
  assert.match(payload.data.skill_md, /adaw status/);
  assert.match(payload.data.skill_md, /adaw report/);
  assert.match(payload.data.skill_md, /Capability Profile/);
  assert.match(payload.data.skill_md, /adaw profile add/);
  assert.match(payload.data.skill_md, /adaw profile evidence/);
  assert.match(payload.data.skill_md, /adaw install --root <repo> --dry-run --json/);
  assert.match(payload.data.skill_md, /adaw doctor --root <repo> --json/);
  assert.match(payload.data.skill_md, /Do not treat brainstorm output as an acceptance contract/);
  assert.doesNotMatch(payload.data.skill_md, /process steps/);
});

test("install creates project assets and skips existing user content by default", () => {
  const root = tempRoot();
  const protocolPath = path.join(root, ".adaw", "protocol.md");
  fs.mkdirSync(path.dirname(protocolPath), { recursive: true });
  fs.writeFileSync(protocolPath, "custom protocol\n");

  const dryRun = run(["install", "--root", root, "--skill", "--dry-run", "--json"]);
  assert.equal(dryRun.data.dry_run, true);
  assert.equal(dryRun.data.actions.find((action) => action.path === ".adaw/manifest.json").action, "create");
  assert.equal(fs.existsSync(path.join(root, ".adaw", "manifest.json")), false);

  const payload = run(["install", "--root", root, "--skill", "--json"]);
  assert.equal(payload.data.actions.find((action) => action.path === ".adaw/protocol.md").action, "skip");
  assert.equal(payload.data.actions.find((action) => action.path === ".adaw/manifest.json").action, "create");
  assert.equal(fs.readFileSync(protocolPath, "utf8"), "custom protocol\n");
  assert.equal(fs.existsSync(path.join(root, ".agents", "skills", "adaw", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(root, ".adaw", "active")), true);
  assert.equal(fs.existsSync(path.join(root, ".adaw", "brainstorms")), true);
  assert.equal(fs.existsSync(path.join(root, ".adaw", "manifest.json")), true);
  assert.equal(fs.existsSync(path.join(root, "process")), false);

  const manifest = JSON.parse(fs.readFileSync(path.join(root, ".adaw", "manifest.json"), "utf8"));
  assert.equal(manifest.schema_version, "adaw/manifest-v1");
  assert.equal(manifest.adaw_version, "0.1.0");
  assert.equal(manifest.skill.installed, true);
  assert.equal(manifest.skill.in_sync, true);
  assert.equal(manifest.managed_files.some((entry) => entry.path === ".adaw/protocol.md" && entry.exists), true);
  assert.equal(manifest.capabilities.includes("doctor"), true);
});

test("doctor reports ready, needs-action, and broken project health", () => {
  const readyRoot = tempRoot();
  run(["install", "--root", readyRoot, "--skill", "--json"]);
  const ready = run(["doctor", "--root", readyRoot, "--json"]);
  assert.equal(ready.data.status, "ready");
  assert.equal(ready.data.checks.every((check) => check.ok), true);
  assert.equal(ready.data.skill.in_sync, true);

  const missingManifestRoot = tempRoot();
  run(["install", "--root", missingManifestRoot, "--json"]);
  fs.unlinkSync(path.join(missingManifestRoot, ".adaw", "manifest.json"));
  const needsAction = run(["doctor", "--root", missingManifestRoot, "--json"]);
  assert.equal(needsAction.data.status, "needs-action");
  assert.equal(needsAction.data.checks.find((check) => check.name === "manifest_file").ok, false);
  assert.match(needsAction.data.checks.find((check) => check.name === "manifest_file").recovery, /adaw install/);

  const staleManifestRoot = tempRoot();
  run(["install", "--root", staleManifestRoot, "--json"]);
  const manifestPath = path.join(staleManifestRoot, ".adaw", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.adaw_version = "0.0.0";
  manifest.capabilities = ["acceptance-contract"];
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const stale = run(["doctor", "--root", staleManifestRoot, "--json"]);
  assert.equal(stale.data.status, "needs-action");
  assert.equal(stale.data.checks.find((check) => check.name === "manifest_cli_version").ok, false);
  assert.equal(stale.data.checks.find((check) => check.name === "manifest_capabilities").ok, false);

  const brokenRoot = tempRoot();
  run(["install", "--root", brokenRoot, "--json"]);
  fs.writeFileSync(path.join(brokenRoot, ".adaw", "active", "broken.evidence.json"), "{ bad json");
  const broken = run(["doctor", "--root", brokenRoot, "--json"]);
  assert.equal(broken.data.status, "broken");
  assert.equal(broken.data.checks.find((check) => check.name === "active_goals_recoverable").ok, false);
  assert.equal(broken.data.active_goal_issues.length, 1);
  assert.match(broken.data.checks.find((check) => check.name === "active_goals_recoverable").recovery, /Fix the reported active goal pair/);
});

test("changes groups acceptance artifacts separately from implementation files", () => {
  const root = tempRoot();
  spawnSync("git", ["init"], { cwd: root, encoding: "utf8" });
  fs.mkdirSync(path.join(root, ".adaw", "active"), { recursive: true });
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, ".adaw", "active", "demo.acceptance.md"), "acceptance\n");
  fs.writeFileSync(path.join(root, "src", "index.js"), "console.log('demo')\n");

  const payload = run(["changes", "--root", root, "--json"]);
  assert.equal(payload.data.changed_files.available, true);
  assert.equal(payload.data.changed_files.acceptance.some((item) => item.path === ".adaw/active/demo.acceptance.md"), true);
  assert.equal(payload.data.changed_files.implementation.some((item) => item.path === "src/index.js"), true);
});

test("list shows multiple active goals and resume requires explicit selection", () => {
  const root = tempRoot();
  const firstBrief = path.join(root, "first.json");
  const secondBrief = path.join(root, "second.json");
  const makeBrief = (goalId, goal) => ({
    goal_id: goalId,
    goal,
    criteria: [
      {
        id: "AC-P-1",
        user_story: `作为用户，我能查看 ${goalId} 的验收状态。`,
        measurement: "运行 adaw list 或 adaw resume。",
        threshold: "输出包含目标状态和当前缺口。"
      }
    ]
  });
  fs.writeFileSync(firstBrief, JSON.stringify(makeBrief("first-goal", "First goal")));
  fs.writeFileSync(secondBrief, JSON.stringify(makeBrief("second-goal", "Second goal")));

  run(["init", firstBrief, "--root", root, "--json"]);
  run(["init", secondBrief, "--root", root, "--json"]);

  const list = run(["list", "--root", root, "--json"]);
  assert.deepEqual(list.data.active_goals.map((goal) => goal.goal_id), ["first-goal", "second-goal"]);

  const ambiguous = spawnSync(process.execPath, [CLI, "resume", "--root", root, "--json"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  assert.equal(ambiguous.status, 1);
  assert.match(ambiguous.stderr, /Multiple active ADAW goals found/);

  const selected = run(["resume", "--root", root, "--goal", "second-goal", "--json"]);
  assert.equal(selected.data.goal_id, "second-goal");
});

test("archive moves complete goals out of active and preserves report", () => {
  const root = tempRoot();
  const init = run(["init", "examples/adaw-self.json", "--root", root, "--json"]);
  const ledger = JSON.parse(fs.readFileSync(init.data.evidence_path, "utf8"));

  for (const criterion of Object.keys(ledger.ledger.criteria)) {
    run([
      "evidence", "add",
      "--acceptance", init.data.acceptance_path,
      "--evidence", init.data.evidence_path,
      "--criterion", criterion,
      "--kind", "test-summary",
      "--summary", `${criterion} has user-understandable evidence.`,
      "--result", "passing",
      "--json"
    ]);
  }

  const archived = run(["archive", "--root", root, "--goal", "adaw-self", "--json"]);
  assert.equal(archived.data.archived_as, "completed");
  assert.equal(fs.existsSync(init.data.acceptance_path), false);
  assert.equal(fs.existsSync(init.data.evidence_path), false);
  assert.equal(fs.existsSync(archived.data.acceptance_path), true);
  assert.equal(fs.existsSync(archived.data.evidence_path), true);
  assert.equal(fs.existsSync(archived.data.report_path), true);

  const list = run(["list", "--root", root, "--json"]);
  assert.equal(list.data.active_goals.length, 0);
});

test("archive can preserve blocked goals outside active work", () => {
  const root = tempRoot();
  const init = run(["init", "examples/adaw-self.json", "--root", root, "--json"]);

  run([
    "evidence", "add",
    "--root", root,
    "--criterion", "AC-O-5",
    "--kind", "human-confirmation",
    "--summary", "User must choose whether to pause or continue.",
    "--result", "blocked",
    "--json"
  ]);

  const archived = run(["archive", "--root", root, "--goal", "adaw-self", "--json"]);
  assert.equal(archived.data.archived_as, "blocked");
  assert.equal(fs.existsSync(init.data.acceptance_path), false);
  assert.equal(fs.existsSync(path.join(root, ".adaw", "blocked", "adaw-self.acceptance.md")), true);

  const report = fs.readFileSync(archived.data.report_path, "utf8");
  assert.match(report, /Current status: blocked/);
  assert.match(report, /User must choose whether to pause or continue/);
});

test("criterion update preserves the revised acceptance basis and clears stale evidence", () => {
  const root = tempRoot();
  const init = run(["init", "examples/adaw-self.json", "--root", root, "--json"]);

  run([
    "evidence", "add",
    "--root", root,
    "--criterion", "AC-P-1",
    "--kind", "test-summary",
    "--summary", "Old criterion had evidence.",
    "--result", "passing",
    "--json"
  ]);

  const updated = run([
    "criterion", "update",
    "--root", root,
    "--criterion", "AC-P-1",
    "--user-story", "作为用户，我打开 active acceptance contract 后，能在 30 秒内判断当前缺口。",
    "--measurement", "打开 active acceptance contract 并阅读当前状态。",
    "--threshold", "30 秒内能判断当前缺口。",
    "--summary", "User tightened AC-P-1 threshold.",
    "--json"
  ]);

  assert.equal(updated.data.acceptance_basis.status, "approved");
  assert.equal(updated.data.current_gap.id, "AC-P-1");
  assert.equal(updated.data.current_gap.user_story, "作为用户，我打开 active acceptance contract 后，能在 30 秒内判断当前缺口。");

  const payload = JSON.parse(fs.readFileSync(init.data.evidence_path, "utf8"));
  assert.equal(payload.ledger.criteria["AC-P-1"].status, "unknown");
  assert.equal(payload.ledger.criteria["AC-P-1"].evidence.length, 0);
});

test("check rejects implementation details inside user acceptance criteria", () => {
  const root = tempRoot();
  const badBrief = path.join(root, "bad.json");
  fs.writeFileSync(badBrief, JSON.stringify({
    goal_id: "bad",
    goal: "Bad example",
    criteria: [
      {
        id: "AC-1",
        user_story: "作为用户，我能看到 evidence.json 文件。",
        measurement: "检查文件",
        threshold: "文件存在"
      }
    ]
  }));

  const result = spawnSync(process.execPath, [CLI, "init", badBrief, "--root", root, "--json"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.issues[0].message, "Implementation detail appears in user acceptance criterion");
});
