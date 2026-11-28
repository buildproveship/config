// Integration: actual hook installer and Git callers in disposable consumer repositories.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { withoutGitEnv } from "../hooks/run.js";

const cli = join(import.meta.dirname, "../hooks/cli.js");
const env = withoutGitEnv(process.env);
delete env["CI"];
delete env["HUSKY"];
let root = "";
/** @param {string[]} args */
function git(...args) {
  const result = spawnSync("git", args, { cwd: root, env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "consumer hooks "));
  git("init", "-q");
  git("config", "core.hooksPath", ".git/hooks");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.com");
  git("config", "commit.gpgsign", "false");
  mkdirSync(join(root, ".husky"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
/** @param {NodeJS.ProcessEnv} [extraEnv] */
function install(extraEnv = {}) {
  return spawnSync(process.execPath, [cli, "install"], {
    cwd: root,
    env: { ...env, ...extraEnv },
    encoding: "utf8",
  });
}

test("installer preflights every shared hook without partially writing earlier hooks", () => {
  for (const hook of ["pre-commit", "commit-msg", "pre-push"]) {
    const path = join(root, ".husky", hook);
    const original = "#!/bin/sh\nprintf 'consumer task'\n";
    writeFileSync(path, original);
    const result = install();
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /preserving custom hook/);
    assert.equal(readFileSync(path, "utf8"), original);
    assert.equal(git("config", "core.hooksPath"), ".git/hooks");
    assert.equal(existsSync(join(root, ".husky/_")), false);
    for (const other of ["pre-commit", "commit-msg", "pre-push"].filter(
      (name) => name !== hook,
    )) {
      assert.equal(existsSync(join(root, ".husky", other)), false);
    }
    rmSync(path);
  }
});

test("installer refuses to disable existing active hooks; a real commit still runs the consumer hook", () => {
  const custom = "consumer hooks";
  mkdirSync(join(root, custom));
  const original = "#!/bin/sh\nprintf kept > consumer-hook-ran\n";
  writeFileSync(join(root, custom, "pre-commit"), original, { mode: 0o755 });
  git("config", "core.hooksPath", custom);
  const result = install();
  assert.equal(result.status, 1, result.stderr);
  assert.equal(git("config", "core.hooksPath"), custom);
  assert.equal(
    readFileSync(join(root, custom, "pre-commit"), "utf8"),
    original,
  );
  git("commit", "--allow-empty", "-qm", "consumer fixture");
  assert.equal(readFileSync(join(root, "consumer-hook-ran"), "utf8"), "kept");
});

test("fresh and repeated installs refresh only known generated wrappers", () => {
  writeFileSync(
    join(root, ".husky/pre-commit"),
    `node ${relative(root, cli)} pre-commit "$@"\n`,
  );
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = install();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(git("config", "core.hooksPath"), ".husky/_");
  }
  const message = join(root, "message.txt");
  writeFileSync(message, "missing ticket\n");
  const result = spawnSync("sh", [".husky/commit-msg", message], {
    cwd: root,
    env,
    encoding: "utf8",
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Jira/);
});

test("installer preserves symlink destinations, including dangling links", () => {
  for (const exists of [false, true]) {
    const target = join(root, "consumer-script");
    if (exists) writeFileSync(target, "consumer data\n");
    symlinkSync(target, join(root, ".husky/pre-push"));
    assert.equal(install().status, 1);
    assert.equal(existsSync(target), exists);
    if (exists) assert.equal(readFileSync(target, "utf8"), "consumer data\n");
    // unlinkSync, not rmSync: Node 24.4 leaves a dangling symlink behind on rmSync, so the next loop pass hit EEXIST.
    unlinkSync(join(root, ".husky/pre-push"));
  }
});

test("installer preserves custom internal Husky wrappers before touching any managed file", () => {
  assert.equal(install().status, 0);
  const target = join(root, ".husky/_/pre-commit");
  const content = "#!/bin/sh\nprintf consumer\n";
  writeFileSync(target, content);
  const before = readFileSync(join(root, ".husky/_/h"));
  const result = install();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /preserving custom Husky file/);
  assert.equal(readFileSync(target, "utf8"), content);
  assert.deepEqual(readFileSync(join(root, ".husky/_/h")), before);
  assert.equal(git("config", "core.hooksPath"), ".husky/_");
});

test("managed-hook comparison cannot redirect Git into the consumer through inherited environment", () => {
  assert.equal(install().status, 0);
  git("config", "core.hooksPath", ".git/hooks");
  writeFileSync(join(root, ".husky/_/pre-commit"), "consumer content\n");
  const before = readFileSync(join(root, ".git/config"));
  const result = install({ GIT_DIR: join(root, ".git"), GIT_WORK_TREE: root });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /preserving custom Husky file/);
  assert.deepEqual(readFileSync(join(root, ".git/config")), before);
});
