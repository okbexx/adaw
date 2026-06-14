import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "vitest";
import { reviewAcceptanceQuality } from "../src/acceptance.ts";
import { validateContract } from "../src/core.ts";
import { validateSchema } from "../src/validation.ts";

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

function spawnJson(args, options = {}) {
  const child = spawn(process.execPath, [options.cli || CLI, ...args], {
    cwd: options.cwd || ROOT,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  return {
    child,
    done: new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== (options.status ?? 0)) {
          reject(new Error(stderr || stdout || `Process exited with ${code}`));
          return;
        }
        resolve(JSON.parse(stdout));
      });
    })
  };
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
  assert.equal(packageJson.files.includes(".agents/plugins/"), true);
  assert.equal(packageJson.files.includes(".codex-plugin/"), false);
  assert.equal(packageJson.files.includes("skills/"), false);
  assert.equal(packageJson.files.includes("plugins/opennori/"), true);
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

test("built dist bin can report package-root Plugin Skill assets", () => {
  const build = spawnSync("npm", ["run", "build"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  assert.equal(build.status, 0, build.stderr || build.stdout);

  const root = tempRoot();
  const payload = run(["install", "--root", root, "--json"], {
    cli: path.join(ROOT, "dist", "bin", "opennori.js")
  });
  assert.equal(payload.data.manifest.plugin.schema_version, "opennori/plugin-v1");
  assert.equal(payload.data.manifest.plugin.name, "opennori");
  assert.equal(payload.data.manifest.plugin.packaged, true);
  assert.equal(payload.data.manifest.plugin.marketplace_packaged, true);
  assert.equal(payload.data.manifest.plugin.marketplace_path, ".agents/plugins/marketplace.json");
  assert.equal(payload.data.manifest.plugin.marketplace_name, "opennori");
  assert.equal(payload.data.manifest.plugin.marketplace_plugin_path, "./plugins/opennori");
  assert.equal(payload.data.manifest.plugin.manifest_path, "plugins/opennori/.codex-plugin/plugin.json");
  assert.equal(payload.data.manifest.plugin.skills_path, "plugins/opennori/skills");
  assert.equal(payload.data.manifest.plugin.skill_count, 10);
  assert.equal(payload.data.manifest.plugin.skills.some((skill) => skill.name === "nori"), true);
  assert.equal(fs.existsSync(path.join(root, ".agents", "skills", "nori", "SKILL.md")), false);
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
  assert.equal("requested_skill" in preview.data.install_plan, false);
  assert.equal(preview.data.install_plan.summary.would_write > 0, true);
  assert.equal(preview.data.install_plan.summary.will_write, 0);
  assert.equal(fs.existsSync(path.join(root, ".opennori")), false);

  const confirmed = run(["bootstrap", "--root", root, "--confirm", "--json"]);
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.data.status, "installed");
  assert.equal(confirmed.data.install_plan.dry_run, false);
  assert.equal(confirmed.data.install_plan.summary.will_write > 0, true);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "manifest.json")), true);
  assert.equal(fs.existsSync(path.join(root, ".agents", "skills", "nori", "SKILL.md")), false);
  assert.equal(fs.existsSync(path.join(root, "AGENTS.md")), false);

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
  assert.equal(fs.existsSync(path.join(confirmedRoot, ".agents", "skills", "nori", "SKILL.md")), false);
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

test("preferred profile items create review risk without blocking objective completion", () => {
  const root = tempRoot();
  const init = run(["draft", "--goal", "Build a frontend page", "--root", root, "--json"]);
  const payload = JSON.parse(fs.readFileSync(init.data.evidence_path, "utf8"));

  run(["approve", "--root", root, "--summary", "User approved frontend acceptance criteria.", "--json"]);
  for (const criterion of Object.keys(payload.ledger.criteria)) {
    run([
      "evidence", "add",
      "--root", root,
      "--criterion", criterion,
      "--kind", "test-summary",
      "--summary", `${criterion} is satisfied.`,
      "--result", "passing",
      "--source-command", "npm test",
      "--reviewability", "Run npm test and inspect the completed UI.",
      "--limitations", "Profile preference still needs review.",
      "--json"
    ]);
  }

  const preferred = run([
    "profile", "add",
    "--root", root,
    "--type", "stack",
    "--name", "radix-ui",
    "--strength", "prefer",
    "--purpose", "Use accessible primitives for custom components.",
    "--install-policy", "ask_before_install",
    "--json"
  ]);
  assert.equal(preferred.data.workflow_status, "complete");
  assert.equal(preferred.data.current_gap, null);
  assert.equal(preferred.data.compliance.review.some((item) => item.name === "radix-ui" && item.status === "unknown"), true);

  const status = run(["status", "--root", root, "--json"]);
  assert.equal(status.data.completion.objective_complete, true);
  assert.equal(status.data.completion.confidence, "review-risk");
  assert.equal(status.data.completion.review_risks.includes("profile_review"), true);
  assert.equal(status.data.next_recommendation.status, "completion-review-required");

  const check = run(["check", "--root", root, "--json"]);
  assert.equal(check.ok, true);
  assert.equal(check.data.capability_compliance.review.some((item) => item.name === "radix-ui"), true);
  assert.equal(check.warnings.some((warning) => warning.type === "profile_review" && warning.item_id === "stack-radix-ui"), true);

  const report = run(["report", "--root", root, "--json"]);
  const text = fs.readFileSync(report.data.report_path, "utf8");
  assert.match(text, /Review risks: profile_review/);
  assert.match(text, /Profile review risks:/);
  assert.match(text, /radix-ui is unknown \(prefer\)/);
});

test("evidence can drive the workflow to complete and render a human report", () => {
  const root = tempRoot();
  const init = run(["init", "examples/opennori-self.json", "--root", root, "--json"]);
  run(["install", "--root", root, "--json"]);
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

  run([
    "architecture", "baseline",
    "--root", root,
    "--goal", ledger.contract.goal,
    "--goal-id", ledger.contract.goal_id,
    "--confirm",
    "--json"
  ]);

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
  assert.equal(report.data.completion.confidence, "confident");
  assert.equal(report.data.completion.review_risks.length, 0);
  assert.equal(report.data.intervention.required, false);
  assert.equal(report.data.evidence_health.status, "clear");
  assert.ok(report.data.architecture);
  assert.equal(report.data.architecture.decision, "valid");
  assert.match(text, /## Decision Summary/);
  assert.ok(text.indexOf("## Decision Summary") < text.indexOf("## Acceptance Status"));
  assert.match(text, /Completion: Complete: all required acceptance criteria have passing or waived evidence\./);
  assert.match(text, /Current gap: None\. All required acceptance criteria/);
  assert.match(text, /User intervention: No user intervention is currently required\./);
  assert.match(text, /Recommended next action: This OpenNori goal is complete/);
  assert.match(text, /## Candidate Next Goals/);
  assert.match(text, /not approved acceptance criteria, implementation phases, or completion evidence/);
  assert.match(text, /opennori-adoption-dogfood/);
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
  assert.equal(resume.data.next_recommendation.candidate_goals.length, 4);
  assert.equal(resume.data.next_recommendation.candidate_goals[0].id, "opennori-adoption-dogfood");
  assert.equal(resume.data.next_recommendation.candidate_goals[0].acceptance_directions.length > 0, true);
  assert.equal(resume.data.next_recommendation.candidate_goals.every((candidate) => candidate.goal && candidate.user_value), true);
  assert.equal(resume.data.evidence_health.status, "clear");
  assert.equal(resume.next_actions.some((action) => /candidate_goals/.test(action)), true);

  const next = run([
    "next",
    "--acceptance", init.data.acceptance_path,
    "--evidence", init.data.evidence_path,
    "--root", root,
    "--json"
  ]);
  assert.equal(next.data.next_recommendation.status, "ready-for-next-loop");
  assert.equal(next.data.next_recommendation.candidate_goals.length, 4);

  const exported = run([
    "context", "export",
    "--acceptance", init.data.acceptance_path,
    "--evidence", init.data.evidence_path,
    "--root", root,
    "--json"
  ]);
  assert.equal(exported.data.next_recommendation.status, "ready-for-next-loop");
  assert.equal(exported.data.next_recommendation.candidate_goals.some((candidate) => candidate.id === "opennori-adoption-dogfood"), true);
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
    "--source-path", "src/cli.ts",
    "--source-url", "https://example.com/review",
    "--reviewability", "User can rerun the command or open the artifact.",
    "--limitations", "Browser-specific visual review was not performed.",
    "--confidence", "verified",
    "--result", "passing",
    "--json"
  ]);

  assert.equal(added.data.criterion_status, "passing");
  assert.equal(added.data.latest_evidence.basis, "tool-observation");
  assert.equal(added.data.latest_evidence.sources.length, 4);
  assert.equal(added.data.latest_evidence.reviewability, "User can rerun the command or open the artifact.");
  assert.equal(added.data.latest_evidence.limitations, "Browser-specific visual review was not performed.");

  const status = run(["status", "--root", root, "--json"]);
  const criterion = status.data.criteria.find((row) => row.id === "AC-1");
  assert.equal(criterion.latest_evidence.sources[0].command, "npm run check");
  assert.equal(criterion.latest_evidence.sources[1].label, "screenshots/reviewable-flow.png");
  assert.equal(criterion.latest_evidence.sources[2].type, "command");
  assert.equal(criterion.latest_evidence.sources[2].command, "npm run check");
  assert.equal(criterion.latest_evidence.sources[3].type, "url");
  assert.equal(criterion.latest_evidence.sources[3].url, "https://example.com/review");
  assert.equal(criterion.latest_evidence.sources.some((source) => source.path === "src/cli.ts"), false);

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

test("concurrent evidence writes preserve every reviewable record", async () => {
  const root = tempRoot();
  run(["draft", "--goal", "Ship concurrent evidence safely", "--root", root, "--json"]);
  run(["approve", "--root", root, "--summary", "User approved criteria.", "--json"]);
  const lockPath = path.join(root, ".opennori", ".locks", "active-goal.write.lock");
  fs.mkdirSync(lockPath, { recursive: true });

  const children = Array.from({ length: 4 }, (_, index) => {
    const id = `concurrent-${index + 1}`;
    return spawnJson([
      "evidence", "add",
      "--root", root,
      "--criterion", "AC-1",
      "--kind", "concurrency-check",
      "--basis", "tool-observation",
      "--summary", `Concurrent evidence ${id}`,
      "--source-command", `verify ${id}`,
      "--reviewability", `Review ${id}`,
      "--result", "passing",
      "--confidence", "verified",
      "--json"
    ]);
  });

  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(children.some(({ child }) => child.exitCode !== null), false);
  fs.rmSync(lockPath, { recursive: true, force: true });
  await Promise.all(children.map(({ done }) => done));

  const payload = JSON.parse(fs.readFileSync(path.join(root, ".opennori", "active", "ship-concurrent-evidence-safely.evidence.json"), "utf8"));
  const evidence = payload.ledger.criteria["AC-1"].evidence;
  assert.equal(evidence.length, 4);
  assert.deepEqual(
    evidence.map((item) => item.summary).sort(),
    [
      "Concurrent evidence concurrent-1",
      "Concurrent evidence concurrent-2",
      "Concurrent evidence concurrent-3",
      "Concurrent evidence concurrent-4"
    ]
  );
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
  for (const criterion of ["AC-2", "AC-3"]) {
    run([
      "evidence", "add",
      "--root", weakRoot,
      "--criterion", criterion,
      "--kind", "test-summary",
      "--summary", `${criterion} has reviewable evidence.`,
      "--result", "passing",
      "--confidence", "verified",
      "--source-command", "opennori status --root . --json",
      "--reviewability", "Run status and inspect the result.",
      "--limitations", "This fixture focuses on evidence health semantics.",
      "--json"
    ]);
  }

  const weakCheck = run(["check", "--root", weakRoot, "--json"]);
  assert.equal(weakCheck.data.evidence_health.status, "review");
  assert.equal(weakCheck.warnings.some((warning) => warning.type === "evidence_health" && warning.issue === "bulk-evidence-summary"), true);
  assert.equal(weakCheck.warnings.some((warning) => warning.type === "evidence_health" && warning.issue === "missing-reviewable-source"), true);
  assert.equal(weakCheck.next_actions.some((action) => /evidence_health/.test(action)), true);

  const report = run(["report", "--root", weakRoot, "--json"]);
  assert.equal(report.data.completion.complete, true);
  assert.equal(report.data.completion.objective_complete, true);
  assert.equal(report.data.completion.confidence, "review-risk");
  assert.equal(report.data.completion.review_risks.includes("evidence_health"), true);
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

test("missing local artifact evidence is pruned and does not occupy report or context export", () => {
  const root = tempRoot();
  run(["draft", "--goal", "Ship without stale evidence", "--root", root, "--json"]);
  run(["approve", "--root", root, "--summary", "User approved criteria.", "--json"]);

  const stalePath = "docs/removed-proof.md";
  const added = run([
    "evidence", "add",
    "--root", root,
    "--criterion", "AC-1",
    "--kind", "artifact",
    "--summary", "The user-visible operation was proven by an artifact that was later removed.",
    "--source-path", stalePath,
    "--reviewability", "Open the artifact.",
    "--limitations", "Only proves the local artifact existed.",
    "--confidence", "verified",
    "--result", "passing",
    "--json"
  ]);
  assert.equal(added.data.criterion_status, "unknown");
  assert.equal(added.data.latest_evidence, null);

  const status = run(["status", "--root", root, "--json"]);
  assert.equal(status.data.workflow_status, "active");
  assert.equal(status.data.current_gap.id, "AC-1");
  const criterion = status.data.criteria.find((row) => row.id === "AC-1");
  assert.equal(criterion.status, "unknown");
  assert.equal(criterion.latest_evidence, null);

  const evidencePath = path.join(root, ".opennori", "active", "ship-without-stale-evidence.evidence.json");
  const payload = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  assert.equal(payload.ledger.criteria["AC-1"].evidence.length, 0);
  assert.equal(payload.ledger.criteria["AC-1"].status, "unknown");

  const exported = run(["context", "export", "--root", root, "--json"]);
  assert.equal(exported.data.criteria.find((row) => row.id === "AC-1").latest_evidence, null);
  assert.equal(JSON.stringify(exported.data).includes(stalePath), false);

  const report = run(["report", "--root", root, "--json"]);
  const text = fs.readFileSync(report.data.report_path, "utf8");
  assert.doesNotMatch(text, /docs\/removed-proof\.md/);
  assert.match(text, /AC-1/);
});

test("agent can explicitly prune obsolete evidence before recording fresh proof", () => {
  const root = tempRoot();
  run(["draft", "--goal", "Refresh obsolete evidence", "--root", root, "--json"]);
  run(["approve", "--root", root, "--summary", "User approved criteria.", "--json"]);

  run([
    "evidence", "add",
    "--root", root,
    "--criterion", "AC-1",
    "--kind", "review-result",
    "--basis", "tool-observation",
    "--summary", "Old product behavior passed before the acceptance target changed.",
    "--source-command", "npm test",
    "--reviewability", "Rerun the old command.",
    "--limitations", "This evidence is obsolete after the product changed.",
    "--confidence", "verified",
    "--result", "passing",
    "--json"
  ]);

  const pruned = run([
    "evidence", "prune",
    "--root", root,
    "--criterion", "AC-1",
    "--reason", "Old product behavior no longer proves the current AC.",
    "--json"
  ]);
  assert.equal(pruned.data.evidence_prune.removed_records, 1);
  assert.equal(pruned.data.criterion_status, "unknown");
  assert.equal(pruned.data.current_gap.id, "AC-1");

  const report = run(["report", "--root", root, "--json"]);
  const text = fs.readFileSync(report.data.report_path, "utf8");
  assert.doesNotMatch(text, /Old product behavior/);

  const exported = run(["context", "export", "--root", root, "--json"]);
  assert.equal(JSON.stringify(exported.data).includes("Old product behavior"), false);
});

test("protocol v1 example contains concrete user tool operations", () => {
  const brief = JSON.parse(fs.readFileSync(path.join(ROOT, "examples", "opennori-self.json"), "utf8"));
  assert.equal(brief.criteria.length, 49);
  assert.deepEqual(new Set(brief.criteria.map((criterion) => criterion.layer)), new Set(["protocol", "operator", "productization", "architecture"]));
  assert.equal(brief.criteria.filter((criterion) => criterion.id.startsWith("AC-P-")).length, 13);
  assert.equal(brief.criteria.filter((criterion) => criterion.id.startsWith("AC-O-")).length, 8);
  assert.equal(brief.criteria.filter((criterion) => criterion.id.startsWith("AC-Z-")).length, 18);
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
    "OpenNori Plugin",
    "证据来源",
    "复查"
  ];

  const joined = JSON.stringify(brief, null, 2);
  for (const tool of expectedTools) {
    assert.match(joined, new RegExp(tool));
  }
});

test("Codex Plugin manifest exposes OpenNori Skills for agent discovery", () => {
  const pluginRoot = path.join(ROOT, "plugins", "opennori");
  const plugin = JSON.parse(fs.readFileSync(path.join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
  const marketplace = JSON.parse(fs.readFileSync(path.join(ROOT, ".agents", "plugins", "marketplace.json"), "utf8"));
  assert.equal(plugin.name, "opennori");
  assert.equal(plugin.skills, "./skills/");
  assert.equal(plugin.interface.displayName, "OpenNori");
  assert.equal(plugin.interface.defaultPrompt.length, 3);
  assert.match(plugin.interface.defaultPrompt[0], /acceptance criteria/);
  assert.equal(marketplace.name, "opennori");
  assert.equal(marketplace.interface.displayName, "OpenNori");
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0].name, "opennori");
  assert.equal(marketplace.plugins[0].source.source, "local");
  assert.equal(marketplace.plugins[0].source.path, "./plugins/opennori");
  assert.equal(marketplace.plugins[0].policy.installation, "AVAILABLE");
  assert.equal(marketplace.plugins[0].policy.authentication, "ON_INSTALL");

  const names = fs.readdirSync(path.join(pluginRoot, "skills"))
    .filter((name) => fs.existsSync(path.join(pluginRoot, "skills", name, "SKILL.md")))
    .sort();
  assert.deepEqual(names.sort(), [
    "nori",
    "nori-acceptance",
    "nori-architecture-apply",
    "nori-architecture-brainstorm",
    "nori-architecture-challenge",
    "nori-build-vs-buy",
    "nori-capability-profile",
    "nori-evidence",
    "nori-project-health",
    "nori-reporting"
  ].sort());

  const noriAsset = fs.readFileSync(path.join(pluginRoot, "skills", "nori", "SKILL.md"), "utf8");
  assert.match(noriAsset, /^---\nname: nori\n/m);
  assert.match(noriAsset, /nori-acceptance/);
  assert.match(noriAsset, /nori-evidence/);
  assert.match(noriAsset, /nori-capability-profile/);
  assert.match(noriAsset, /nori-architecture-brainstorm/);
  assert.match(noriAsset, /nori-architecture-apply/);
  assert.match(noriAsset, /nori-build-vs-buy/);
  assert.match(noriAsset, /opennori resume/);
  assert.match(noriAsset, /opennori status/);
  assert.doesNotMatch(noriAsset, /skill export/);
  assert.doesNotMatch(noriAsset, /process steps/);

  const evidenceAsset = fs.readFileSync(path.join(pluginRoot, "skills", "nori-evidence", "SKILL.md"), "utf8");
  assert.match(evidenceAsset, /Do not force evidence into a fixed adapter taxonomy/);
  assert.match(evidenceAsset, /basis, sources, reviewability, confidence, and limitations/);

  const behaviorProtocolSections = [
    "## Mission",
    "## Start Here",
    "## Natural-Language Mapping",
    "## State Writes",
    "## Handoffs",
    "## User Reply Shape",
    "## Misuse Guards"
  ];
  for (const name of names) {
    const asset = fs.readFileSync(path.join(pluginRoot, "skills", name, "SKILL.md"), "utf8");
    assert.match(asset, /^---\nname: /);
    assert.match(asset, /\ndescription: /);
    for (const section of behaviorProtocolSections) {
      assert.match(asset, new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.match(asset, /natural-language|Natural-Language|natural language/);
    assert.match(asset, /state/i);
    assert.match(asset, /handoff|hand off/i);
    assert.doesNotMatch(asset, /install --skill/);
    assert.doesNotMatch(asset, /refresh-skill/);
    assert.doesNotMatch(asset, /skill export/);
  }
});

test("public product surfaces present OpenNori as one capability bundle", () => {
  const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, "plugins", "opennori", ".codex-plugin", "plugin.json"), "utf8"));
  const nori = fs.readFileSync(path.join(ROOT, "plugins", "opennori", "skills", "nori", "SKILL.md"), "utf8");
  const health = fs.readFileSync(path.join(ROOT, "plugins", "opennori", "skills", "nori-project-health", "SKILL.md"), "utf8");
  const protocol = fs.readFileSync(path.join(ROOT, ".opennori", "protocol.md"), "utf8");

  for (const text of [readme, plugin.interface.longDescription, nori, health, protocol]) {
    assert.match(text, /capability bundle/);
  }
  assert.match(readme, /deterministic state layer/);
  assert.match(readme, /not a separate product\s+path/);
  assert.match(plugin.interface.longDescription, /Do not treat Plugin, Skills, and CLI as separate user paths/);
  assert.match(nori, /Do not split OpenNori into separate Plugin, Skill, and CLI user paths/);
  assert.match(health, /half-installed/);
  assert.match(protocol, /Direct CLI use\s+is an advanced, automation, or debugging route/);

  for (const text of [readme, protocol]) {
    assert.doesNotMatch(text, /Choose one path/);
    assert.doesNotMatch(text, /Try the CLI once/);
    assert.doesNotMatch(text, /Pin the CLI to a project/);
  }
});

test("public JSON Schemas validate persisted OpenNori state and separate structure from semantics", () => {
  const root = tempRoot();
  run(["install", "--root", root, "--json"]);
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
  assert.equal(validateContract(evidence.contract, evidence.ledger).some((issue) => issue.path === "criteria[0].user_story"), false);
  assert.equal(reviewAcceptanceQuality(evidence.contract).status, "needs-user-review");
});

test("install creates project assets and skips existing user content by default", () => {
  const root = tempRoot();
  const protocolPath = path.join(root, ".opennori", "protocol.md");
  fs.mkdirSync(path.dirname(protocolPath), { recursive: true });
  fs.writeFileSync(protocolPath, "custom protocol\n");

  const dryRun = run(["install", "--root", root, "--dry-run", "--json"]);
  assert.equal(dryRun.data.dry_run, true);
  assert.equal(dryRun.data.actions.find((action) => action.path === ".opennori/manifest.json").action, "create");
  assert.equal(dryRun.data.install_plan.schema_version, "opennori/install-plan-v1");
  assert.equal(dryRun.data.install_plan.summary.would_write > 0, true);
  assert.equal(dryRun.data.install_plan.summary.will_write, 0);
  assert.equal(dryRun.data.install_plan.actions.find((action) => action.path === ".opennori/protocol.md").kind, "protocol");
  assert.equal(dryRun.data.install_plan.actions.find((action) => action.path === ".opennori/protocol.md").will_write, false);
  assert.equal(dryRun.data.install_plan.actions.find((action) => action.path === ".opennori/protocol.md").would_write, false);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "manifest.json")), false);

  const payload = run(["install", "--root", root, "--json"]);
  assert.equal(payload.data.actions.find((action) => action.path === ".opennori/protocol.md").action, "skip");
  assert.equal(payload.data.actions.find((action) => action.path === ".opennori/manifest.json").action, "create");
  assert.equal(payload.data.install_plan.summary.will_write > 0, true);
  assert.equal(payload.data.actions.find((action) => action.path === ".opennori/manifest.json").kind, "manifest");
  assert.equal(payload.data.actions.find((action) => action.path === ".opennori/manifest.json").managed, true);
  assert.equal(payload.data.actions.find((action) => action.path === ".opennori/manifest.json").will_write, true);
  assert.equal(fs.readFileSync(protocolPath, "utf8"), "custom protocol\n");
  assert.equal(fs.existsSync(path.join(root, ".agents", "skills", "nori", "SKILL.md")), false);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "active")), true);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "brainstorms")), true);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "architecture", "profiles")), true);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "architecture", "challenges")), true);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "architecture", "decisions")), true);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "agent-guide.md")), true);
  assert.equal(fs.existsSync(path.join(root, "AGENTS.md")), false);
  assert.equal(fs.existsSync(path.join(root, "CLAUDE.md")), false);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "manifest.json")), true);
  assert.equal(fs.existsSync(path.join(root, "process")), false);

  const manifest = JSON.parse(fs.readFileSync(path.join(root, ".opennori", "manifest.json"), "utf8"));
  assert.equal(manifest.schema_version, "opennori/manifest-v1");
  assert.equal(manifest.opennori_version, PACKAGE_VERSION);
  assert.equal(manifest.plugin.schema_version, "opennori/plugin-v1");
  assert.equal(manifest.plugin.name, "opennori");
  assert.equal(manifest.plugin.packaged, true);
  assert.equal(manifest.plugin.marketplace_packaged, true);
  assert.equal(manifest.plugin.marketplace_name, "opennori");
  assert.equal(manifest.plugin.marketplace_plugin_path, "./plugins/opennori");
  assert.equal(manifest.plugin.manifest_path, "plugins/opennori/.codex-plugin/plugin.json");
  assert.equal(manifest.plugin.skills_path, "plugins/opennori/skills");
  assert.equal(manifest.plugin.skill_count, 10);
  assert.equal(manifest.plugin.skills.some((skill) => skill.name === "nori-project-health"), true);
  assert.equal(manifest.managed_files.some((entry) => entry.path === ".opennori/protocol.md" && entry.exists), true);
  assert.equal(manifest.managed_files.some((entry) => entry.path.startsWith(".agents/skills")), false);
  assert.equal(manifest.managed_files.some((entry) => entry.path === ".opennori/architecture" && entry.exists), true);
  assert.equal(manifest.capabilities.includes("doctor"), true);
  assert.equal(manifest.capabilities.includes("codex-plugin"), true);
  assert.equal(manifest.capabilities.includes("opennori-skills"), true);
  assert.equal(manifest.capabilities.includes("architecture-baseline"), true);
  assert.equal(manifest.capabilities.includes("build-vs-buy"), true);
  assert.equal(manifest.architecture.decision, "missing");
  assert.equal(manifest.architecture.agent_surface.guide.installed, true);

  const forced = run(["install", "--root", root, "--force", "--dry-run", "--json"]);
  const protocolAction = forced.data.install_plan.actions.find((action) => action.path === ".opennori/protocol.md");
  assert.equal(protocolAction.action, "overwrite");
  assert.equal(protocolAction.destructive, true);
  assert.equal(forced.data.install_plan.summary.destructive > 0, true);
  assert.equal(forced.data.install_plan.summary.will_write, 0);

  const unconfirmed = spawnSync(process.execPath, [CLI, "install", "--root", root, "--force", "--json"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  assert.equal(unconfirmed.status, 1);
  const unconfirmedPayload = JSON.parse(unconfirmed.stdout);
  assert.equal(unconfirmedPayload.error.type, "confirm_required");
  assert.match(unconfirmedPayload.error.fix, /--dry-run --force/);

  const confirmed = run(["install", "--root", root, "--force", "--confirm", "--json"]);
  assert.equal(confirmed.data.confirmed, true);
  assert.equal(confirmed.data.install_plan.summary.destructive > 0, true);
  assert.equal(confirmed.data.install_plan.summary.will_write > 0, true);
});

test("install can explicitly merge optional project agent routes without installing Skills", () => {
  const root = tempRoot();
  fs.writeFileSync(path.join(root, "AGENTS.md"), "# Existing Project Guide\n\nKeep this project-specific guidance.\n");
  run(["install", "--root", root, "--json"]);

  const dryRun = run([
    "install",
    "--root", root,
    "--merge-agent-route",
    "--dry-run",
    "--json"
  ]);
  assert.equal(dryRun.data.install_plan.merge_agent_route, true);
  assert.equal(dryRun.data.install_plan.summary.will_write, 0);
  assert.equal(dryRun.data.actions.find((action) => action.path === "AGENTS.md").action, "merge");
  assert.equal(dryRun.data.actions.some((action) => action.path.startsWith(".agents/skills")), false);

  const unconfirmed = spawnSync(process.execPath, [
    CLI,
    "install",
    "--root", root,
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
    "--merge-agent-route",
    "--confirm",
    "--json"
  ]);
  assert.equal(installed.data.confirmed, true);
  const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
  assert.match(agents, /Keep this project-specific guidance/);
  assert.match(agents, /\.opennori\/architecture\/baseline\.md/);
  assert.match(agents, /opennori:agent-route:start/);
  assert.equal(fs.existsSync(path.join(root, ".agents", "skills", "nori", "SKILL.md")), false);
  const doctor = run(["doctor", "--root", root, "--json"]);
  assert.equal(doctor.data.status, "ready");
  assert.equal(doctor.data.plugin.packaged, true);
  assert.equal(doctor.data.architecture.agent_surface.agents.references_baseline, true);
});

test("doctor reports ready, needs-action, and broken project health", () => {
  const readyRoot = tempRoot();
  run(["install", "--root", readyRoot, "--json"]);
  const ready = run(["doctor", "--root", readyRoot, "--json"]);
  assert.equal(ready.data.status, "ready");
  assert.equal(ready.data.checks.every((check) => check.ok), true);
  assert.equal(ready.data.plugin.packaged, true);
  assert.equal(ready.data.plugin.marketplace_packaged, true);
  assert.equal(ready.data.plugin.skill_count, 10);
  assert.equal(ready.data.checks.find((check) => check.name === "plugin_manifest").ok, true);
  assert.equal(ready.data.checks.find((check) => check.name === "plugin_marketplace").ok, true);
  assert.equal(ready.data.checks.find((check) => check.name === "plugin_skills").ok, true);
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
  run(["install", "--root", root, "--json"]);
  run(["report", "--root", root, "--json"]);

  const dryRun = run(["uninstall", "--root", root, "--dry-run", "--json"]);
  assert.equal(dryRun.data.uninstall_plan.schema_version, "opennori/uninstall-plan-v1");
  assert.equal(dryRun.data.uninstall_plan.summary.will_write, 0);
  assert.equal(dryRun.data.uninstall_plan.actions.filter((action) => action.kind === "skill").length, 0);
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
  assert.equal(fs.existsSync(path.join(root, ".opennori", "manifest.json")), false);
  assert.equal(fs.existsSync(init.data.acceptance_path), true);
  assert.equal(fs.existsSync(init.data.evidence_path), true);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "architecture")), true);
  assert.equal(fs.existsSync(path.join(root, ".opennori", "reports", "opennori-self.report.md")), true);
});

test("uninstall include-state requires confirmation before removing OpenNori state", () => {
  const root = tempRoot();
  run(["init", "examples/opennori-self.json", "--root", root, "--json"]);
  run(["install", "--root", root, "--json"]);

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

test("upgrade previews and confirms manifest protocol and generated guidance refresh", () => {
  const root = tempRoot();
  run(["install", "--root", root, "--json"]);
  fs.writeFileSync(path.join(root, ".opennori", "protocol.md"), "old protocol\n");
  const manifestPath = path.join(root, ".opennori", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.opennori_version = "0.0.0";
  manifest.capabilities = ["acceptance-contract"];
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const dryRun = run(["upgrade", "--root", root, "--dry-run", "--json"]);
  assert.equal(dryRun.data.upgrade_plan.schema_version, "opennori/upgrade-plan-v1");
  assert.equal(dryRun.data.upgrade_plan.summary.would_write > 0, true);
  assert.equal(dryRun.data.upgrade_plan.summary.will_write, 0);
  assert.equal(dryRun.data.upgrade_plan.actions.find((action) => action.path === ".opennori/manifest.json").action, "update");
  assert.equal(dryRun.data.upgrade_plan.actions.find((action) => action.path === ".opennori/protocol.md").action, "overwrite");
  assert.equal(dryRun.data.upgrade_plan.actions.some((action) => action.path.startsWith(".agents/skills")), false);
  assert.equal(fs.readFileSync(path.join(root, ".opennori", "protocol.md"), "utf8"), "old protocol\n");

  const unconfirmed = spawnSync(process.execPath, [CLI, "upgrade", "--root", root, "--json"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  assert.equal(unconfirmed.status, 1);
  assert.equal(JSON.parse(unconfirmed.stdout).error.type, "confirm_required");

  const upgraded = run(["upgrade", "--root", root, "--confirm", "--json"]);
  assert.equal(upgraded.data.confirmed, true);
  assert.match(fs.readFileSync(path.join(root, ".opennori", "protocol.md"), "utf8"), /OpenNori Protocol/);
  const refreshedManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(refreshedManifest.opennori_version, PACKAGE_VERSION);
  assert.equal(refreshedManifest.plugin.packaged, true);
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
  run(["install", "--root", root, "--json"]);
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

test("missing architecture baseline is a completion review risk, not a product AC gap", () => {
  const root = tempRoot();
  const draft = run(["draft", "--goal", "Ship an architecture-aware user outcome", "--root", root, "--json"]);
  run(["approve", "--root", root, "--summary", "User approved criteria.", "--json"]);

  const payload = JSON.parse(fs.readFileSync(draft.data.evidence_path, "utf8"));
  for (const criterion of Object.keys(payload.ledger.criteria)) {
    run([
      "evidence", "add",
      "--root", root,
      "--criterion", criterion,
      "--kind", "test-summary",
      "--summary", `${criterion} has user-reviewable evidence.`,
      "--result", "passing",
      "--source-command", "opennori status --root . --json",
      "--source-path", ".opennori/reports/architecture-aware.report.md",
      "--reviewability", "Run status and inspect the report artifact.",
      "--limitations", "This fixture intentionally omits Architecture Baseline.",
      "--json"
    ]);
  }

  const status = run(["status", "--root", root, "--json"]);
  assert.equal(status.data.workflow_status, "complete");
  assert.equal(status.data.current_gap, null);
  assert.equal(status.data.architecture.decision, "missing");
  assert.equal(status.data.completion.objective_complete, true);
  assert.equal(status.data.completion.confidence, "review-risk");
  assert.equal(status.data.completion.review_risks.includes("architecture_review"), true);
  assert.equal(status.data.next_recommendation.status, "completion-review-required");
  assert.equal(status.data.next_recommendation.actions.some((action) => /architecture_check/.test(action)), true);
  assert.equal(status.data.criteria.some((criterion) => /^ARCH-/.test(criterion.id)), false);

  const report = run(["report", "--root", root, "--json"]);
  assert.match(fs.readFileSync(report.data.report_path, "utf8"), /Review risks: architecture_review/);
});

test("project architecture profiles can be added and used for baselines", () => {
  const root = tempRoot();
  run(["install", "--root", root, "--json"]);

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
  run(["install", "--root", root, "--json"]);
  const draft = run(["draft", "--goal", "Ship a reusable infrastructure choice", "--root", root, "--json"]);
  run(["approve", "--root", root, "--summary", "User approved criteria.", "--json"]);
  const payload = JSON.parse(fs.readFileSync(draft.data.evidence_path, "utf8"));
  for (const criterion of Object.keys(payload.ledger.criteria)) {
    run([
      "evidence", "add",
      "--root", root,
      "--criterion", criterion,
      "--kind", "test-summary",
      "--summary", `${criterion} has user-reviewable evidence.`,
      "--result", "passing",
      "--source-command", "opennori status --root . --json",
      "--source-path", ".opennori/reports/build-vs-buy.report.md",
      "--reviewability", "Run status and inspect the report artifact.",
      "--limitations", "This fixture focuses on build-vs-buy health.",
      "--json"
    ]);
  }
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

  const status = run(["status", "--root", root, "--json"]);
  assert.equal(status.data.current_gap, null);
  assert.equal(status.data.completion.objective_complete, true);
  assert.equal(status.data.completion.confidence, "review-risk");
  assert.equal(status.data.completion.review_risks.includes("build_vs_buy"), true);
  assert.equal(status.data.next_recommendation.status, "completion-review-required");
  assert.equal(status.data.next_recommendation.actions.some((action) => /build_vs_buy/.test(action)), true);
  assert.equal(status.data.criteria.some((criterion) => /^ARCH-/.test(criterion.id)), false);

  const report = run(["report", "--root", root, "--json"]);
  assert.equal(report.data.completion.confidence, "review-risk");
  assert.equal(report.data.completion.review_risks.includes("build_vs_buy"), true);
  assert.match(fs.readFileSync(report.data.report_path, "utf8"), /Review risks: build_vs_buy/);

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
  run(["install", "--root", root, "--json"]);
  run([
    "architecture", "build-vs-buy",
    "--root", root,
    "--id", "old-config-choice",
    "--area", "config",
    "--need", "Choose an earlier local configuration format",
    "--recommendation", "self-build",
    "--status", "superseded",
    "--superseded-by", "protocol-state-validation-ajv-runtime-public-json-schema",
    "--superseded-reason", "The confirmed Architecture Baseline now uses public JSON Schema for protocol state.",
    "--summary", "Old local config decision retained for history.",
    "--current-project", "Previous implementation used small local shape checks.",
    "--standard-library", "JSON.parse was available for syntax checks.",
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

test("criterion add preserves contract and ledger consistency", () => {
  const root = tempRoot();
  const init = run(["init", "examples/opennori-self.json", "--root", root, "--json"]);

  const added = run([
    "criterion", "add",
    "--root", root,
    "--id", "AC-Z-99",
    "--user-story", "作为用户，我能确认 OpenNori 是一个不可拆开的 agent capability bundle。",
    "--measurement", "阅读 README、Plugin 说明、Skill 边界和官网 Start 区域。",
    "--threshold", "主路径表达为安装和使用 OpenNori capability bundle，CLI 只作为 Skills 使用的 deterministic state layer 和高级/CI 入口。",
    "--summary", "User added the capability bundle boundary AC.",
    "--json"
  ]);

  assert.equal(added.data.criterion.id, "AC-Z-99");
  assert.equal(added.data.workflow_status, "active");

  const payload = JSON.parse(fs.readFileSync(init.data.evidence_path, "utf8"));
  assert.equal(payload.contract.criteria.some((criterion) => criterion.id === "AC-Z-99"), true);
  assert.equal(payload.ledger.criteria["AC-Z-99"].status, "unknown");

  const duplicate = spawnSync(process.execPath, [
    CLI,
    "criterion",
    "add",
    "--root", root,
    "--id", "AC-Z-99",
    "--user-story", "作为用户，我不会看到重复 AC。",
    "--measurement", "再次添加同一 id。",
    "--threshold", "命令失败。",
    "--json"
  ], {
    cwd: ROOT,
    encoding: "utf8"
  });
  assert.equal(duplicate.status, 1);
  const duplicatePayload = JSON.parse(duplicate.stdout || duplicate.stderr);
  assert.equal(duplicatePayload.ok, false);
  assert.equal(duplicatePayload.error.type, "unexpected_error");
  assert.match(duplicatePayload.error.message, /Criterion already exists/);
});

test("check reviews possible implementation details without rejecting the contract", () => {
  const root = tempRoot();
  const reviewBrief = path.join(root, "review.json");
  fs.writeFileSync(reviewBrief, JSON.stringify({
    goal_id: "review",
    goal: "Review example",
    criteria: [
      {
        id: "AC-1",
        user_story: "作为用户，我能看到 evidence.json 文件。",
        measurement: "检查文件",
        threshold: "文件存在"
      }
    ]
  }));

  const payload = run(["init", reviewBrief, "--root", root, "--json"]);
  assert.equal(payload.ok, true);

  const check = run(["check", "--root", root, "--json"]);
  assert.equal(check.ok, true);
  assert.equal(check.data.acceptance_review.status, "needs-user-review");
  assert.equal(check.warnings.some((warning) => warning.type === "acceptance_review" && warning.gap_id === "possible-implementation-detail"), true);
  assert.equal(check.warnings.some((warning) => /技术词是否是用户实际会看到/.test(warning.message)), true);
});

test("check reviews weak measurement and threshold semantics without hard failure", () => {
  const reviewRoot = tempRoot();
  const reviewBrief = path.join(reviewRoot, "review-quality.json");
  fs.writeFileSync(reviewBrief, JSON.stringify({
    goal_id: "review-quality",
    goal: "Review quality example",
    criteria: [
      {
        id: "AC-1",
        user_story: "作为用户，我能知道功能已经完成。",
        measurement: "测试通过",
        threshold: "字段存在"
      }
    ]
  }));

  const reviewPayload = run(["init", reviewBrief, "--root", reviewRoot, "--json"]);
  assert.equal(reviewPayload.ok, true);
  const reviewCheck = run(["check", "--root", reviewRoot, "--json"]);
  assert.equal(reviewCheck.data.acceptance_review.status, "needs-user-review");
  assert.equal(reviewCheck.warnings.some((warning) => warning.gap_id === "measurement-review-method-unclear"), true);
  assert.equal(reviewCheck.warnings.some((warning) => warning.gap_id === "threshold-user-outcome-unclear"), true);
  assert.equal(reviewCheck.warnings.some((warning) => warning.gap_id === "implementation-only-completion-signal"), true);

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
  assert.equal(check.data.acceptance_review.status, "needs-user-review");
  assert.equal(check.warnings.some((warning) => warning.gap_id === "missing-field-scope"), true);
  assert.equal(check.warnings.some((warning) => warning.gap_id === "missing-validation-rule"), true);
  assert.equal(check.warnings.some((warning) => warning.gap_id === "missing-success-signal"), true);
  assert.equal(check.warnings.some((warning) => warning.gap_id === "missing-failure-case"), true);
  assert.equal(check.next_actions.some((action) => /acceptance_review/.test(action)), true);
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
  assert.equal(goodCheck.data.acceptance_review.status, "clear");
  assert.equal(goodCheck.warnings.some((warning) => warning.type === "acceptance_review"), false);
  assert.equal(goodCheck.data.architecture_check.status, "needs-action");
});
