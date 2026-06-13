import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { packagePath } from "./package-root.ts";
import type { JsonObject } from "./types.ts";

const SKILLS_DIR = packagePath("skills");
const PREFERRED_SKILL_ORDER = [
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
];

export type SkillAsset = {
  name: string;
  description: string;
  asset_path: string;
  markdown: string;
};

function readSkillAsset(name: string): SkillAsset {
  const filePath = path.join(SKILLS_DIR, name, "SKILL.md");
  const markdown = fs.readFileSync(filePath, "utf8");
  const match = markdown.match(/^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    throw new Error(`OpenNori Skill ${name} is missing YAML frontmatter in ${filePath}`);
  }

  const frontmatter = (parseYaml(match[1] || "") || {}) as JsonObject;
  const skillName = String(frontmatter.name || "").trim();
  const description = String(frontmatter.description || "").trim();
  if (!skillName) throw new Error(`OpenNori Skill ${name} is missing frontmatter name`);
  if (!description) throw new Error(`OpenNori Skill ${name} is missing frontmatter description`);

  return {
    name: skillName,
    description,
    asset_path: filePath,
    markdown
  };
}

function skillAssetNames(): string[] {
  if (!fs.existsSync(SKILLS_DIR)) {
    throw new Error(`OpenNori Skill asset directory is missing: ${SKILLS_DIR}`);
  }

  const order = new Map(PREFERRED_SKILL_ORDER.map((name, index) => [name, index]));
  return fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(SKILLS_DIR, name, "SKILL.md")))
    .sort((left, right) => {
      const leftOrder = order.has(left) ? order.get(left) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
      const rightOrder = order.has(right) ? order.get(right) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return left.localeCompare(right);
    });
}

export const OPENNORI_SKILLS = skillAssetNames().map(readSkillAsset);
