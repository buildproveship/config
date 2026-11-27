// Classification: integration; the shared lint-staged ESLint command against a temporary repo that ignores a generated file; Not Reviewed.
// Evidence: synthetic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import config from "../hooks/lint-staged.config.js";

const source = fileURLToPath(new URL("../", import.meta.url));
const [eslintCommand] = config["*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"];

/**
 * @param {string} directory
 * @param {string} command
 */
function lint(directory, command) {
  const [bin, ...args] = command.split(" ");
  const result = spawnSync(
    join(source, "node_modules/.bin", bin),
    [...args.filter((arg) => arg !== "--fix"), "generated.js"],
    { cwd: directory, encoding: "utf8" },
  );
  // A missing binary is a broken test, never a lint result.
  assert.equal(result.error, undefined);
  return result;
}

test("A staged file the repo's ESLint config ignores does not fail the commit, and the guard is the flag", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "lint-staged-ignored-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(
    join(directory, "eslint.config.js"),
    'export default [{ ignores: ["generated.js"] }];\n',
  );
  writeFileSync(join(directory, "generated.js"), "export const x = 1;\n");
  const shared = lint(directory, eslintCommand);
  assert.equal(shared.status, 0, shared.stdout + shared.stderr);
  // Without the flag ESLint warns about the ignored file and --max-warnings 0 fails: the bug this prevents.
  const without = lint(
    directory,
    eslintCommand.replace(" --no-warn-ignored", ""),
  );
  assert.notEqual(without.status, 0);
  assert.match(without.stdout + without.stderr, /ignored/);
});

test("The shared command still fails on a real warning or error in a file ESLint does check", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "lint-staged-checked-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(
    join(directory, "eslint.config.js"),
    'export default [{ rules: { "no-undef": "error" }, languageOptions: { sourceType: "module" } }];\n',
  );
  writeFileSync(join(directory, "generated.js"), "missing();\n");
  assert.notEqual(lint(directory, eslintCommand).status, 0);
});
