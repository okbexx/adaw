import fs from "node:fs";
import path from "node:path";
import { defineCommand } from "citty";
import { completionAnswer, currentGap, evidenceHealth, fail, intervention, nextRecommendation, ok, pathsForGoal, recomputeWorkflowStatus, syncAcceptanceMarkdown, writeJson } from "../../core.js";
import { architectureState, renderReportWithArchitecture } from "../../architecture.js";
import { refreshManifest } from "../../lifecycle.js";
import { type ActiveGoalRuntime, runJsonCommand } from "../runtime.ts";

export const reportCommand = defineCommand({
  meta: {
    name: "report",
    description: "Render a human-readable OpenNori acceptance report for the current goal."
  },
  args: {
    root: {
      type: "string",
      description: "Project root.",
      default: process.cwd()
    },
    goal: {
      type: "string",
      description: "Active goal id to inspect."
    },
    output: {
      type: "string",
      description: "Report output path."
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ args, data }) {
    const { contract, ledger, root } = data.loadPair();
    const output = path.resolve(args.output || pathsForGoal(root, contract.goal_id).reportPath);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, renderReportWithArchitecture(root, contract, ledger));
    refreshManifest(root);
    const recommendation = nextRecommendation(contract, ledger);
    return ok(
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
    );
  }
});

export async function runReportCommand(rawArgs: string[], { loadPair }: ActiveGoalRuntime) {
  return runJsonCommand(reportCommand, rawArgs, { loadPair });
}

export const archiveCommand = defineCommand({
  meta: {
    name: "archive",
    description: "Move a complete or blocked OpenNori goal out of active work and preserve its report."
  },
  args: {
    root: {
      type: "string",
      description: "Project root.",
      default: process.cwd()
    },
    goal: {
      type: "string",
      description: "Active goal id to archive."
    },
    force: {
      type: "boolean",
      description: "Allow overwriting an existing archive target.",
      default: false
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ args, data }) {
    const root = path.resolve(String(args.root || process.cwd()));
    const { contract, ledger, acceptancePath, evidencePath } = data.loadPair();
    recomputeWorkflowStatus(contract, ledger);
    if (ledger.status !== "complete" && ledger.status !== "blocked") {
      return fail("not_archivable", `Goal ${contract.goal_id} is ${ledger.status}`, "Only complete or blocked OpenNori goals can be archived.");
    }

    const archiveDir = ledger.status === "complete" ? "completed" : "blocked";
    const targetAcceptance = path.join(root, ".opennori", archiveDir, path.basename(acceptancePath));
    const targetEvidence = path.join(root, ".opennori", archiveDir, path.basename(evidencePath));
    const reportPath = pathsForGoal(root, contract.goal_id).reportPath;
    for (const target of [targetAcceptance, targetEvidence]) {
      if (fs.existsSync(target) && !args.force) {
        return fail("archive_target_exists", `Archive target exists: ${path.relative(root, target) || "."}`, "Pass --force or move the existing archive file.");
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
    return ok(
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
    );
  }
});

export async function runArchiveCommand(rawArgs: string[], { loadPair }: ActiveGoalRuntime) {
  return runJsonCommand(archiveCommand, rawArgs, { loadPair });
}
