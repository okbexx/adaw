import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "vitest";
import { validateContract } from "../src/core.js";
import { validateSchema } from "../src/validation.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const CLI = path.join(ROOT, "bin", "opennori.js");
const CLI_MODULE = pathToFileURL(path.join(ROOT, "dist", "src", "cli.js")).href;
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

function runInteractiveBootstrap(root, answer) {
  const script = `
import { main } from ${JSON.stringify(CLI_MODULE)};
Object.defineProperty(process.stdin, "isTTY", { value: true });
Object.defineProperty(process.stdout, "isTTY", { value: true });
queueMicrotask(() => process.stdin.emit("data", ${JSON.stringify(`${answer}\n`)}));
await main(["bootstrap", "--root", ${JSON.stringify(root)}]);
`;
  return spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: ROOT,
    encoding: "utf8"
  });
}

test("command help is side-effect free", () => {
  const root = tempRoot();
  const payload = run(["install", "--help", "--root", root]);

  assert.equal(payload.ok, true);
  assert.equal(payload.data.side_effect, "none");
  assert.match(payload.data.usage, /opennori install/);
  assert.equal(fs.existsSync(path.join(root, ".opennori")), false);
});

test("published package uses built dist bin while local source bin remains available", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.equal(packageJson.bin.opennori, "dist/bin/opennori.js");
  assert.equal(packageJson.files.includes("bin/opennori.js"), true);
  assert.equal(packageJson.files.includes("bin/"), false);
  assert.equal(fs.existsSync(path.join(ROOT, "bin", "opennori.js")), true);
  assert.equal(fs.existsSync(path.join(ROOT, "bin", "opennori.ts")), true);
  assert.equal(fs.readFileSync(path.join(ROOT, "bin", "opennori.js"), "utf8").includes("process.features?.typescript"), true);
  assert.equal(fs.readFileSync(path.join(ROOT, "bin", "opennori.ts"), "utf8").includes("../src/cli.ts"), true);
});

test("CLI entrypoint delegates command dispatch to the citty command tree", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const cliSource = fs.readFileSync(path.join(ROOT, "src", "cli.ts"), "utf8");
  const commandTree = fs.readFileSync(path.join(ROOT, "src", "cli", "command-tree.ts"), "utf8");

  assert.equal(packageJson.dependencies.citty.startsWith("^"), true);
  assert.equal(fs.existsSync(path.join(ROOT, "src", "cli", "routes.ts")), false);
  assert.match(cliSource, /from "\.\/cli\/command-tree\.ts"/);
  assert.match(cliSource, /runCliCommand\(resolved\)/);
  assert.match(commandTree, /defineCommand/);
  assert.match(commandTree, /runCommand/);
  assert.match(commandTree, /subCommands/);
});

test("built dist bin can read package-root Skill assets", () => {
  const build = spawnSync("npm", ["run", "build"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  assert.equal(build.status, 0, build.stderr || build.stdout);

  const payload = run(["skill", "export", "--pack", "--json"], {
    cli: path.join(ROOT, "dist", "bin", "opennori.js")
  });
  assert.equal(payload.data.skills.length, 10);
  assert.match(payload.data.skills.find((skill) => skill.name === "nori").skill_md, /OpenNori/);
});

test("built dist bin runs when invoked through a package-manager symlink", () => {
  const build = spawnSync("npm", ["run", "build"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  assert.equal(build.status, 0, build.stderr || build.stdout);

  const root = tempRoot();
  const binDir = path.join(root, "node_modules", ".bin");
  fs.mkdirSync(binDir, { recursive: true });
  const linkedBin = path.join(binDir, "opennori");
  fs.symlinkSync(path.join(ROOT, "dist", "bin", "opennori.js"), linkedBin);

  const result = spawnSync(process.execPath, [linkedBin, "--help"], {
    cwd: root,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.match(payload.data.usage, /opennori/);
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

test("opennori quickstart accepts top-level json for agents", () => {
  const root = tempRoot();
  const preview = run(["--json"], { cwd: root });

  assert.equal(preview.ok, true);
  assert.equal(preview.data.status, "needs_confirm");
  assert.equal(preview.data.install_plan.schema_version, "opennori/install-plan-v1");
  assert.equal(preview.data.install_plan.summary.will_write, 0);
  assert.equal(fs.existsSync(path.join(root, ".opennori")), false);
});

test("opennori quickstart is interactive for human terminals", () => {
  const declinedRoot = tempRoot();
  const declined = runInteractiveBootstrap(declinedRoot, "n");

  assert.equal(declined.status, 0);
  assert.match(declined.stdout, /OpenNori project setup/);
  assert.match(declined.stdout, /No files have been written yet/);
  assert.match(declined.stdout, /Install OpenNori here\? \[y\/N\]/);
  assert.match(declined.stdout, /No changes made/);
  assert.equal(fs.existsSync(path.join(declinedRoot, ".opennori")), false);

  const confirmedRoot = tempRoot();
  const confirmed = runInteractiveBootstrap(confirmedRoot, "y");

  assert.equal(confirmed.status, 0);
  assert.match(confirmed.stdout, /OpenNori installed/);
  assert.match(confirmed.stdout, /Next: tell your agent the goal/);
  assert.equal(fs.existsSync(path.join(confirmedRoot, ".opennori", "manifest.json")), true);
  assert.equal(fs.existsSync(path.join(confirmedRoot, ".agents", "skills", "nori", "SKILL.md")), true);
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
      "--source-command", "opennori status --root . --json",
      "--source-path", ".opennori/reports/draft.report.md",
      "--reviewability", "Run status and inspect the report artifact.",
      "--limitations", "This is a test fixture for approval gating.",
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

test("discover finds underspecified acceptance gaps before draft", () => {
  const root = tempRoot();
  const discovery = run([
    "discover",
    "--goal", "做一个设置页，用户可以修改个人资料，保存后刷新仍然生效，失败时有提示。",
    "--root", root,
    "--json"
  ]);

  assert.equal(discovery.data.status, "needs-user-answers");
  assert.equal(discovery.data.is_acceptance_contract, false);
  assert.equal(fs.existsSync(discovery.data.discovery_path), true);
  assert.equal(fs.existsSync(discovery.data.markdown_path), true);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "active")), false);

  const gapIds = discovery.data.gaps.map((gap) => gap.id);
  assert.equal(gapIds.includes("missing-field-scope"), true);
  assert.equal(gapIds.includes("missing-validation-rule"), true);
  assert.equal(gapIds.includes("missing-success-signal"), true);
  assert.equal(gapIds.includes("missing-persistence-scope"), false);
  assert.equal(gapIds.includes("missing-failure-case"), true);
  assert.equal(gapIds.includes("missing-out-of-scope-boundary"), true);
  assert.equal(discovery.data.gaps.some((gap) => /哪些具体字段/.test(gap.question)), true);
  assert.equal(discovery.data.gaps.some((gap) => /有效规则/.test(gap.question)), true);

  const text = fs.readFileSync(discovery.data.markdown_path, "utf8");
  assert.match(text, /Acceptance Discovery/);
  assert.match(text, /not a Nori Contract/);
  assert.doesNotMatch(text, /Implementation plan/);
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
      "--source-command", "opennori status --root . --json",
      "--source-path", ".opennori/reports/opennori-self.report.md",
      "--reviewability", "Run status and inspect the report artifact.",
      "--limitations", "This is a test fixture for report rendering.",
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
  assert.equal(report.data.workflow_status, "complete");
  assert.equal(report.data.current_gap, null);
  assert.equal(report.data.completion.complete, true);
  assert.equal(report.data.intervention.required, false);
  assert.equal(report.data.evidence_health.status, "clear");
  assert.ok(report.data.architecture);
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
  assert.equal(resume.data.evidence_health.status, "clear");
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

  const flexibleStrong = run([
    "evidence", "add",
    "--acceptance", init.data.acceptance_path,
    "--evidence", init.data.evidence_path,
    "--criterion", "AC-P-4",
    "--kind", "dogfood-doctor",
    "--basis", "tool-observation",
    "--summary", "Reviewer can rerun doctor and inspect the report artifact.",
    "--source-command", "opennori doctor --root . --json",
    "--source-path", ".opennori/reports/opennori-self.report.md",
    "--result", "passing",
    "--json"
  ]);

  assert.equal(flexibleStrong.data.criterion_status, "passing");
  assert.equal(flexibleStrong.data.confidence, "verified");
  assert.equal(flexibleStrong.data.gate, "accepted");
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

test("check surfaces evidence health without forcing adapter taxonomy", () => {
  const weakRoot = tempRoot();
  run(["draft", "--goal", "Ship with weak evidence", "--root", weakRoot, "--json"]);
  run(["approve", "--root", weakRoot, "--summary", "User approved evidence health test.", "--json"]);
  run([
    "evidence", "add",
    "--root", weakRoot,
    "--criterion", "AC-1",
    "--kind", "manual",
    "--summary", "AC-1 is covered by the OpenNori 0.1.3 single-bin CLI implementation, self contract refresh, tests, and reviewable artifacts.",
    "--result", "passing",
    "--confidence", "verified",
    "--json"
  ]);

  const weakCheck = run(["check", "--root", weakRoot, "--json"]);
  assert.equal(weakCheck.data.evidence_health.status, "review");
  assert.equal(weakCheck.warnings.some((warning) => warning.type === "evidence_health" && warning.issue === "bulk-evidence-summary"), true);
  assert.equal(weakCheck.warnings.some((warning) => warning.type === "evidence_health" && warning.issue === "missing-reviewable-source"), true);
  assert.equal(weakCheck.next_actions.some((action) => /evidence_health/.test(action)), true);

  const report = run(["report", "--root", weakRoot, "--json"]);
  assert.equal(report.data.completion.complete, false);
  assert.equal(report.data.evidence_health.status, "review");
  assert.match(fs.readFileSync(report.data.report_path, "utf8"), /## Evidence Health/);

  const strongRoot = tempRoot();
  run(["draft", "--goal", "Ship with reviewable evidence", "--root", strongRoot, "--json"]);
  run(["approve", "--root", strongRoot, "--summary", "User approved evidence health test.", "--json"]);
  run([
    "evidence", "add",
    "--root", strongRoot,
    "--criterion", "AC-1",
    "--kind", "test-summary",
    "--summary", "User-visible status command shows completion and current gap.",
    "--result", "passing",
    "--confidence", "verified",
    "--source-command", "opennori status --root . --json",
    "--source-path", ".opennori/reports/example.report.md",
    "--reviewability", "Run the command and inspect the report artifact.",
    "--limitations", "This does not prove public website deployment.",
    "--json"
  ]);

  const strongCheck = run(["check", "--root", strongRoot, "--json"]);
  assert.equal(strongCheck.data.evidence_health.status, "clear");
  assert.equal(strongCheck.warnings.some((warning) => warning.type === "evidence_health"), false);
});

test("protocol v1 example contains concrete user tool operations", () => {
  const brief = JSON.parse(fs.readFileSync(path.join(ROOT, "examples", "opennori-self.json"), "utf8"));
  assert.equal(brief.criteria.length, 48);
  assert.deepEqual(new Set(brief.criteria.map((criterion) => criterion.layer)), new Set(["protocol", "operator", "productization", "architecture"]));
  assert.equal(brief.criteria.filter((criterion) => criterion.id.startsWith("AC-P-")).length, 13);
  assert.equal(brief.criteria.filter((criterion) => criterion.id.startsWith("AC-O-")).length, 8);
  assert.equal(brief.criteria.filter((criterion) => criterion.id.startsWith("AC-Z-")).length, 17);
  assert.equal(brief.criteria.filter((criterion) => criterion.id.startsWith("AC-A-")).length, 10);

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
    "Architecture Baseline",
    "build-vs-buy",
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
  const noriAsset = fs.readFileSync(path.join(ROOT, "skills", "nori", "SKILL.md"), "utf8");
  assert.equal(payload.data.skill_name, "nori");
  assert.equal(payload.data.skill_md, noriAsset);
  assert.match(payload.data.skill_md, /nori-acceptance/);
  assert.match(payload.data.skill_md, /nori-evidence/);
  assert.match(payload.data.skill_md, /nori-capability-profile/);
  assert.match(payload.data.skill_md, /nori-architecture-brainstorm/);
  assert.match(payload.data.skill_md, /nori-architecture-apply/);
  assert.match(payload.data.skill_md, /nori-build-vs-buy/);
  assert.match(payload.data.skill_md, /opennori resume/);
  assert.match(payload.data.skill_md, /opennori status/);
  assert.match(payload.data.skill_md, /Architecture Baseline is sticky/);
  assert.match(payload.data.skill_md, /Do not make the user remember CLI syntax/);
  assert.doesNotMatch(payload.data.skill_md, /process steps/);

  const named = run(["skill", "export", "--name=nori-evidence", "--json"]);
  const evidenceAsset = fs.readFileSync(path.join(ROOT, "skills", "nori-evidence", "SKILL.md"), "utf8");
  assert.equal(named.data.skill_name, "nori-evidence");
  assert.equal(named.data.skill_md, evidenceAsset);

  const pack = run(["skill", "export", "--pack", "--json"]);
  const names = pack.data.skills.map((skill) => skill.name);
  assert.deepEqual(names, [
    "nori",
    "nori-acceptance",
    "nori-evidence",
    "nori-capability-profile",
    "nori-architecture-brainstorm",
    "nori-architecture-apply",
    "nori-architecture-challenge",
    "nori-build-vs-buy",
    "nori-project-health",
    "nori-reporting"
  ]);
  assert.match(pack.data.skills.find((skill) => skill.name === "nori-acceptance").skill_md, /opennori brainstorm/);
  assert.match(pack.data.skills.find((skill) => skill.name === "nori-acceptance").skill_md, /opennori draft/);
  assert.match(pack.data.skills.find((skill) => skill.name === "nori-acceptance").skill_md, /Do not treat brainstorm output as a Nori Contract/);
  assert.match(pack.data.skills.find((skill) => skill.name === "nori-evidence").skill_md, /Do not force evidence into a fixed adapter taxonomy/);
  assert.match(pack.data.skills.find((skill) => skill.name === "nori-evidence").skill_md, /basis, sources, reviewability, confidence, and limitations/);
  assert.match(pack.data.skills.find((skill) => skill.name === "nori-capability-profile").skill_md, /opennori profile add/);
  assert.match(pack.data.skills.find((skill) => skill.name === "nori-architecture-brainstorm").skill_md, /opennori architecture baseline/);
  assert.match(pack.data.skills.find((skill) => skill.name === "nori-architecture-apply").skill_md, /baseline\.md/);
  assert.match(pack.data.skills.find((skill) => skill.name === "nori-architecture-challenge").skill_md, /must not silently replace/);
  assert.match(pack.data.skills.find((skill) => skill.name === "nori-build-vs-buy").skill_md, /current project dependency/);
  assert.match(pack.data.skills.find((skill) => skill.name === "nori-reporting").skill_md, /opennori report --root <repo> --json/);
  assert.match(pack.data.skills.find((skill) => skill.name === "nori-project-health").skill_md, /opennori doctor --root <repo> --json/);
  for (const skill of pack.data.skills) {
    const asset = fs.readFileSync(path.join(ROOT, "skills", skill.name, "SKILL.md"), "utf8");
    assert.equal(skill.skill_md, asset);
  }
});

test("public JSON Schemas validate persisted OpenNori state and separate structure from semantics", () => {
  const root = tempRoot();
  run(["install", "--root", root, "--skill", "--json"]);
  run(["draft", "--goal", "Ship schema-backed OpenNori state", "--root", root, "--json"]);
  run([
    "architecture", "baseline",
    "--root", root,
    "--goal", "Ship schema-backed OpenNori state",
    "--goal-id", "ship-schema-backed-opennori-state",
    "--confirm",
    "--json"
  ]);
  run([
    "architecture", "build-vs-buy",
    "--root", root,
    "--id", "schema-validation",
    "--area", "schema-validation",
    "--need", "Validate persisted OpenNori state",
    "--recommendation", "reuse",
    "--summary", "Use JSON Schema and Ajv for structural validation.",
    "--current-project", "OpenNori writes JSON state files under .opennori.",
    "--standard-library", "JSON.parse only validates syntax.",
    "--official-sdk", "No official SDK applies.",
    "--open-source", "Ajv is the selected JSON Schema validator.",
    "--json"
  ]);

  const manifest = JSON.parse(fs.readFileSync(path.join(root, ".opennori", "manifest.json"), "utf8"));
  const evidence = JSON.parse(fs.readFileSync(path.join(root, ".opennori", "active", "ship-schema-backed-opennori-state.evidence.json"), "utf8"));
  const baseline = JSON.parse(fs.readFileSync(path.join(root, ".opennori", "architecture", "baseline.json"), "utf8"));
  const decision = JSON.parse(fs.readFileSync(path.join(root, ".opennori", "architecture", "decisions", "schema-validation.json"), "utf8"));

  assert.equal(validateSchema("manifest", manifest).valid, true);
  assert.equal(validateSchema("evidence-payload", evidence).valid, true);
  assert.equal(validateSchema("architecture-baseline", baseline).valid, true);
  assert.equal(validateSchema("build-vs-buy", decision).valid, true);

  const invalidShape = validateSchema("evidence-payload", { contract: { goal: "missing required fields" }, ledger: {} });
  assert.equal(invalidShape.valid, false);
  assert.equal(invalidShape.errors.some((error) => error.path.includes("/contract")), true);

  evidence.contract.criteria[0].user_story = "Implementation detail only";
  assert.equal(validateSchema("evidence-payload", evidence).valid, true);
  assert.equal(validateContract(evidence.contract, evidence.ledger).some((issue) => issue.path === "criteria[0].user_story"), true);
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
  assert.equal(fs.existsSync(path.join(root, ".agents", "skills", "nori-architecture-apply", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(root, ".agents", "skills", "nori-build-vs-buy", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(root, ".agents", "skills", "nori-reporting", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "active")), true);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "brainstorms")), true);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "architecture", "profiles")), true);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "architecture", "challenges")), true);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "architecture", "decisions")), true);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "agent-guide.md")), true);
  assert.match(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"), /\.opennori\/architecture\/baseline\.md/);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "manifest.json")), true);
  assert.equal(fs.existsSync(path.join(root, "process")), false);

  const manifest = JSON.parse(fs.readFileSync(path.join(root, ".opennori", "manifest.json"), "utf8"));
  assert.equal(manifest.schema_version, "opennori/manifest-v1");
  assert.equal(manifest.opennori_version, PACKAGE_VERSION);
  assert.equal(manifest.skill.installed, true);
  assert.equal(manifest.skill.in_sync, true);
  assert.equal(manifest.skill_pack.installed, true);
  assert.equal(manifest.skill_pack.in_sync, true);
  assert.equal(manifest.skill_pack.skills.length, 10);
  assert.equal(manifest.managed_files.some((entry) => entry.path === ".opennori/protocol.md" && entry.exists), true);
  assert.equal(manifest.managed_files.some((entry) => entry.path === ".agents/skills/nori-evidence/SKILL.md" && entry.exists), true);
  assert.equal(manifest.managed_files.some((entry) => entry.path === ".opennori/architecture" && entry.exists), true);
  assert.equal(manifest.capabilities.includes("doctor"), true);
  assert.equal(manifest.capabilities.includes("skill-pack"), true);
  assert.equal(manifest.capabilities.includes("architecture-baseline"), true);
  assert.equal(manifest.capabilities.includes("build-vs-buy"), true);
  assert.equal(manifest.architecture.decision, "missing");
  assert.equal(manifest.architecture.agent_surface.guide.installed, true);

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

test("install can refresh OpenNori assets in existing projects without overwriting project routes", () => {
  const root = tempRoot();
  fs.writeFileSync(path.join(root, "AGENTS.md"), "# Existing Project Guide\n\nKeep this project-specific guidance.\n");
  run(["install", "--root", root, "--skill", "--json"]);
  fs.writeFileSync(path.join(root, ".agents", "skills", "nori", "SKILL.md"), "old nori skill\n");

  const dryRun = run([
    "install",
    "--root", root,
    "--skill",
    "--refresh-skill",
    "--merge-agent-route",
    "--dry-run",
    "--json"
  ]);
  assert.equal(dryRun.data.install_plan.refresh_skill, true);
  assert.equal(dryRun.data.install_plan.merge_agent_route, true);
  assert.equal(dryRun.data.install_plan.summary.will_write, 0);
  assert.equal(dryRun.data.actions.find((action) => action.path === "AGENTS.md").action, "merge");
  assert.equal(dryRun.data.actions.find((action) => action.path === ".agents/skills/nori/SKILL.md").action, "update");

  const unconfirmed = spawnSync(process.execPath, [
    CLI,
    "install",
    "--root", root,
    "--skill",
    "--refresh-skill",
    "--merge-agent-route",
    "--json"
  ], {
    cwd: ROOT,
    encoding: "utf8"
  });
  assert.equal(unconfirmed.status, 1);
  assert.equal(JSON.parse(unconfirmed.stdout).error.type, "confirm_required");

  const installed = run([
    "install",
    "--root", root,
    "--skill",
    "--refresh-skill",
    "--merge-agent-route",
    "--confirm",
    "--json"
  ]);
  assert.equal(installed.data.confirmed, true);
  const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
  assert.match(agents, /Keep this project-specific guidance/);
  assert.match(agents, /\.opennori\/architecture\/baseline\.md/);
  assert.match(agents, /opennori:agent-route:start/);
  assert.match(fs.readFileSync(path.join(root, ".agents", "skills", "nori", "SKILL.md"), "utf8"), /OpenNori/);
  const doctor = run(["doctor", "--root", root, "--json"]);
  assert.equal(doctor.data.status, "ready");
  assert.equal(doctor.data.skill_pack.in_sync, true);
  assert.equal(doctor.data.architecture.agent_surface.agents.references_baseline, true);
});

test("doctor reports ready, needs-action, and broken project health", () => {
  const readyRoot = tempRoot();
  run(["install", "--root", readyRoot, "--skill", "--json"]);
  const ready = run(["doctor", "--root", readyRoot, "--json"]);
  assert.equal(ready.data.status, "ready");
  assert.equal(ready.data.checks.every((check) => check.ok), true);
  assert.equal(ready.data.skill.in_sync, true);
  assert.equal(ready.data.skill_pack.in_sync, true);
  assert.equal(ready.data.architecture.decision, "missing");
  assert.equal(ready.data.checks.find((check) => check.name === "architecture_baseline").ok, true);

  run(["draft", "--goal", "Ship a non-trivial architecture-aware goal", "--root", readyRoot, "--json"]);
  const needsBaseline = run(["doctor", "--root", readyRoot, "--json"]);
  assert.equal(needsBaseline.data.status, "needs-action");
  assert.equal(needsBaseline.data.checks.find((check) => check.name === "architecture_baseline").ok, false);
  assert.match(needsBaseline.data.checks.find((check) => check.name === "architecture_baseline").recovery, /opennori architecture baseline/);

  run([
    "architecture", "baseline",
    "--root", readyRoot,
    "--goal", "Ship a non-trivial architecture-aware goal",
    "--goal-id", "ship-a-non-trivial-architecture-aware-goal",
    "--confirm",
    "--json"
  ]);
  const readyAgain = run(["doctor", "--root", readyRoot, "--json"]);
  assert.equal(readyAgain.data.status, "ready");
  assert.equal(readyAgain.data.architecture.decision, "valid");

  fs.unlinkSync(path.join(readyRoot, ".agents", "skills", "nori-evidence", "SKILL.md"));
  const missingPackSkill = run(["doctor", "--root", readyRoot, "--json"]);
  assert.equal(missingPackSkill.data.status, "needs-action");
  assert.equal(missingPackSkill.data.checks.find((check) => check.name === "skill_pack_sync").ok, false);
  assert.equal(missingPackSkill.data.recovery_actions.some((action) => action.check === "skill_pack_sync" && /--skill --refresh-skill --dry-run/.test(action.action)), true);

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
  assert.equal(stale.data.checks.find((check) => check.name === "manifest_schema").ok, true);
  assert.equal(stale.data.checks.find((check) => check.name === "manifest_cli_version").ok, false);
  assert.equal(stale.data.checks.find((check) => check.name === "manifest_capabilities").ok, false);
  assert.equal(stale.data.recovery_actions.some((action) => action.check === "manifest_cli_version" && /Refresh the manifest/.test(action.action)), true);
  assert.equal(stale.data.recovery_actions.some((action) => action.check === "manifest_capabilities" && /Refresh the manifest/.test(action.action)), true);

  const invalidManifestRoot = tempRoot();
  run(["install", "--root", invalidManifestRoot, "--json"]);
  const invalidManifestPath = path.join(invalidManifestRoot, ".opennori", "manifest.json");
  const invalidManifest = JSON.parse(fs.readFileSync(invalidManifestPath, "utf8"));
  delete invalidManifest.managed_files;
  fs.writeFileSync(invalidManifestPath, `${JSON.stringify(invalidManifest, null, 2)}\n`);
  const invalidManifestDoctor = run(["doctor", "--root", invalidManifestRoot, "--json"]);
  assert.equal(invalidManifestDoctor.data.status, "broken");
  assert.equal(invalidManifestDoctor.data.checks.find((check) => check.name === "manifest_schema").ok, false);
  assert.equal(invalidManifestDoctor.data.recovery_actions.some((action) => action.check === "manifest_schema"), true);

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

  const schemaBrokenRoot = tempRoot();
  run(["draft", "--goal", "Ship schema validation diagnostics", "--root", schemaBrokenRoot, "--json"]);
  const evidencePath = path.join(schemaBrokenRoot, ".opennori", "active", "ship-schema-validation-diagnostics.evidence.json");
  const evidencePayload = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  delete evidencePayload.ledger.criteria;
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidencePayload, null, 2)}\n`);
  const schemaBroken = run(["doctor", "--root", schemaBrokenRoot, "--json"]);
  assert.equal(schemaBroken.data.status, "broken");
  assert.equal(schemaBroken.data.active_goal_issues.some((issue) => issue.path?.startsWith("schema/ledger")), true);
});

test("uninstall previews removals and preserves OpenNori state by default", () => {
  const root = tempRoot();
  const init = run(["init", "examples/opennori-self.json", "--root", root, "--json"]);
  run(["install", "--root", root, "--skill", "--json"]);
  run(["report", "--root", root, "--json"]);

  const dryRun = run(["uninstall", "--root", root, "--dry-run", "--json"]);
  assert.equal(dryRun.data.uninstall_plan.schema_version, "opennori/uninstall-plan-v1");
  assert.equal(dryRun.data.uninstall_plan.summary.will_write, 0);
  assert.equal(dryRun.data.uninstall_plan.actions.filter((action) => action.kind === "skill").length, 10);
  assert.equal(dryRun.data.uninstall_plan.actions.find((action) => action.path === ".opennori/active").action, "preserve");
  assert.equal(dryRun.data.uninstall_plan.actions.find((action) => action.path === ".opennori/architecture").action, "preserve");
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
  assert.equal(fs.existsSync(path.join(root, ".agents", "skills", "nori-architecture-apply", "SKILL.md")), false);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "manifest.json")), false);
  assert.equal(fs.existsSync(init.data.acceptance_path), true);
  assert.equal(fs.existsSync(init.data.evidence_path), true);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "architecture")), true);
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
  assert.equal(upgraded.next_actions.some((action) => /opennori check/.test(action)), true);
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

test("architecture baseline loop is agent-readable sticky and challengeable", () => {
  const root = tempRoot();
  run(["install", "--root", root, "--skill", "--json"]);
  const draft = run(["draft", "--goal", "Refactor OpenNori into a TypeScript agent state CLI product", "--root", root, "--json"]);

  const missingBaselineCheck = run(["check", "--root", root, "--json"]);
  assert.equal(missingBaselineCheck.data.architecture_check.status, "needs-action");
  assert.equal(missingBaselineCheck.data.architecture_check.decision, "missing");
  assert.equal(missingBaselineCheck.warnings.some((warning) => warning.type === "architecture" && /Architecture Baseline/.test(warning.message)), true);
  assert.equal(missingBaselineCheck.next_actions.some((action) => /architecture_check/.test(action)), true);

  const profiles = run(["architecture", "profiles", "--root", root, "--json"]);
  assert.equal(profiles.data.profiles.some((profile) => profile.id === "typescript-agent-state-cli"), true);
  const builtinProfile = profiles.data.profiles.find((profile) => profile.id === "typescript-agent-state-cli");
  assert.match(builtinProfile.summary, /strict TypeScript/);
  assert.equal(builtinProfile.valid, true);
  assert.equal(builtinProfile.review.can_generate_baseline, true);
  assert.equal(builtinProfile.sources.some((source) => source.label === "CodeGraph / GitNexus"), true);
  assert.equal(builtinProfile.principles.includes("build-vs-buy-before-custom-infrastructure"), true);
  assert.equal(builtinProfile.checks.some((check) => check.id === "ARCH-5" && check.audience === "agent"), true);
  assert.equal(builtinProfile.preferred_libraries.some((entry) => entry.area === "cli"), true);
  assert.equal(builtinProfile.avoid.includes("silent architecture replacement"), true);
  assert.equal(builtinProfile.build_vs_buy_policy.require_reason_when_self_building, true);

  const preview = run([
    "architecture", "baseline",
    "--root", root,
    "--goal", "Refactor OpenNori into a TypeScript agent state CLI product",
    "--goal-id", "refactor-opennori-into-a-typescript-agent-state-cli-product",
    "--json"
  ]);
  assert.equal(preview.data.confirmed, false);
  assert.equal(preview.data.side_effect, "none");
  assert.equal(preview.data.baseline.status, "draft");
  assert.equal(fs.existsSync(path.join(root, ".opennori", "architecture", "baseline.json")), false);

  const confirmed = run([
    "architecture", "baseline",
    "--root", root,
    "--goal", "Refactor OpenNori into a TypeScript agent state CLI product",
    "--goal-id", "refactor-opennori-into-a-typescript-agent-state-cli-product",
    "--confirm",
    "--json"
  ]);
  assert.equal(confirmed.data.confirmed, true);
  assert.equal(confirmed.data.baseline.status, "active");
  assert.equal(confirmed.data.baseline.sticky, true);
  assert.equal(confirmed.data.baseline.requires_challenge_to_change, true);
  assert.equal(confirmed.data.baseline.principles.includes("build-vs-buy-before-custom-infrastructure"), true);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "architecture", "baseline.json")), true);
  assert.match(fs.readFileSync(path.join(root, ".opennori", "architecture", "baseline.md"), "utf8"), /Architecture Baseline/);
  assert.match(fs.readFileSync(path.join(root, ".opennori", "agent-guide.md"), "utf8"), /Architecture Baseline/);

  const decision = run([
    "architecture", "build-vs-buy",
    "--root", root,
    "--area", "cli",
    "--need", "Parse subcommands and flags",
    "--recommendation", "reuse",
    "--summary", "Prefer a mature CLI parser or current project convention before expanding custom parsing.",
    "--current-project", "Current project has handwritten argValue/hasFlag helpers.",
    "--standard-library", "Node has no full subcommand parser.",
    "--official-sdk", "No official SDK.",
    "--open-source", "commander, citty, cac",
    "--json"
  ]);
  assert.equal(decision.data.decision.schema_version, "opennori/build-vs-buy-v1");
  assert.equal(fs.existsSync(decision.data.decision_path), true);

  const status = run(["status", "--root", root, "--json"]);
  assert.equal(status.data.architecture.decision, "valid");
  assert.equal(status.data.architecture.baseline.profile, "typescript-agent-state-cli");
  assert.equal(status.data.architecture.build_vs_buy_decisions.length, 1);

  const clearCheck = run(["check", "--root", root, "--json"]);
  assert.equal(clearCheck.data.architecture_check.status, "clear");
  assert.equal(clearCheck.data.architecture_check.decision, "valid");
  assert.equal(clearCheck.warnings.some((warning) => warning.type === "architecture"), false);

  const manifest = JSON.parse(fs.readFileSync(path.join(root, ".opennori", "manifest.json"), "utf8"));
  assert.equal(manifest.architecture.required_for_goal, true);
  assert.equal(manifest.architecture.baseline.goal_id, "refactor-opennori-into-a-typescript-agent-state-cli-product");

  const report = run(["report", "--root", root, "--json"]);
  const reportText = fs.readFileSync(report.data.report_path, "utf8");
  assert.match(reportText, /## Architecture Baseline/);
  assert.match(reportText, /Architecture decision: valid/);
  assert.match(reportText, /Build-vs-buy: clear \(1 decisions\)/);

  const exported = run(["context", "export", "--root", root, "--json"]);
  assert.equal(exported.data.architecture.decision, "valid");
  assert.equal(exported.data.architecture.baseline.profile, "typescript-agent-state-cli");

  const challenge = run([
    "architecture", "challenge",
    "--root", root,
    "--summary", "Existing project standardizes on another CLI parser.",
    "--evidence", "package.json already depends on citty and command modules use it.",
    "--recommendation", "Revise CLI parser preference from commander to citty for this project.",
    "--json"
  ]);
  assert.equal(challenge.data.challenge.schema_version, "opennori/architecture-challenge-v1");
  assert.equal(challenge.data.architecture.decision, "challenged");
  assert.equal(challenge.data.architecture.open_challenges.length, 1);
  assert.match(fs.readFileSync(challenge.data.markdown_path, "utf8"), /Do not silently replace/);

  const challengedStatus = run(["status", "--root", root, "--json"]);
  assert.equal(challengedStatus.data.architecture.decision, "challenged");

  assert.equal(fs.existsSync(draft.data.acceptance_path), true);
});

test("project architecture profiles can be added and used for baselines", () => {
  const root = tempRoot();
  run(["install", "--root", root, "--skill", "--json"]);

  const sourcePath = path.join(root, "preferred-architecture.json");
  fs.writeFileSync(sourcePath, `${JSON.stringify({
    id: "team-cli",
    title: "Team CLI",
    summary: "Use the team's preferred CLI parser, shared schema package, and strict build-vs-buy review.",
    applies_to: ["team-maintained CLI tools"],
    sources: [{ label: "Team standard", lesson: "Follow the shared parser and schema packages unless challenged." }],
    principles: ["team-parser-first", "shared-schema-first", "build-vs-buy-before-self-build"],
    checks: [
      {
        id: "TEAM-ARCH-1",
        audience: "maintainer",
        statement: "New command behavior follows the team parser boundary.",
        review: "Inspect command modules and parser wiring."
      }
    ],
    preferred_libraries: [{ area: "cli", policy: "Prefer the team CLI parser package." }],
    avoid: ["new handwritten parser without challenge"],
    build_vs_buy_policy: {
      order: ["current-project-dependency", "official-sdk", "mature-open-source-library", "small-local-implementation"],
      require_reason_when_self_building: true
    }
  }, null, 2)}\n`);

  const added = run(["architecture", "profile", "--root", root, "--from", sourcePath, "--json"]);
  assert.equal(added.data.profile.id, "team-cli");
  assert.equal(added.data.profile_path, path.join(root, ".opennori", "architecture", "profiles", "team-cli.json"));
  assert.equal(fs.existsSync(added.data.profile_path), true);
  assert.equal(added.data.profiles[0].id, "team-cli");
  assert.equal(added.data.profiles[0].origin, "project");

  const duplicate = spawnSync(process.execPath, [CLI, "architecture", "profile", "--root", root, "--from", sourcePath, "--json"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /already exists/);

  const profiles = run(["architecture", "profiles", "--root", root, "--json"]);
  const projectProfile = profiles.data.profiles.find((profile) => profile.id === "team-cli" && profile.origin === "project");
  assert.equal(Boolean(projectProfile), true);
  assert.equal(projectProfile.valid, true);
  assert.equal(projectProfile.review.can_generate_baseline, true);
  assert.equal(projectProfile.sources.some((source) => source.label === "Team standard"), true);
  assert.equal(projectProfile.principles.includes("team-parser-first"), true);
  assert.equal(projectProfile.avoid.includes("new handwritten parser without challenge"), true);

  const baseline = run([
    "architecture", "baseline",
    "--root", root,
    "--goal", "Ship under team architecture",
    "--profile", "team-cli",
    "--confirm",
    "--json"
  ]);
  assert.equal(baseline.data.baseline.profile, "team-cli");
  assert.equal(baseline.data.baseline.profile_origin, "project");
  assert.equal(baseline.data.baseline.principles.includes("team-parser-first"), true);
  assert.match(fs.readFileSync(path.join(root, ".opennori", "architecture", "baseline.md"), "utf8"), /team-parser-first/);
});

test("build-vs-buy health surfaces missing reuse review before self-build", () => {
  const root = tempRoot();
  run(["install", "--root", root, "--skill", "--json"]);
  const draft = run(["draft", "--goal", "Ship a reusable infrastructure choice", "--root", root, "--json"]);
  run(["approve", "--root", root, "--summary", "User approved criteria.", "--json"]);
  run([
    "architecture", "baseline",
    "--root", root,
    "--goal", "Ship a reusable infrastructure choice",
    "--goal-id", draft.data.goal_id,
    "--confirm",
    "--json"
  ]);

  run([
    "architecture", "build-vs-buy",
    "--root", root,
    "--id", "schema-validation",
    "--area", "schema-validation",
    "--need", "Validate OpenNori project state",
    "--recommendation", "reuse",
    "--summary", "Use a schema validation library when state contracts grow.",
    "--current-project", "No existing runtime schema dependency.",
    "--standard-library", "Node has JSON.parse but no schema validation.",
    "--official-sdk", "No official OpenNori SDK applies.",
    "--open-source", "Ajv, Zod, Valibot, TypeBox were reviewed.",
    "--json"
  ]);

  const healthy = run(["check", "--root", root, "--json"]);
  assert.equal(healthy.data.architecture_check.architecture.build_vs_buy.status, "clear");
  assert.equal(healthy.warnings.some((warning) => warning.type === "build_vs_buy"), false);
  assert.equal(healthy.data.architecture_check.architecture.build_vs_buy_decisions[0].open_source.includes("Ajv"), true);
  const ready = run(["doctor", "--root", root, "--json"]);
  assert.equal(ready.data.checks.find((check) => check.name === "build_vs_buy_health").ok, true);

  run([
    "architecture", "build-vs-buy",
    "--root", root,
    "--id", "custom-markdown-parser",
    "--area", "markdown",
    "--need", "Parse editable OpenNori markdown",
    "--recommendation", "self-build",
    "--summary", "Keep parsing local for now.",
    "--current-project", "Current parser uses a local regex helper.",
    "--standard-library", "Node has no markdown parser.",
    "--official-sdk", "No official SDK applies.",
    "--json"
  ]);

  const unhealthy = run(["check", "--root", root, "--json"]);
  assert.equal(unhealthy.data.architecture_check.architecture.build_vs_buy.status, "needs-action");
  assert.equal(unhealthy.warnings.some((warning) => warning.type === "build_vs_buy" && warning.issue === "missing-open-source"), true);
  assert.equal(unhealthy.warnings.some((warning) => warning.type === "build_vs_buy" && warning.issue === "missing-self-build-reason"), true);
  assert.equal(unhealthy.next_actions.some((action) => /build_vs_buy/.test(action)), true);

  const doctorPayload = run(["doctor", "--root", root, "--json"]);
  const buildVsBuyCheck = doctorPayload.data.checks.find((check) => check.name === "build_vs_buy_health");
  assert.equal(buildVsBuyCheck.ok, false);
  assert.match(buildVsBuyCheck.summary, /build-vs-buy issue/);

  const decisionPath = path.join(root, ".opennori", "architecture", "decisions", "custom-markdown-parser.json");
  const invalidDecision = JSON.parse(fs.readFileSync(decisionPath, "utf8"));
  invalidDecision.recommendation = "maybe";
  fs.writeFileSync(decisionPath, `${JSON.stringify(invalidDecision, null, 2)}\n`);
  const schemaBroken = run(["check", "--root", root, "--json"]);
  assert.equal(schemaBroken.data.architecture_check.architecture.build_vs_buy.status, "broken");
  assert.equal(schemaBroken.warnings.some((warning) => warning.type === "build_vs_buy" && warning.issue === "schema-invalid-decision"), true);
});

test("superseded build-vs-buy decisions stay reviewable without blocking current health", () => {
  const root = tempRoot();
  run(["install", "--root", root, "--skill", "--json"]);
  run([
    "architecture", "build-vs-buy",
    "--root", root,
    "--id", "old-parser-choice",
    "--area", "cli",
    "--need", "Choose a parser for an earlier CLI shape",
    "--recommendation", "self-build",
    "--status", "superseded",
    "--superseded-by", "citty-command-layer",
    "--superseded-reason", "The confirmed Architecture Baseline now prefers a CLI framework.",
    "--summary", "Old local parser decision retained for history.",
    "--current-project", "Previous implementation used a small local parser.",
    "--standard-library", "node:util parseArgs was available.",
    "--official-sdk", "No official SDK applies.",
    "--json"
  ]);

  const status = run(["architecture", "show", "--root", root, "--json"]);
  assert.equal(status.data.architecture.build_vs_buy_decisions.length, 1);
  assert.equal(status.data.architecture.build_vs_buy_decisions[0].status, "superseded");
  assert.equal(status.data.architecture.build_vs_buy.status, "clear");
  assert.equal(status.data.architecture.build_vs_buy.decision_count, 0);
  assert.equal(status.data.architecture.build_vs_buy.superseded_decision_count, 1);
});

test("context export exposes goal AC profile evidence and report paths for review tools", () => {
  const root = tempRoot();
  run(["draft", "--goal", "Ship a reviewable workflow", "--root", root, "--json"]);
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
  run([
    "architecture", "baseline",
    "--root", root,
    "--goal", "Ship a reviewable workflow",
    "--goal-id", "ship-a-reviewable-workflow",
    "--confirm",
    "--json"
  ]);
  run(["report", "--root", root, "--json"]);

  const exported = run(["context", "export", "--root", root, "--json"]);
  assert.equal(exported.data.schema_version, "opennori/context-export-v1");
  assert.equal(exported.data.goal_id, "ship-a-reviewable-workflow");
  assert.equal(exported.data.criteria.some((criterion) => criterion.id === "AC-1" && criterion.latest_evidence.summary === "The user-visible operation is satisfied."), true);
  assert.equal(exported.data.capability_profile.items.some((item) => item.name === "profile-stays-out-of-acs"), true);
  assert.equal(exported.data.architecture.decision, "valid");
  assert.equal(exported.data.architecture.baseline.profile, "typescript-agent-state-cli");
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

test("check audits existing active contracts for underspecified acceptance quality without rewriting history", () => {
  const weakRoot = tempRoot();
  const weakBrief = path.join(weakRoot, "weak-contract.json");
  fs.writeFileSync(weakBrief, JSON.stringify({
    goal_id: "weak-contract",
    goal: "Settings page",
    acceptance_basis: { status: "approved", summary: "Existing project contract." },
    criteria: [
      {
        id: "AC-1",
        user_story: "作为用户，我打开设置页后，能修改个人资料并保存，失败时看到提示。",
        measurement: "打开设置页，修改个人资料，点击保存。",
        threshold: "刷新后仍然生效；失败时有提示。"
      }
    ]
  }));

  const init = run(["init", weakBrief, "--root", weakRoot, "--json"]);
  const before = fs.readFileSync(init.data.evidence_path, "utf8");
  const check = run(["check", "--root", weakRoot, "--json"]);
  const after = fs.readFileSync(init.data.evidence_path, "utf8");

  assert.equal(check.ok, true);
  assert.equal(check.data.acceptance_quality.status, "needs-user-review");
  assert.equal(check.warnings.some((warning) => warning.gap_id === "missing-field-scope"), true);
  assert.equal(check.warnings.some((warning) => warning.gap_id === "missing-validation-rule"), true);
  assert.equal(check.warnings.some((warning) => warning.gap_id === "missing-success-signal"), true);
  assert.equal(check.warnings.some((warning) => warning.gap_id === "missing-failure-case"), true);
  assert.equal(check.next_actions.some((action) => /revise/.test(action)), true);
  assert.equal(after, before);

  const goodRoot = tempRoot();
  const goodBrief = path.join(goodRoot, "specific-contract.json");
  fs.writeFileSync(goodBrief, JSON.stringify({
    goal_id: "specific-contract",
    goal: "Settings page",
    acceptance_basis: { status: "approved", summary: "Specific project contract." },
    criteria: [
      {
        id: "AC-1",
        user_story: "作为用户，我打开设置页后，能修改昵称、头像和简介，保存成功后看到成功反馈。",
        measurement: "打开设置页，修改昵称、头像和简介，检查昵称必填、简介长度、头像文件类型和大小，点击保存，并查看报告或截图。",
        threshold: "报告显示保存成功，刷新后昵称、头像和简介仍然存在；网络失败时保留原值并显示网络错误；邮箱和手机号本轮不在范围。"
      }
    ]
  }));

  run(["init", goodBrief, "--root", goodRoot, "--json"]);
  const goodCheck = run(["check", "--root", goodRoot, "--json"]);
  assert.equal(goodCheck.data.acceptance_quality.status, "clear");
  assert.equal(goodCheck.warnings.some((warning) => warning.type === "acceptance_quality"), false);
  assert.equal(goodCheck.data.architecture_check.status, "needs-action");
});
