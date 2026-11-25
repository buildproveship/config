// Classification: integration; actual hooks CLI, Git and npm with disposable local fixtures; Not Reviewed.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { withoutGitEnv } from "../hooks/run.js";

const CLI = fileURLToPath(new URL("../hooks/cli.js", import.meta.url));
const env = withoutGitEnv(process.env);

/** @param {string} root @param {string[]} args */
function git(root, ...args) {
  const result = spawnSync("git", args, { cwd: root, env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

/** @param {import("node:test").TestContext} t */
function fixture(t) {
  const outer = mkdtempSync(join(tmpdir(), "clean verification "));
  t.after(() => rmSync(outer, { recursive: true, force: true }));
  const root = join(outer, "consumer with spaces");
  const scratch = join(outer, "temporary clones");
  mkdirSync(root);
  mkdirSync(scratch);
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  git(root, "config", "commit.gpgsign", "false");
  // Synthetic commits only: the real hook CLI is invoked explicitly below.
  git(root, "config", "core.hooksPath", join(outer, "empty-hooks"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "verification-fixture",
      version: "1.0.0",
      scripts: { prepare: "node build.cjs", check: "node check.cjs" },
    }),
  );
  writeFileSync(
    join(root, "package-lock.json"),
    JSON.stringify({
      name: "verification-fixture",
      version: "1.0.0",
      lockfileVersion: 3,
      packages: { "": { name: "verification-fixture", version: "1.0.0" } },
    }),
  );
  writeFileSync(join(root, ".gitignore"), "generated.json\nnode_modules/\n");
  writeFileSync(
    join(root, "build.cjs"),
    "require('node:fs').writeFileSync('generated.json', JSON.stringify({ok:true}));\n",
  );
  writeFileSync(
    join(root, "check.cjs"),
    "require('node:assert/strict').equal(JSON.parse(require('node:fs').readFileSync('generated.json')).ok, true);\n",
  );
  function commit() {
    git(root, "add", ".");
    git(root, "commit", "-m", "RRDPLAT-111: fixture");
  }
  commit();
  /** @param {string} command @param {NodeJS.ProcessEnv} [extra] */
  function invoke(command, extra = {}) {
    return spawnSync(process.execPath, [CLI, command], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...env,
        TMPDIR: scratch,
        TMP: scratch,
        TEMP: scratch,
        NODE_COMPILE_CACHE: join(outer, "node cache"),
        ...extra,
      },
    });
  }
  return { root, scratch, commit, invoke };
}

test("clean CLI bootstraps generated inputs, preserves fetched main and leaves caller files alone", (t) => {
  const { root, scratch, commit, invoke } = fixture(t);
  writeFileSync(join(root, "base.txt"), "fetched main\n");
  commit();
  const base = git(root, "rev-parse", "HEAD");
  git(root, "update-ref", "refs/remotes/origin/main", base);
  git(root, "switch", "-c", "topic");
  git(root, "branch", "-f", "main", "HEAD~1");
  writeFileSync(
    join(root, "check.cjs"),
    readFileSync(join(root, "check.cjs"), "utf8") +
      "require('node:assert/strict').equal(require('node:child_process').execFileSync('git',['show','origin/main:base.txt'],{encoding:'utf8'}).trim(),'fetched main');\n",
  );
  commit();
  writeFileSync(join(root, "generated.json"), "caller output must remain\n");
  writeFileSync(join(root, "untracked.txt"), "caller helper\n");
  const before = git(root, "status", "--porcelain");
  const config = readFileSync(join(root, ".git/config"), "utf8");
  const result = invoke("verify-clean", {
    GIT_DIR: join(root, ".git"),
    GIT_WORK_TREE: root,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(
    readFileSync(join(root, "generated.json"), "utf8"),
    "caller output must remain\n",
  );
  assert.equal(
    readFileSync(join(root, "untracked.txt"), "utf8"),
    "caller helper\n",
  );
  assert.equal(git(root, "status", "--porcelain"), before);
  assert.equal(readFileSync(join(root, ".git/config"), "utf8"), config);
  assert.deepEqual(readdirSync(scratch), []);
});

test("clean CLI rejects a test hidden by an untracked helper in ordinary verification", (t) => {
  const { root, scratch, commit, invoke } = fixture(t);
  writeFileSync(
    join(root, "check.cjs"),
    "require('node:fs').readFileSync('local-only.txt');\n",
  );
  commit();
  writeFileSync(join(root, "local-only.txt"), "not committed\n");
  assert.equal(invoke("verify").status, 0);
  const result = invoke("verify-clean");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /local-only.txt/);
  assert.equal(
    readFileSync(join(root, "local-only.txt"), "utf8"),
    "not committed\n",
  );
  assert.deepEqual(readdirSync(scratch), []);
});

test("clean CLI refuses an uncommitted lockfile and does not run the installer", (t) => {
  const { root, scratch, commit, invoke } = fixture(t);
  git(root, "rm", "package-lock.json");
  commit();
  writeFileSync(join(root, "package-lock.json"), "{}\n");
  const result = invoke("verify-clean");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /committed npm lockfile is required/);
  assert.doesNotMatch(result.stderr, /> npm ci/);
  assert.equal(existsSync(join(root, "generated.json")), false);
  assert.deepEqual(readdirSync(scratch), []);
});

test("clean CLI stops on normal lifecycle failure and cleans its disposable clone", (t) => {
  const { root, scratch, commit, invoke } = fixture(t);
  writeFileSync(join(root, "build.cjs"), "process.exit(17);\n");
  commit();
  const result = invoke("verify-clean");
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, /> npm run check/);
  assert.deepEqual(readdirSync(scratch), []);
});

test("clean CLI retains fetched main when the local main branch is ahead", (t) => {
  const { root, scratch, commit, invoke } = fixture(t);
  const base = git(root, "rev-parse", "HEAD");
  git(root, "update-ref", "refs/remotes/origin/main", base);
  git(root, "switch", "-c", "topic");
  writeFileSync(
    join(root, "check.cjs"),
    `require('node:assert/strict').equal(require('node:child_process').execFileSync('git',['rev-parse','origin/main'],{encoding:'utf8'}).trim(),'${base}');\n`,
  );
  commit();
  git(root, "branch", "-f", "main", "HEAD");
  const result = invoke("verify-clean");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(readdirSync(scratch), []);
});

test("clean CLI preserves the caller's managed hook location during normal prepare", (t) => {
  const { root, scratch, commit, invoke } = fixture(t);
  git(root, "config", "core.hooksPath", ".husky/_");
  writeFileSync(
    join(root, "build.cjs"),
    `require('node:child_process').execFileSync(process.execPath,[${JSON.stringify(CLI)},'install'],{stdio:'inherit'});\n` +
      readFileSync(join(root, "build.cjs"), "utf8"),
  );
  // Set the project hook location after the synthetic commit, so fixture creation does not invoke it.
  git(root, "config", "core.hooksPath", join(root, "empty-hooks"));
  commit();
  git(root, "config", "core.hooksPath", ".husky/_");
  const result = invoke("verify-clean");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(
    git(root, "config", "--local", "--get", "core.hooksPath"),
    ".husky/_",
  );
  assert.equal(existsSync(join(root, ".husky")), false);
  assert.deepEqual(readdirSync(scratch), []);
});
