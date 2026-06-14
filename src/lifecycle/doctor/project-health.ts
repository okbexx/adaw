import fs from "node:fs";
import path from "node:path";
import {
  REQUIRED_ARCHITECTURE_DIRS,
  architectureDir
} from "../../architecture.ts";
import { REQUIRED_NORI_DIRS } from "../shared.ts";
import type {
  ArchitectureState,
  DoctorCheck
} from "../../types.ts";
import { doctorCheck } from "./shared.ts";

export function projectHealthChecks(root: string): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const noriDir = path.join(root, ".opennori");
  const protocolPath = path.join(root, ".opennori", "protocol.md");

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  checks.push(doctorCheck(
    "node_runtime",
    nodeMajor >= 20,
    `Node runtime is ${process.version}.`,
    "Use Node.js 20 or newer."
  ));
  checks.push(doctorCheck(
    "opennori_directory",
    fs.existsSync(noriDir),
    fs.existsSync(noriDir) ? ".opennori directory exists." : ".opennori directory is missing.",
    "Run opennori init --root <project> --json to preview project initialization, or npx opennori setup to install the full capability bundle."
  ));

  for (const dir of REQUIRED_NORI_DIRS) {
    const dirPath = path.join(noriDir, dir);
    checks.push(doctorCheck(
      `dir_${dir}`,
      fs.existsSync(dirPath),
      fs.existsSync(dirPath) ? `.opennori/${dir} exists.` : `.opennori/${dir} is missing.`,
      "Run opennori init --root <project> --json to preview project initialization, or npx opennori setup to install the full capability bundle."
    ));
  }

  const architectureRoot = architectureDir(root);
  checks.push(doctorCheck(
    "dir_architecture",
    fs.existsSync(architectureRoot),
    fs.existsSync(architectureRoot) ? ".opennori/architecture exists." : ".opennori/architecture is missing.",
    "Run opennori init --root <project> --json to preview project initialization, or npx opennori setup to install the full capability bundle."
  ));
  for (const dir of REQUIRED_ARCHITECTURE_DIRS) {
    const dirPath = path.join(architectureRoot, dir);
    checks.push(doctorCheck(
      `dir_architecture_${dir}`,
      fs.existsSync(dirPath),
      fs.existsSync(dirPath) ? `.opennori/architecture/${dir} exists.` : `.opennori/architecture/${dir} is missing.`,
      "Run opennori init --root <project> --json to preview project initialization, or npx opennori setup to install the full capability bundle."
    ));
  }

  checks.push(doctorCheck(
    "protocol_file",
    fs.existsSync(protocolPath),
    fs.existsSync(protocolPath) ? ".opennori/protocol.md exists." : ".opennori/protocol.md is missing.",
    "Run opennori init --root <project> --json to preview project initialization, or npx opennori setup to install the full capability bundle."
  ));

  return checks;
}

export function architectureHealthChecks(architecture: ArchitectureState, baselineRequired: boolean): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const guideState = architecture.agent_surface.guide;
  checks.push(doctorCheck(
    "architecture_agent_guide",
    guideState.installed && guideState.in_sync,
    guideState.installed
      ? (guideState.in_sync ? ".opennori/agent-guide.md is installed and in sync." : ".opennori/agent-guide.md is stale.")
      : ".opennori/agent-guide.md is missing.",
    "Run opennori init --root <project> --json to preview project initialization, then rerun with --confirm if the planned refresh is acceptable."
  ));
  checks.push(doctorCheck(
    "architecture_agent_surface",
    true,
    architecture.agent_surface.agents.references_baseline || architecture.agent_surface.claude.references_baseline
      ? "At least one optional project agent route references the Architecture Baseline."
      : "No optional AGENTS.md or CLAUDE.md route references .opennori/architecture/baseline.md; Codex Plugin Skills remain the primary agent surface."
  ));
  checks.push(doctorCheck(
    "architecture_baseline",
    !baselineRequired || architecture.decision === "valid" || architecture.decision === "challenged",
    !baselineRequired
      ? "No active goal requires an Architecture Baseline yet."
      : architecture.baseline
        ? `Architecture Baseline decision is ${architecture.decision}.`
        : "Active goal has no Architecture Baseline.",
    "Run opennori architecture baseline --root <project> --goal <goal> --confirm --json before implementation, or resolve open architecture issues.",
    architecture.decision === "invalid" ? "broken" : "needs-action"
  ));
  checks.push(doctorCheck(
    "build_vs_buy_health",
    architecture.build_vs_buy.status === "clear",
    architecture.build_vs_buy.summary,
    "Run opennori architecture build-vs-buy with current project, standard library, official SDK, open-source candidates, and self-build reason where needed.",
    architecture.build_vs_buy.status === "broken" ? "broken" : "needs-action"
  ));

  return checks;
}
