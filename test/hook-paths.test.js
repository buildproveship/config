// Classification: integration; synthetic consumer and package paths; Not Reviewed.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("installed hooks run through Git with spaces and shell characters in package paths", (t) => {
  const base = mkdtempSync(join(tmpdir(), "config hook paths "));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = join(base, "consumer's $workspace");
  const pkg = join(base, "shared package's $files");
  mkdirSync(root);
  mkdirSync(pkg);
  const repo = join(import.meta.dirname, "..");
  cpSync(join(repo, "hooks"), join(pkg, "hooks"), { recursive: true });
  writeFileSync(join(pkg, "package.json"), '{"type":"module"}');
  symlinkSync(join(repo, "node_modules"), join(pkg, "node_modules"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      type: "module",
      "lint-staged": { "*.js": "node --check" },
    }),
  );
  writeFileSync(join(root, "a.js"), "export const a = 1;\n");
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.startsWith("GIT_") && key !== "CI" && key !== "HUSKY",
    ),
  );
  /** @param {string} command @param {string[]} args */
  const run = (command, args) =>
    spawnSync(command, args, { cwd: root, env, encoding: "utf8" });
  for (const args of [
    ["init", "-q"],
    ["config", "core.hooksPath", ".git/hooks"], // isolate the synthetic consumer from machine-wide hooks
    ["config", "user.name", "Synthetic"],
    ["config", "user.email", "test@example.com"],
    ["config", "commit.gpgsign", "false"],
  ]) {
    assert.equal(run("git", args).status, 0);
  }
  const installed = run(process.execPath, [
    join(pkg, "hooks/cli.js"),
    "install",
  ]);
  assert.equal(installed.status, 0, installed.stderr);
  assert.equal(run("git", ["add", "."]).status, 0);
  const invalid = run("git", ["commit", "-m", "missing issue key"]);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /Jira/);
  const valid = run("git", [
    "commit",
    "-m",
    "RRDPLAT-111: synthetic path regression",
  ]);
  assert.equal(valid.status, 0, valid.stdout + valid.stderr);
});
