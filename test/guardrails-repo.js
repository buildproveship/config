// Shared fixture for the guardrails tests: a throwaway git repo and the CLI path.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after } from "node:test";
import { syncSkill } from "../guardrails/skill.js";

const fixtureRoot = mkdtempSync(join(tmpdir(), "config-guardrails-"));
after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

export const cli = join(import.meta.dirname, "..", "guardrails", "cli.js");

/**
 * A throwaway git repo holding `files`, with the skill synced unless `skill` is false.
 *
 * @param {Record<string, string>} files
 * @param {{ skill?: boolean }} [options]
 */
export async function repo(files, options = {}) {
  const root = mkdtempSync(join(fixtureRoot, "guardrails-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  const all = {
    "AGENTS.md": "Read skills/buildproveship-code-quality/SKILL.md.\n",
    "CLAUDE.md": "Read skills/buildproveship-code-quality/SKILL.md.\n",
    ...files,
  };
  for (const [path, content] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  if (options.skill !== false) await syncSkill(root);
  return root;
}
