// The buildproveship-code-quality skill ships in this package; every repo keeps a byte-identical copy at
// skills/buildproveship-code-quality/ plus a .claude/skills loader stub, and names it in AGENTS.md and CLAUDE.md.
// `releaseready-guardrails sync` writes the copy; the `skill-drift` rule fails when it differs.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const skillName = "buildproveship-code-quality";
// The skill was named releaseready-code-quality until the 23 Nov 2026 rename to BuildProveShip. The old name keeps
// loading through an alias stub; the old copy under skills/ is removed by sync and reported by skill-drift.
const oldSkillName = "releaseready-code-quality";
const oldSkillDir = `skills/${oldSkillName}`;
const oldStubPath = `.claude/skills/${oldSkillName}/SKILL.md`;
const skillDir = `skills/${skillName}`;
const stubPath = `.claude/skills/${skillName}/SKILL.md`;
const packageSkillDir = fileURLToPath(
  new URL(`../skill/${skillName}/`, import.meta.url),
);

/** @returns {Promise<Map<string, string>>} repo-relative path → content of the published skill */
async function publishedSkill() {
  /** @type {Map<string, string>} */
  const files = new Map();
  const entries = await readdir(packageSkillDir, {
    recursive: true,
    withFileTypes: true,
  });
  for (const entry of entries.filter((e) => e.isFile())) {
    const absolute = join(entry.parentPath, entry.name);
    const path = relative(packageSkillDir, absolute).split(sep).join("/");
    files.set(`${skillDir}/${path}`, await readFile(absolute, "utf8"));
  }
  return files;
}

/** @param {string} description the skill's frontmatter description */
function stub(description) {
  return `---
name: ${skillName}
description: ${description}
---

This is a loader stub. The skill lives at \`${skillDir}/SKILL.md\` (from the repo root), copied from
\`@buildproveship/config\`. Read that file and its \`references/\` and follow them. Never edit the copy here or there:
change it in the config repo and run \`npx releaseready-guardrails sync\`.
`;
}

/** @param {string} description the skill's frontmatter description */
function oldStub(description) {
  return `---
name: ${oldSkillName}
description: ${description}
---

This skill was renamed \`${skillName}\` (BuildProveShip rebrand, 23 Nov 2026). Read \`${skillDir}/SKILL.md\` (from the repo
root) and its \`references/\` and follow them. This alias keeps the old name loading; remove it once nothing refers to it.
`;
}

/** @param {Map<string, string>} skill */
function descriptionOf(skill) {
  const text = skill.get(`${skillDir}/SKILL.md`) ?? "";
  return /^description: (.*)$/m.exec(text)?.[1] ?? "";
}

/**
 * The files every repo must hold, with their exact content.
 *
 * @returns {Promise<Map<string, string>>}
 */
async function expectedFiles() {
  const skill = await publishedSkill();
  skill.set(stubPath, stub(descriptionOf(skill)));
  skill.set(oldStubPath, oldStub(descriptionOf(skill)));
  return skill;
}

/**
 * skill-drift: the repo's copy equals the published skill; AGENTS.md and CLAUDE.md point to it.
 *
 * @param {import("./rules.js").RepoFiles} repo
 * @returns {Promise<import("./rules.js").Finding[]>}
 */
export async function skillDrift(repo) {
  /** @type {import("./rules.js").Finding[]} */
  const findings = [];
  const expected = await expectedFiles();
  const present = new Set(repo.paths);
  for (const [path, content] of expected) {
    if (!present.has(path) || repo.read(path) !== content) {
      findings.push({
        rule: "skill-drift",
        path,
        line: 0,
        message: present.has(path)
          ? "differs from the skill published in @buildproveship/config: run `npx releaseready-guardrails sync`"
          : "missing: run `npx releaseready-guardrails sync`",
      });
    }
  }
  for (const path of repo.paths.filter((p) => p.startsWith(`${skillDir}/`))) {
    if (!expected.has(path)) {
      findings.push({
        rule: "skill-drift",
        path,
        line: 0,
        message:
          "not in the published skill: change the skill in the config repo, then run `npx releaseready-guardrails sync`",
      });
    }
  }
  if (present.has(`${oldSkillDir}/SKILL.md`)) {
    findings.push({
      rule: "skill-drift",
      path: `${oldSkillDir}/SKILL.md`,
      line: 0,
      message: `renamed to ${skillDir}: run \`npx releaseready-guardrails sync\` to remove the old copy`,
    });
  }
  for (const doc of ["AGENTS.md", "CLAUDE.md"]) {
    if (!present.has(doc) || !repo.read(doc).includes(`${skillDir}/SKILL.md`)) {
      findings.push({
        rule: "skill-drift",
        path: doc,
        line: 0,
        message: `must exist and point to ${skillDir}/SKILL.md (the rules block in the skill's references/checks.md)`,
      });
    }
  }
  return findings;
}

/**
 * Write the published skill and the loader stub into `root`, replacing any older copy.
 *
 * @param {string} root
 * @returns {Promise<string[]>} the paths written
 */
export async function syncSkill(root) {
  const expected = await expectedFiles();
  await rm(join(root, skillDir), { recursive: true, force: true });
  await rm(join(root, oldSkillDir), { recursive: true, force: true });
  for (const [path, content] of expected) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return [...expected.keys()];
}
