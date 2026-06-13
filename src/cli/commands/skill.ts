import { defineCommand } from "citty";
import { fail, ok } from "../../core.js";
import { SKILL_PACK, skillMarkdown } from "../../skills.js";
import { runJsonCommand } from "../runtime.ts";

export const skillExportCommand = defineCommand({
  meta: {
    name: "export",
    description: "Export OpenNori Skills for agent installation."
  },
  args: {
    pack: {
      type: "boolean",
      description: "Export the full OpenNori Skill Pack.",
      default: false
    },
    name: {
      type: "string",
      description: "Export one Skill by name.",
      default: "nori"
    },
    json: {
      type: "boolean",
      description: "Keep deterministic JSON output for agents.",
      default: false
    }
  },
  run({ args }) {
    if (args.pack) {
      return ok({
        schema_version: "opennori/skill-pack-v1",
        skills: SKILL_PACK.map((skill) => ({
          name: skill.name,
          skill_md: skillMarkdown(skill)
        }))
      });
    }

    const skillName = args.name || "nori";
    const skill = SKILL_PACK.find((entry) => entry.name === skillName);
    if (!skill) {
      return fail("unknown_skill", `Unknown OpenNori Skill: ${skillName}`, `Use one of: ${SKILL_PACK.map((entry) => entry.name).join(", ")}`);
    }

    return ok({ skill_name: skill.name, skill_md: skillMarkdown(skill) });
  }
});

export async function runSkillExportCommand(rawArgs: string[]) {
  return runJsonCommand(skillExportCommand, rawArgs);
}
