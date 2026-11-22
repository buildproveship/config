import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";
import { DOCS_ONLY_PATTERN } from "../hooks/paths.js";

const REPO = new URL("../", import.meta.url).pathname;
const CLI = join(REPO, "hooks/cli.js");
const ZERO = "0".repeat(40);

/** Environment for spawned git and hooks: no GIT_* (tests run inside the pre-push hook) and no CI. */
function cleanEnv() {
  /** @type {NodeJS.ProcessEnv} */
  const env = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith("GIT_") && name !== "CI") env[name] = value;
  }
  return env;
}

/**
 * @param {string} cwd
 * @param {string[]} args
 */
function git(cwd, ...args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: cleanEnv(),
  });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

/**
 * @param {string} cwd
 * @param {string} name
 * @param {string} content
 */
function write(cwd, name, content) {
  mkdirSync(join(cwd, name, ".."), { recursive: true });
  writeFileSync(join(cwd, name), content);
}

/**
 * A work clone with a bare origin that already has `main`, plus a second clone to move origin ahead.
 * @param {Record<string, string>} files committed on main
 */
function makeRepo(files = {}) {
  const base = mkdtempSync(join(tmpdir(), "rr-hooks-"));
  const origin = join(base, "origin.git");
  git(base, "init", "--bare", "--initial-branch=main", origin);
  /** @param {string} name */
  const clone = (name) => {
    const dir = join(base, name);
    git(base, "clone", "--quiet", origin, dir);
    git(dir, "config", "user.email", "test@example.com");
    git(dir, "config", "user.name", "Test");
    git(dir, "config", "commit.gpgsign", "false");
    git(dir, "config", "core.hooksPath", "/dev/null"); // the hooks under test are run by hand
    return dir;
  };
  const work = clone("work");
  git(work, "checkout", "--quiet", "-b", "main");
  write(
    work,
    "package.json",
    JSON.stringify({ name: "fixture", type: "module" }),
  );
  write(
    work,
    "eslint.config.js",
    'export default [{ files: ["**/*.js"], rules: { "no-undef": "error" } }];\n',
  );
  for (const [name, content] of Object.entries(files))
    write(work, name, content);
  git(work, "add", ".");
  git(work, "commit", "--quiet", "-m", "RRDPLAT-104: fixture");
  git(work, "push", "--quiet", "origin", "main");
  // eslint, prettier and lint-staged resolve from this repo's node_modules.
  symlinkSync(join(REPO, "node_modules"), join(work, "node_modules"));
  return { work, origin, clone };
}

/**
 * @param {string} cwd
 * @param {string} hook
 * @param {{ args?: string[]; input?: string; env?: NodeJS.ProcessEnv }} [options]
 */
function runHook(cwd, hook, options = {}) {
  const result = spawnSync(
    process.execPath,
    [CLI, hook, ...(options.args ?? [])],
    {
      cwd,
      encoding: "utf8",
      input: options.input ?? "",
      env: options.env ?? cleanEnv(),
    },
  );
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/** @param {string} cwd @param {string} ref */
const pushLine = (cwd, ref) =>
  `refs/heads/${ref} ${git(cwd, "rev-parse", "HEAD")} refs/heads/${ref} ${ZERO}\n`;

test("gitleaks is installed (the secret test must run, never skip)", () => {
  const result = spawnSync("gitleaks", ["version"], { encoding: "utf8" });
  assert.equal(
    result.status,
    0,
    "install gitleaks: brew install gitleaks, or see .github/actions/security-scan",
  );
});

test("pre-commit blocks a lint error and lets clean code through", () => {
  const { work } = makeRepo();
  write(work, "bad.js", "undefinedThing();\n");
  git(work, "add", "bad.js");
  const blocked = runHook(work, "pre-commit");
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.output, /no-undef/);

  git(work, "reset", "--quiet", "bad.js");
  write(work, "good.js", "export const answer = 42;\n");
  git(work, "add", "good.js");
  assert.equal(runHook(work, "pre-commit").status, 0);
});

test("pre-commit blocks a leaked secret", () => {
  const { work } = makeRepo();
  // Built at run time so this test file is not itself a finding in the repo's gitleaks scan.
  const token = ["ghp", "aB3dE5fG7hI9jK1lM3nO5pQ7rS9tU1vW3xY5"].join("_");
  write(work, "settings.js", `export const token = "${token}";\n`);
  git(work, "add", "settings.js");
  const blocked = runHook(work, "pre-commit");
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.output, /leaks found/);
  assert.doesNotMatch(
    blocked.output,
    new RegExp(token),
    "the token must be redacted",
  );
});

test("commit-msg blocks a subject with no Jira key", () => {
  const dir = mkdtempSync(join(tmpdir(), "rr-msg-"));
  /** @param {string} message */
  const check = (message) => {
    const file = join(dir, "COMMIT_EDITMSG");
    writeFileSync(file, `${message}\n\nbody\n`);
    return runHook(dir, "commit-msg", { args: [file] });
  };
  for (const ok of [
    "RRDPLAT-104: add hooks",
    "RRDSCRUM-450: cut CI",
    "RRDDOCS-7: page",
    'Revert "RRDPLAT-1: x"',
  ]) {
    assert.equal(check(ok).status, 0, ok);
  }
  for (const bad of [
    "add hooks",
    "rrdplat-104: add hooks",
    "RRDPLAT-104 add hooks",
    "RRDPLAT-104:add hooks",
    "RRDPLAT: add hooks",
    "",
  ]) {
    const result = check(bad);
    assert.notEqual(result.status, 0, bad);
    assert.match(result.output, /Jira key/);
  }
});

test("pre-push blocks a branch that is behind the latest origin/main, then passes once rebased", () => {
  const { work, clone } = makeRepo();
  git(work, "checkout", "--quiet", "-b", "feature");
  write(work, "feature.js", "export const a = 1;\n");
  git(work, "add", ".");
  git(work, "commit", "--quiet", "-m", "RRDPLAT-104: feature");

  const other = clone("other"); // somebody else lands a commit on main; `work` has not fetched it
  write(other, "other.js", "export const b = 2;\n");
  git(other, "add", ".");
  git(other, "commit", "--quiet", "-m", "RRDPLAT-1: other");
  git(other, "push", "--quiet", "origin", "main");

  const stale = runHook(work, "pre-push", { input: pushLine(work, "feature") });
  assert.notEqual(stale.status, 0);
  assert.match(stale.output, /not rebased on the latest origin\/main/);

  git(work, "rebase", "--quiet", "origin/main");
  assert.equal(
    runHook(work, "pre-push", { input: pushLine(work, "feature") }).status,
    0,
  );
});

test("pre-push blocks a direct push to main", () => {
  const { work } = makeRepo();
  const result = runHook(work, "pre-push", {
    input: `refs/heads/main ${git(work, "rev-parse", "HEAD")} refs/heads/main ${ZERO}\n`,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.output, /direct pushes to main are blocked/);
});

test("pre-push blocks a failing affected test and a failing type-check, and skips docs-only changes", () => {
  const { work } = makeRepo({
    "package.json": JSON.stringify({
      name: "fixture",
      type: "module",
      scripts: {
        "test:affected": "node affected.js",
        typecheck: "node typecheck.js",
      },
    }),
    "affected.js":
      'process.exit(process.argv.slice(2).includes("src/broken.js") ? 1 : 0);\n',
    "typecheck.js": 'process.exit(process.env["FAIL_TYPECHECK"] ? 1 : 0);\n',
  });
  /** @param {string} branch @param {string} file */
  const branchWith = (branch, file) => {
    git(work, "checkout", "--quiet", "-b", branch, "main");
    write(work, file, "export const a = 1;\n");
    git(work, "add", ".");
    git(work, "commit", "--quiet", "-m", "RRDPLAT-104: change");
    return pushLine(work, branch);
  };

  const failing = runHook(work, "pre-push", {
    input: branchWith("broken", "src/broken.js"),
  });
  assert.notEqual(failing.status, 0);
  assert.match(failing.output, /test:affected/);

  assert.equal(
    runHook(work, "pre-push", { input: branchWith("fine", "src/ok.js") })
      .status,
    0,
  );

  const typeError = runHook(work, "pre-push", {
    input: pushLine(work, "fine"),
    env: { ...cleanEnv(), FAIL_TYPECHECK: "1" },
  });
  assert.notEqual(typeError.status, 0);
  assert.match(typeError.output, /typecheck/);

  const docs = branchWith("docs", "README.md");
  assert.equal(
    runHook(work, "pre-push", {
      input: docs,
      env: { ...cleanEnv(), FAIL_TYPECHECK: "1" },
    }).status,
    0,
  );
});

test("install points git at Husky and writes the three hooks; CI skips it", () => {
  const { work } = makeRepo();
  assert.equal(
    runHook(work, "install", { env: { ...cleanEnv(), CI: "true" } }).status,
    0,
  );
  assert.equal(
    spawnSync("git", ["config", "core.hooksPath"], {
      cwd: work,
      encoding: "utf8",
    }).stdout.trim(),
    "/dev/null",
  );

  assert.equal(runHook(work, "install").status, 0);
  assert.equal(git(work, "config", "core.hooksPath"), ".husky/_");
  for (const hook of ["pre-commit", "commit-msg", "pre-push"]) {
    const text = readFileSync(join(work, ".husky", hook), "utf8");
    assert.ok(text.endsWith(`hooks/cli.js ${hook} "$@"\n`), text);
  }
  // The installed hook really runs: a bad subject is rejected through git itself.
  write(work, "x.js", "export const x = 1;\n");
  git(work, "add", "x.js");
  const commit = spawnSync("git", ["commit", "-m", "no key"], {
    cwd: work,
    encoding: "utf8",
    env: cleanEnv(),
  });
  assert.notEqual(commit.status, 0);
  assert.match(`${commit.stdout}${commit.stderr}`, /Jira key/);
});

/**
 * @param {string} file
 * @returns {{ on: Record<string, unknown>; jobs: Record<string, { if?: string; "runs-on": string; needs?: string; steps?: { run?: string; id?: string }[] }>; concurrency?: { "cancel-in-progress": boolean } }}
 */
function workflow(file) {
  return parse(readFileSync(join(REPO, file), "utf8"));
}

const FORK_GUARD =
  "${{ github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name != github.repository && 'ubuntu-24.04' || inputs.runner }}";

test("the reusable CI workflow keeps fork PRs off the self-hosted runner and skips drafts", () => {
  const ci = workflow(".github/workflows/reusable-ci.yml");
  const text = readFileSync(
    join(REPO, ".github/workflows/reusable-ci.yml"),
    "utf8",
  );
  assert.doesNotMatch(text, /pull_request_target/);
  assert.equal(ci.concurrency?.["cancel-in-progress"], true);
  const inputs =
    /** @type {{ workflow_call: { inputs: Record<string, { default: string }> } }} */ (
      ci.on
    ).workflow_call.inputs;
  assert.equal(inputs["runner"]?.default, "rr-local");
  assert.equal(inputs["docs-only-pattern"]?.default, DOCS_ONLY_PATTERN);
  for (const [name, job] of Object.entries(ci.jobs)) {
    assert.equal(job["runs-on"], FORK_GUARD, `${name} must use the fork guard`);
    // `checks` has no draft test of its own: it needs `changes`, and a skipped need skips it too.
    if (name !== "checks") {
      assert.match(
        job.if ?? "",
        /pull_request\.draft/,
        `${name} must skip drafts`,
      );
    }
  }
  assert.deepEqual(Object.keys(ci.jobs), ["changes", "checks", "ci"]);
  assert.equal(ci.jobs["checks"]?.needs, "changes");
});

test("the nightly workflow never runs for pull requests", () => {
  const nightly = workflow(".github/workflows/reusable-nightly.yml");
  assert.match(nightly.jobs["e2e"]?.if ?? "", /schedule/);
  assert.doesNotMatch(nightly.jobs["e2e"]?.if ?? "", /pull_request/);
  assert.equal(nightly.jobs["e2e"]?.["runs-on"], "${{ inputs.runner }}");
});

test("the caller templates run on ready PRs and main, and the Copilot job has the required name", () => {
  const pr = workflow("templates/workflows/pr.yml");
  const on =
    /** @type {{ pull_request: { types: string[] }; push: { branches: string[] } }} */ (
      pr.on
    );
  assert.ok(on.pull_request.types.includes("ready_for_review"));
  assert.deepEqual(on.push.branches, ["main"]);
  assert.ok(
    workflow("templates/copilot-setup-steps.yml").jobs["copilot-setup-steps"],
  );
  assert.ok(
    workflow(".github/workflows/copilot-setup-steps.yml").jobs[
      "copilot-setup-steps"
    ],
  );
});

test("the docs-only step skips checks for docs-only PRs and nothing else", () => {
  const ci = workflow(".github/workflows/reusable-ci.yml");
  const step = ci.jobs["changes"]?.steps?.find(
    (candidate) => candidate.id === "diff",
  );
  assert.ok(step?.run);
  const dir = mkdtempSync(join(tmpdir(), "rr-gh-"));
  const fakeGh = join(dir, "gh");
  writeFileSync(fakeGh, '#!/bin/sh\nprintf "%s\\n" "$FAKE_FILES"\n');
  chmodSync(fakeGh, 0o755);
  /** @param {string} event @param {string} files */
  const docsOnly = (event, files) => {
    const output = join(dir, "output");
    writeFileSync(output, "");
    const result = spawnSync("bash", ["-c", step.run ?? ""], {
      encoding: "utf8",
      env: {
        ...cleanEnv(),
        PATH: `${dir}:${process.env["PATH"]}`,
        FAKE_FILES: files,
        EVENT: event,
        REPO: "x/y",
        PR: "1",
        PATTERN: DOCS_ONLY_PATTERN,
        GITHUB_OUTPUT: output,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    return readFileSync(output, "utf8").trim();
  };
  assert.equal(
    docsOnly("pull_request", "README.md\ndocs/a/b.png"),
    "docs_only=true",
  );
  assert.equal(
    docsOnly("pull_request", "README.md\nsrc/a.ts"),
    "docs_only=false",
  );
  assert.equal(docsOnly("pull_request", ""), "docs_only=false");
  assert.equal(docsOnly("push", "README.md"), "docs_only=false");
});

test("the package ships the hooks bin and its files", () => {
  const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
  assert.equal(pkg.bin["releaseready-hooks"], "./hooks/cli.js");
  assert.ok(pkg.files.includes("hooks/*.js"));
  assert.ok(pkg.files.includes("templates"));
});
