import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const CLI = path.join(ROOT, "bin", "opennori.js");
const PACKAGE_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [options.cli || CLI, ...args], {
    cwd: options.cwd || ROOT,
    encoding: "utf8"
  });
  if (result.status !== (options.status ?? 0)) {
    throw new Error(result.stderr || result.stdout);
  }
  return JSON.parse(result.stdout);
}

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "nori-test-"));
}

test("command help is side-effect free", () => {
  const root = tempRoot();
  const payload = run(["install", "--help", "--root", root]);

  assert.equal(payload.ok, true);
  assert.equal(payload.data.side_effect, "none");
  assert.match(payload.data.usage, /opennori install/);
  assert.equal(fs.existsSync(path.join(root, ".opennori")), false);
});

test("opennori quickstart previews bootstrap without requiring install flags", () => {
  const root = tempRoot();
  const preview = run([], { cwd: root });

  assert.equal(preview.ok, true);
  assert.equal(preview.data.status, "needs_confirm");
  assert.equal(preview.data.install_plan.schema_version, "opennori/install-plan-v1");
  assert.equal(preview.data.install_plan.dry_run, true);
  assert.equal(preview.data.install_plan.requested_skill, true);
  assert.equal(preview.data.install_plan.summary.would_write > 0, true);
  assert.equal(preview.data.install_plan.summary.will_write, 0);
  assert.equal(fs.existsSync(path.join(root, ".opennori")), false);

  const confirmed = run(["bootstrap", "--root", root, "--confirm", "--json"]);
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.data.status, "installed");
  assert.equal(confirmed.data.install_plan.dry_run, false);
  assert.equal(confirmed.data.install_plan.summary.will_write > 0, true);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "manifest.json")), true);
  assert.equal(fs.existsSync(path.join(root, ".agents", "skills", "nori", "SKILL.md")), true);

  const ready = run([], { cwd: root });
  assert.equal(ready.data.status, "ready");
  assert.equal(ready.data.side_effect, "none");
  assert.equal(ready.data.doctor.status, "ready");
});

test("init creates markdown contract and evidence record", () => {
  const root = tempRoot();
  const payload = run(["init", "examples/opennori-self.json", "--root", root, "--json"]);

  assert.equal(payload.ok, true);
  assert.equal(payload.data.goal_id, "opennori-self");
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
  const init = run(["init", "examples/opennori-self.json", "--root", root, "--json"]);
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
  const init = run(["init", "examples/opennori-self.json", "--root", root, "--json"]);

  const resume = run(["resume", "--root", root, "--json"]);
  assert.equal(resume.ok, true);
  assert.equal(resume.data.goal_id, "opennori-self");
  assert.equal(resume.data.current_gap.id, "AC-P-1");
  assert.equal(resume.data.completion.complete, false);
  assert.equal(resume.data.next_recommendation.status, "work-on-current-gap");
  assert.equal(resume.data.next_recommendation.focus, "AC-P-1");
  assert.equal(resume.next_actions.some((action) => /AC-P-1/.test(action)), true);

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
  const draft = run(["draft", "--goal", "Ship an OpenNori-backed task", "--root", root, "--json"]);
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
    "--idea", "我想让 OpenNori 支持头脑风暴",
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
  assert.match(text, /not a Nori Contract/);
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

test("Nori Profile records required skills and blocks completion until satisfied", () => {
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
  assert.match(text, /Nori Profile/);
  assert.match(text, /design-taste-frontend/);
  assert.match(text, /radix-ui/);
});

test("evidence can drive the workflow to complete and render a human report", () => {
  const root = tempRoot();
  const init = run(["init", "examples/opennori-self.json", "--root", root, "--json"]);
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
  assert.match(text, /## Decision Summary/);
  assert.ok(text.indexOf("## Decision Summary") < text.indexOf("## Acceptance Status"));
  assert.match(text, /Completion: Complete: all required acceptance criteria have passing or waived evidence\./);
  assert.match(text, /Current gap: None\. All required acceptance criteria/);
  assert.match(text, /User intervention: No user intervention is currently required\./);
  assert.match(text, /Recommended next action: This OpenNori goal is complete/);
  assert.match(text, /Current status: complete/);
  assert.match(text, /AC-Z-5/);
  assert.match(text, /None\. All required acceptance criteria/);
  assert.doesNotMatch(text, /Implementation plan/);

  const resume = run([
    "resume",
    "--acceptance", init.data.acceptance_path,
    "--evidence", init.data.evidence_path,
    "--json"
  ]);
  assert.equal(resume.data.next_recommendation.status, "ready-for-next-loop");
  assert.equal(resume.next_actions.some((action) => /next human-facing project goal/.test(action)), true);
});

test("blocked criteria produce a concrete intervention answer", () => {
  const root = tempRoot();
  run(["init", "examples/opennori-self.json", "--root", root, "--json"]);

  const blocked = run([
    "evidence", "add",
    "--root", root,
    "--criterion", "AC-O-5",
    "--kind", "human-confirmation",
    "--summary", "Choose whether OpenNori should pause or continue without external credentials.",
    "--result", "blocked",
    "--json"
  ]);
  assert.equal(blocked.data.workflow_status, "blocked");

  const status = run(["status", "--root", root, "--json"]);
  assert.equal(status.data.intervention.required, true);
  assert.equal(status.data.intervention.criterion, "AC-O-5");
  assert.match(status.data.intervention.action, /Choose whether OpenNori should pause/);
});

test("high-risk criteria require strong evidence before passing", () => {
  const root = tempRoot();
  const init = run(["init", "examples/opennori-self.json", "--root", root, "--json"]);

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

test("evidence records flexible reviewable sources without fixed adapters", () => {
  const root = tempRoot();
  run(["draft", "--goal", "Ship a reviewable OpenNori task", "--root", root, "--json"]);
  run(["approve", "--root", root, "--summary", "User approved criteria.", "--json"]);

  const added = run([
    "evidence", "add",
    "--root", root,
    "--criterion", "AC-1",
    "--kind", "agent-observation",
    "--basis", "tool-observation",
    "--summary", "The user-visible workflow can be reviewed from a command and an artifact.",
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
  ]);

  assert.equal(added.data.criterion_status, "passing");
  assert.equal(added.data.latest_evidence.basis, "tool-observation");
  assert.equal(added.data.latest_evidence.sources.length, 5);
  assert.equal(added.data.latest_evidence.reviewability, "User can rerun the command or open the artifact.");
  assert.equal(added.data.latest_evidence.limitations, "Browser-specific visual review was not performed.");

  const status = run(["status", "--root", root, "--json"]);
  const criterion = status.data.criteria.find((row) => row.id === "AC-1");
  assert.equal(criterion.latest_evidence.sources[0].command, "npm run check");
  assert.equal(criterion.latest_evidence.sources[1].label, "screenshots/reviewable-flow.png");
  assert.equal(criterion.latest_evidence.sources[2].type, "command");
  assert.equal(criterion.latest_evidence.sources[2].command, "npm run check");
  assert.equal(criterion.latest_evidence.sources[3].type, "artifact");
  assert.equal(criterion.latest_evidence.sources[3].path, "src/cli.js");
  assert.equal(criterion.latest_evidence.sources[4].type, "url");
  assert.equal(criterion.latest_evidence.sources[4].url, "https://example.com/review");

  const report = run(["report", "--root", root, "--json"]);
  const text = fs.readFileSync(report.data.report_path, "utf8");
  assert.match(text, /Basis/);
  assert.match(text, /Sources/);
  assert.match(text, /Reviewability/);
  assert.match(text, /Limitations/);
  assert.match(text, /command=npm run check/);
  assert.match(text, /screenshots\/reviewable-flow\.png/);
  assert.match(text, /Browser-specific visual review was not performed/);
});

test("protocol v1 example contains concrete user tool operations", () => {
  const brief = JSON.parse(fs.readFileSync(path.join(ROOT, "examples", "opennori-self.json"), "utf8"));
  assert.equal(brief.criteria.length, 38);
  assert.deepEqual(new Set(brief.criteria.map((criterion) => criterion.layer)), new Set(["protocol", "operator", "productization"]));
  assert.equal(brief.criteria.filter((criterion) => criterion.id.startsWith("AC-P-")).length, 13);
  assert.equal(brief.criteria.filter((criterion) => criterion.id.startsWith("AC-O-")).length, 8);
  assert.equal(brief.criteria.filter((criterion) => criterion.id.startsWith("AC-Z-")).length, 17);

  const expectedTools = [
    "Codex 对话",
    "编辑器或文件浏览器",
    "新的 Codex 会话",
    "Nori Profile",
    ".opennori",
    "OpenNori 报告",
    "Git 或 PR diff",
    "opennori install",
    "opennori uninstall",
    "opennori doctor",
    "opennori list",
    "Skill Pack",
    "证据来源",
    "复查"
  ];

  const joined = JSON.stringify(brief, null, 2);
  for (const tool of expectedTools) {
    assert.match(joined, new RegExp(tool));
  }
});

test("skill export gives agents the full OpenNori command loop", () => {
  const payload = run(["skill", "export", "--json"]);
  assert.equal(payload.data.skill_name, "nori");
  assert.match(payload.data.skill_md, /nori-acceptance/);
  assert.match(payload.data.skill_md, /nori-evidence/);
  assert.match(payload.data.skill_md, /nori-capability-profile/);
  assert.match(payload.data.skill_md, /opennori resume/);
  assert.match(payload.data.skill_md, /opennori status/);
  assert.match(payload.data.skill_md, /Do not make the user remember CLI syntax/);
  assert.doesNotMatch(payload.data.skill_md, /process steps/);

  const pack = run(["skill", "export", "--pack", "--json"]);
  const names = pack.data.skills.map((skill) => skill.name);
  assert.deepEqual(names, [
    "nori",
    "nori-acceptance",
    "nori-evidence",
    "nori-capability-profile",
    "nori-project-health",
    "nori-reporting"
  ]);
  assert.match(pack.data.skills.find((skill) => skill.name === "nori-acceptance").skill_md, /opennori brainstorm/);
  assert.match(pack.data.skills.find((skill) => skill.name === "nori-acceptance").skill_md, /opennori draft/);
  assert.match(pack.data.skills.find((skill) => skill.name === "nori-acceptance").skill_md, /Do not treat brainstorm output as a Nori Contract/);
  assert.match(pack.data.skills.find((skill) => skill.name === "nori-evidence").skill_md, /Do not force evidence into a fixed adapter taxonomy/);
  assert.match(pack.data.skills.find((skill) => skill.name === "nori-evidence").skill_md, /basis, sources, reviewability, confidence, and limitations/);
  assert.match(pack.data.skills.find((skill) => skill.name === "nori-capability-profile").skill_md, /opennori profile add/);
  assert.match(pack.data.skills.find((skill) => skill.name === "nori-reporting").skill_md, /opennori report --root <repo> --json/);
  assert.match(pack.data.skills.find((skill) => skill.name === "nori-project-health").skill_md, /opennori doctor --root <repo> --json/);
});

test("install creates project assets and skips existing user content by default", () => {
  const root = tempRoot();
  const protocolPath = path.join(root, ".opennori", "protocol.md");
  fs.mkdirSync(path.dirname(protocolPath), { recursive: true });
  fs.writeFileSync(protocolPath, "custom protocol\n");

  const dryRun = run(["install", "--root", root, "--skill", "--dry-run", "--json"]);
  assert.equal(dryRun.data.dry_run, true);
  assert.equal(dryRun.data.actions.find((action) => action.path === ".opennori/manifest.json").action, "create");
  assert.equal(dryRun.data.install_plan.schema_version, "opennori/install-plan-v1");
  assert.equal(dryRun.data.install_plan.summary.would_write > 0, true);
  assert.equal(dryRun.data.install_plan.summary.will_write, 0);
  assert.equal(dryRun.data.install_plan.actions.find((action) => action.path === ".opennori/protocol.md").kind, "protocol");
  assert.equal(dryRun.data.install_plan.actions.find((action) => action.path === ".opennori/protocol.md").will_write, false);
  assert.equal(dryRun.data.install_plan.actions.find((action) => action.path === ".opennori/protocol.md").would_write, false);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "manifest.json")), false);

  const payload = run(["install", "--root", root, "--skill", "--json"]);
  assert.equal(payload.data.actions.find((action) => action.path === ".opennori/protocol.md").action, "skip");
  assert.equal(payload.data.actions.find((action) => action.path === ".opennori/manifest.json").action, "create");
  assert.equal(payload.data.install_plan.summary.will_write > 0, true);
  assert.equal(payload.data.actions.find((action) => action.path === ".opennori/manifest.json").kind, "manifest");
  assert.equal(payload.data.actions.find((action) => action.path === ".opennori/manifest.json").managed, true);
  assert.equal(payload.data.actions.find((action) => action.path === ".opennori/manifest.json").will_write, true);
  assert.equal(fs.readFileSync(protocolPath, "utf8"), "custom protocol\n");
  assert.equal(fs.existsSync(path.join(root, ".agents", "skills", "nori", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(root, ".agents", "skills", "nori-evidence", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(root, ".agents", "skills", "nori-reporting", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "active")), true);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "brainstorms")), true);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "manifest.json")), true);
  assert.equal(fs.existsSync(path.join(root, "process")), false);

  const manifest = JSON.parse(fs.readFileSync(path.join(root, ".opennori", "manifest.json"), "utf8"));
  assert.equal(manifest.schema_version, "opennori/manifest-v1");
  assert.equal(manifest.opennori_version, PACKAGE_VERSION);
  assert.equal(manifest.skill.installed, true);
  assert.equal(manifest.skill.in_sync, true);
  assert.equal(manifest.skill_pack.installed, true);
  assert.equal(manifest.skill_pack.in_sync, true);
  assert.equal(manifest.skill_pack.skills.length, 6);
  assert.equal(manifest.managed_files.some((entry) => entry.path === ".opennori/protocol.md" && entry.exists), true);
  assert.equal(manifest.managed_files.some((entry) => entry.path === ".agents/skills/nori-evidence/SKILL.md" && entry.exists), true);
  assert.equal(manifest.capabilities.includes("doctor"), true);
  assert.equal(manifest.capabilities.includes("skill-pack"), true);

  const forced = run(["install", "--root", root, "--skill", "--force", "--dry-run", "--json"]);
  const protocolAction = forced.data.install_plan.actions.find((action) => action.path === ".opennori/protocol.md");
  assert.equal(protocolAction.action, "overwrite");
  assert.equal(protocolAction.destructive, true);
  assert.equal(forced.data.install_plan.summary.destructive > 0, true);
  assert.equal(forced.data.install_plan.summary.will_write, 0);

  const unconfirmed = spawnSync(process.execPath, [CLI, "install", "--root", root, "--skill", "--force", "--json"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  assert.equal(unconfirmed.status, 1);
  const unconfirmedPayload = JSON.parse(unconfirmed.stdout);
  assert.equal(unconfirmedPayload.error.type, "confirm_required");
  assert.match(unconfirmedPayload.error.fix, /--dry-run --force/);

  const confirmed = run(["install", "--root", root, "--skill", "--force", "--confirm", "--json"]);
  assert.equal(confirmed.data.confirmed, true);
  assert.equal(confirmed.data.install_plan.summary.destructive > 0, true);
  assert.equal(confirmed.data.install_plan.summary.will_write > 0, true);
});

test("doctor reports ready, needs-action, and broken project health", () => {
  const readyRoot = tempRoot();
  run(["install", "--root", readyRoot, "--skill", "--json"]);
  const ready = run(["doctor", "--root", readyRoot, "--json"]);
  assert.equal(ready.data.status, "ready");
  assert.equal(ready.data.checks.every((check) => check.ok), true);
  assert.equal(ready.data.skill.in_sync, true);
  assert.equal(ready.data.skill_pack.in_sync, true);

  fs.unlinkSync(path.join(readyRoot, ".agents", "skills", "nori-evidence", "SKILL.md"));
  const missingPackSkill = run(["doctor", "--root", readyRoot, "--json"]);
  assert.equal(missingPackSkill.data.status, "needs-action");
  assert.equal(missingPackSkill.data.checks.find((check) => check.name === "skill_pack_sync").ok, false);
  assert.equal(missingPackSkill.data.recovery_actions.some((action) => action.check === "skill_pack_sync" && /install --root <project> --skill --force/.test(action.action)), true);

  const missingManifestRoot = tempRoot();
  run(["install", "--root", missingManifestRoot, "--json"]);
  fs.unlinkSync(path.join(missingManifestRoot, ".opennori", "manifest.json"));
  const needsAction = run(["doctor", "--root", missingManifestRoot, "--json"]);
  assert.equal(needsAction.data.status, "needs-action");
  assert.equal(needsAction.data.checks.find((check) => check.name === "manifest_file").ok, false);
  assert.match(needsAction.data.checks.find((check) => check.name === "manifest_file").recovery, /opennori bootstrap/);
  assert.equal(needsAction.data.recovery_actions.some((action) => action.check === "manifest_file" && /opennori bootstrap/.test(action.action)), true);

  const staleManifestRoot = tempRoot();
  run(["install", "--root", staleManifestRoot, "--json"]);
  const manifestPath = path.join(staleManifestRoot, ".opennori", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.opennori_version = "0.0.0";
  manifest.capabilities = ["acceptance-contract"];
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const stale = run(["doctor", "--root", staleManifestRoot, "--json"]);
  assert.equal(stale.data.status, "needs-action");
  assert.equal(stale.data.checks.find((check) => check.name === "manifest_cli_version").ok, false);
  assert.equal(stale.data.checks.find((check) => check.name === "manifest_capabilities").ok, false);
  assert.equal(stale.data.recovery_actions.some((action) => action.check === "manifest_cli_version" && /Refresh the manifest/.test(action.action)), true);
  assert.equal(stale.data.recovery_actions.some((action) => action.check === "manifest_capabilities" && /Refresh the manifest/.test(action.action)), true);

  const brokenRoot = tempRoot();
  run(["install", "--root", brokenRoot, "--json"]);
  fs.writeFileSync(path.join(brokenRoot, ".opennori", "active", "broken.evidence.json"), "{ bad json");
  const broken = run(["doctor", "--root", brokenRoot, "--json"]);
  assert.equal(broken.data.status, "broken");
  assert.equal(broken.data.checks.find((check) => check.name === "active_goals_recoverable").ok, false);
  assert.equal(broken.data.active_goal_issues.length, 1);
  assert.match(broken.data.checks.find((check) => check.name === "active_goals_recoverable").recovery, /Inspect active_goal_issues/);
  assert.equal(broken.data.recovery_actions.some((action) => action.check === "active_goals_recoverable" && /nori\/active\/<goal>/.test(action.action)), true);
  assert.equal(broken.data.recovery_actions.some((action) => action.check === "active_goal_issue" && action.goal_id === "broken" && /broken\.evidence\.json/.test(action.action)), true);
});

test("uninstall previews removals and preserves OpenNori state by default", () => {
  const root = tempRoot();
  const init = run(["init", "examples/opennori-self.json", "--root", root, "--json"]);
  run(["install", "--root", root, "--skill", "--json"]);
  run(["report", "--root", root, "--json"]);

  const dryRun = run(["uninstall", "--root", root, "--dry-run", "--json"]);
  assert.equal(dryRun.data.uninstall_plan.schema_version, "opennori/uninstall-plan-v1");
  assert.equal(dryRun.data.uninstall_plan.summary.will_write, 0);
  assert.equal(dryRun.data.uninstall_plan.actions.filter((action) => action.kind === "skill").length, 6);
  assert.equal(dryRun.data.uninstall_plan.actions.find((action) => action.path === ".opennori/active").action, "preserve");
  assert.equal(dryRun.data.uninstall_plan.actions.find((action) => action.path === ".opennori/manifest.json").action, "delete");
  assert.equal(fs.existsSync(path.join(root, ".opennori", "manifest.json")), true);

  const unconfirmed = spawnSync(process.execPath, [CLI, "uninstall", "--root", root, "--json"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  assert.equal(unconfirmed.status, 1);
  assert.equal(JSON.parse(unconfirmed.stdout).error.type, "confirm_required");

  const removed = run(["uninstall", "--root", root, "--confirm", "--json"]);
  assert.equal(removed.data.confirmed, true);
  assert.equal(fs.existsSync(path.join(root, ".agents", "skills", "nori", "SKILL.md")), false);
  assert.equal(fs.existsSync(path.join(root, ".agents", "skills", "nori-evidence", "SKILL.md")), false);
  assert.equal(fs.existsSync(path.join(root, ".agents", "skills", "nori-reporting", "SKILL.md")), false);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "manifest.json")), false);
  assert.equal(fs.existsSync(init.data.acceptance_path), true);
  assert.equal(fs.existsSync(init.data.evidence_path), true);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "reports", "opennori-self.report.md")), true);
});

test("uninstall include-state requires confirmation before removing OpenNori state", () => {
  const root = tempRoot();
  run(["init", "examples/opennori-self.json", "--root", root, "--json"]);
  run(["install", "--root", root, "--skill", "--json"]);

  const dryRun = run(["uninstall", "--root", root, "--include-state", "--dry-run", "--json"]);
  const stateAction = dryRun.data.uninstall_plan.actions.find((action) => action.path === ".opennori");
  assert.equal(stateAction.action, "delete-tree");
  assert.equal(stateAction.recursive, true);
  assert.equal(stateAction.destructive, true);
  assert.equal(dryRun.data.uninstall_plan.summary.will_write, 0);
  assert.equal(fs.existsSync(path.join(root, ".opennori")), true);

  const unconfirmed = spawnSync(process.execPath, [CLI, "uninstall", "--root", root, "--include-state", "--json"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  assert.equal(unconfirmed.status, 1);
  assert.equal(fs.existsSync(path.join(root, ".opennori")), true);

  const removed = run(["uninstall", "--root", root, "--include-state", "--confirm", "--json"]);
  assert.equal(removed.data.include_state, true);
  assert.equal(fs.existsSync(path.join(root, ".opennori")), false);
});

test("upgrade previews and confirms manifest protocol and Skill Pack refresh", () => {
  const root = tempRoot();
  run(["install", "--root", root, "--skill", "--json"]);
  fs.writeFileSync(path.join(root, ".opennori", "protocol.md"), "old protocol\n");
  fs.writeFileSync(path.join(root, ".agents", "skills", "nori", "SKILL.md"), "old skill\n");
  const manifestPath = path.join(root, ".opennori", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.opennori_version = "0.0.0";
  manifest.capabilities = ["acceptance-contract"];
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const dryRun = run(["upgrade", "--root", root, "--skill", "--dry-run", "--json"]);
  assert.equal(dryRun.data.upgrade_plan.schema_version, "opennori/upgrade-plan-v1");
  assert.equal(dryRun.data.upgrade_plan.summary.would_write > 0, true);
  assert.equal(dryRun.data.upgrade_plan.summary.will_write, 0);
  assert.equal(dryRun.data.upgrade_plan.actions.find((action) => action.path === ".opennori/manifest.json").action, "update");
  assert.equal(dryRun.data.upgrade_plan.actions.find((action) => action.path === ".opennori/protocol.md").action, "overwrite");
  assert.equal(dryRun.data.upgrade_plan.actions.find((action) => action.path === ".agents/skills/nori/SKILL.md").action, "overwrite");
  assert.equal(fs.readFileSync(path.join(root, ".opennori", "protocol.md"), "utf8"), "old protocol\n");

  const unconfirmed = spawnSync(process.execPath, [CLI, "upgrade", "--root", root, "--skill", "--json"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  assert.equal(unconfirmed.status, 1);
  assert.equal(JSON.parse(unconfirmed.stdout).error.type, "confirm_required");

  const upgraded = run(["upgrade", "--root", root, "--skill", "--confirm", "--json"]);
  assert.equal(upgraded.data.confirmed, true);
  assert.match(fs.readFileSync(path.join(root, ".opennori", "protocol.md"), "utf8"), /OpenNori Protocol/);
  assert.match(fs.readFileSync(path.join(root, ".agents", "skills", "nori", "SKILL.md"), "utf8"), /OpenNori/);
  const refreshedManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(refreshedManifest.opennori_version, PACKAGE_VERSION);
  assert.equal(refreshedManifest.capabilities.includes("upgrade"), true);
  assert.equal(refreshedManifest.capabilities.includes("context-export"), true);
});

test("profile check automatically checks local Skills and package stacks without forcing adapters", () => {
  const root = tempRoot();
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    dependencies: {
      "radix-ui": "1.0.0",
      "forbidden-lib": "1.0.0"
    }
  }));
  const init = run(["draft", "--goal", "Build a frontend page", "--root", root, "--json"]);
  run(["approve", "--root", root, "--summary", "User approved frontend acceptance criteria.", "--json"]);

  run([
    "profile", "add",
    "--root", root,
    "--type", "skill",
    "--name", "design-taste-frontend",
    "--strength", "must",
    "--purpose", "Use the design Skill.",
    "--install-policy", "existing_only",
    "--json"
  ]);
  run([
    "profile", "add",
    "--root", root,
    "--type", "stack",
    "--name", "radix-ui",
    "--strength", "prefer",
    "--purpose", "Use accessible primitives.",
    "--json"
  ]);
  run([
    "profile", "add",
    "--root", root,
    "--type", "stack",
    "--name", "forbidden-lib",
    "--strength", "avoid",
    "--purpose", "Avoid this library.",
    "--json"
  ]);

  const checked = run(["profile", "check", "--root", root, "--json"]);
  assert.equal(checked.data.recorded, false);
  assert.equal(checked.data.checks.some((item) => item.item_id === "skill-design-taste-frontend" && item.result === "satisfied"), true);
  assert.equal(checked.data.checks.some((item) => item.item_id === "stack-radix-ui" && item.result === "satisfied"), true);
  assert.equal(checked.data.checks.some((item) => item.item_id === "stack-forbidden-lib" && item.result === "violated"), true);
  let payload = JSON.parse(fs.readFileSync(init.data.evidence_path, "utf8"));
  assert.equal(payload.ledger.capability_profile.evidence.length, 0);

  const recorded = run(["profile", "check", "--root", root, "--record", "--json"]);
  assert.equal(recorded.data.recorded, true);
  assert.equal(recorded.data.compliance.statuses.some((item) => item.id === "stack-forbidden-lib" && item.status === "violated"), true);
  assert.equal(recorded.data.workflow_status, "blocked");
  payload = JSON.parse(fs.readFileSync(init.data.evidence_path, "utf8"));
  assert.equal(payload.ledger.capability_profile.evidence.length, 3);
});

test("context export exposes goal AC profile evidence and report paths for review tools", () => {
  const root = tempRoot();
  const init = run(["draft", "--goal", "Ship a reviewable workflow", "--root", root, "--json"]);
  run(["approve", "--root", root, "--summary", "User approved criteria.", "--json"]);
  run([
    "profile", "add",
    "--root", root,
    "--type", "constraint",
    "--name", "profile-stays-out-of-acs",
    "--strength", "prefer",
    "--purpose", "Keep implementation preferences outside user ACs.",
    "--json"
  ]);
  run([
    "evidence", "add",
    "--root", root,
    "--criterion", "AC-1",
    "--kind", "test-summary",
    "--summary", "The user-visible operation is satisfied.",
    "--result", "passing",
    "--json"
  ]);
  run(["report", "--root", root, "--json"]);

  const exported = run(["context", "export", "--root", root, "--json"]);
  assert.equal(exported.data.schema_version, "opennori/context-export-v1");
  assert.equal(exported.data.goal_id, "ship-a-reviewable-workflow");
  assert.equal(exported.data.criteria.some((criterion) => criterion.id === "AC-1" && criterion.latest_evidence.summary === "The user-visible operation is satisfied."), true);
  assert.equal(exported.data.capability_profile.items.some((item) => item.name === "profile-stays-out-of-acs"), true);
  assert.equal(exported.data.paths.acceptance, ".opennori/active/ship-a-reviewable-workflow.acceptance.md");
  assert.equal(exported.data.paths.report_exists, true);
  assert.equal(exported.data.manifest.capabilities.includes("context-export"), true);

  const output = path.join(root, ".opennori", "reports", "context.json");
  const written = run(["context", "export", "--root", root, "--output", output, "--json"]);
  assert.equal(written.data.output_path, output);
  assert.equal(fs.existsSync(output), true);
  assert.equal(JSON.parse(fs.readFileSync(output, "utf8")).schema_version, "opennori/context-export-v1");
});

test("changes groups acceptance artifacts separately from implementation files", () => {
  const root = tempRoot();
  spawnSync("git", ["init"], { cwd: root, encoding: "utf8" });
  fs.mkdirSync(path.join(root, ".opennori", "active"), { recursive: true });
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, ".opennori", "active", "demo.acceptance.md"), "acceptance\n");
  fs.writeFileSync(path.join(root, "src", "index.js"), "console.log('demo')\n");

  const payload = run(["changes", "--root", root, "--json"]);
  assert.equal(payload.data.changed_files.available, true);
  assert.equal(payload.data.changed_files.acceptance.some((item) => item.path === ".opennori/active/demo.acceptance.md"), true);
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
        measurement: "运行 opennori list 或 opennori resume。",
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
  assert.match(ambiguous.stderr, /Multiple active OpenNori goals found/);

  const selected = run(["resume", "--root", root, "--goal", "second-goal", "--json"]);
  assert.equal(selected.data.goal_id, "second-goal");
});

test("archive moves complete goals out of active and preserves report", () => {
  const root = tempRoot();
  const init = run(["init", "examples/opennori-self.json", "--root", root, "--json"]);
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

  const archived = run(["archive", "--root", root, "--goal", "opennori-self", "--json"]);
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
  const init = run(["init", "examples/opennori-self.json", "--root", root, "--json"]);

  run([
    "evidence", "add",
    "--root", root,
    "--criterion", "AC-O-5",
    "--kind", "human-confirmation",
    "--summary", "User must choose whether to pause or continue.",
    "--result", "blocked",
    "--json"
  ]);

  const archived = run(["archive", "--root", root, "--goal", "opennori-self", "--json"]);
  assert.equal(archived.data.archived_as, "blocked");
  assert.equal(fs.existsSync(init.data.acceptance_path), false);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "blocked", "opennori-self.acceptance.md")), true);

  const report = fs.readFileSync(archived.data.report_path, "utf8");
  assert.ok(report.indexOf("## Decision Summary") < report.indexOf("## Acceptance Status"));
  assert.match(report, /Completion: Not complete: AC-O-5 is blocked/);
  assert.match(report, /User intervention: AC-O-5 - User must choose whether to pause or continue/);
  assert.match(report, /Current status: blocked/);
  assert.match(report, /User must choose whether to pause or continue/);
});

test("criterion update preserves the revised acceptance basis and clears stale evidence", () => {
  const root = tempRoot();
  const init = run(["init", "examples/opennori-self.json", "--root", root, "--json"]);

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
    "--user-story", "作为用户，我打开 active Nori Contract 后，能在 30 秒内判断当前缺口。",
    "--measurement", "打开 active Nori Contract 并阅读当前状态。",
    "--threshold", "30 秒内能判断当前缺口。",
    "--summary", "User tightened AC-P-1 threshold.",
    "--json"
  ]);

  assert.equal(updated.data.acceptance_basis.status, "approved");
  assert.equal(updated.data.current_gap.id, "AC-P-1");
  assert.equal(updated.data.current_gap.user_story, "作为用户，我打开 active Nori Contract 后，能在 30 秒内判断当前缺口。");

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

test("check requires measurable user operations and observable outcomes", () => {
  const badRoot = tempRoot();
  const badBrief = path.join(badRoot, "bad-quality.json");
  fs.writeFileSync(badBrief, JSON.stringify({
    goal_id: "bad-quality",
    goal: "Bad quality example",
    criteria: [
      {
        id: "AC-1",
        user_story: "作为用户，我能知道功能已经完成。",
        measurement: "测试通过",
        threshold: "字段存在"
      }
    ]
  }));

  const badResult = spawnSync(process.execPath, [CLI, "init", badBrief, "--root", badRoot, "--json"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  assert.equal(badResult.status, 1);
  const badPayload = JSON.parse(badResult.stdout);
  assert.equal(badPayload.ok, false);
  assert.equal(badPayload.issues.some((issue) => issue.message === "Measurement must describe a user operation or review action"), true);
  assert.equal(badPayload.issues.some((issue) => issue.message === "Passing threshold must describe a user-observable outcome or judgment"), true);
  assert.equal(badPayload.issues.some((issue) => issue.message === "Implementation-only completion condition is not a user acceptance criterion"), true);

  const goodRoot = tempRoot();
  const goodBrief = path.join(goodRoot, "good-quality.json");
  fs.writeFileSync(goodBrief, JSON.stringify({
    goal_id: "good-quality",
    goal: "Good quality example",
    criteria: [
      {
        id: "AC-1",
        user_story: "作为用户，我运行 opennori report 后，能判断当前任务是否完成。",
        measurement: "运行 opennori report 并查看 completion、current_gap 和 evidence summary。",
        threshold: "报告显示完成状态、当前缺口和可复查证据；用户不需要阅读实现说明。"
      }
    ]
  }));

  const goodPayload = run(["init", goodBrief, "--root", goodRoot, "--json"]);
  assert.equal(goodPayload.ok, true);
  assert.equal(goodPayload.data.current_gap.id, "ACCEPTANCE-BASIS");
});
