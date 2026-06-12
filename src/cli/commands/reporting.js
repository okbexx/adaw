import fs from "node:fs";
import path from "node:path";
import { defineCommand } from "citty";
import { completionAnswer, currentGap, evidenceHealth, intervention, nextRecommendation, ok, pathsForGoal } from "../../core.js";
import { architectureState, renderReportWithArchitecture } from "../../architecture.js";
import { refreshManifest } from "../../lifecycle.js";
import { runJsonCommand } from "../runtime.js";

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

export async function runReportCommand(rawArgs, { loadPair }) {
  return runJsonCommand(reportCommand, rawArgs, { loadPair });
}
