// Classification: integration; synthetic consumers and fake external commands; Not Reviewed.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { inc } from "semver";
import {
  planRepo,
  renderPr,
  renderCopilotSetup,
  loadRepos,
} from "../scripts/rollout.js";

/** @param {import("node:test").TestContext} t */
function workspace(t) {
  const root = mkdtempSync(join(tmpdir(), "rollout safety "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test("planner refuses newer or unsupported dependency ranges without proposing any edits", (t) => {
  const root = workspace(t);
  /** @type {import("semver").ReleaseType[]} */
  const levels = ["major", "minor", "patch"];
  for (const range of [
    ...levels.map((level) => `^${inc(loadRepos().release.slice(1), level)}`),
    "^invalid",
    "^4.0.0 || ^5.1.0",
    "file:../config",
  ]) {
    const before = JSON.stringify({
      devDependencies: { "@buildproveship/config": range },
    });
    writeFileSync(join(root, "package.json"), before);
    const plan = planRepo(
      root,
      { name: "synthetic", private: true },
      "a".repeat(40),
    );
    assert.deepEqual(plan.changes, [], range);
    assert.deepEqual(plan.actions, [], range);
    assert.match(plan.warnings.join("\n"), /refusing to replace/);
    assert.equal(readFileSync(join(root, "package.json"), "utf8"), before);
  }
});

test("private consumers without workflows can be planned and generated hooks have no fake diff", (t) => {
  const root = workspace(t);
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ scripts: { check: "true" } }),
  );
  const plan = planRepo(
    root,
    { name: "synthetic", private: true },
    "a".repeat(40),
  );
  assert.deepEqual(plan.warnings, []);
  assert.ok(plan.changes.some((c) => c.path === ".github/workflows/pr.yml"));
  assert.ok(plan.changes.every((c) => !c.path.startsWith(".husky/")));
  assert.deepEqual(plan.actions, [
    "npx --no-install releaseready-hooks install",
  ]);
  assert.equal(
    existsSync(join(root, ".github")),
    false,
    "planning stays read-only",
  );
});

/** @param {import("node:test").TestContext} t @param {string[]} args @param {string} scenario @param {Record<string, string>} [files] */
function cli(t, args, scenario, files = {}) {
  const root = workspace(t);
  const bin = join(root, "bin");
  mkdirSync(bin);
  const log = join(root, "calls.jsonl");
  // Every external command is replaced. Any unexpected command fails; these tests cannot clone, install or push.
  for (const command of ["gh", "git", "npm", "npx", "sh"]) {
    const path = join(bin, command);
    writeFileSync(
      path,
      `#!/usr/bin/env node
const fs=require('node:fs');
let a=process.argv.slice(2);const kind=${JSON.stringify(command)};
fs.appendFileSync(process.env.ROLLOUT_TEST_LOG,JSON.stringify([kind,...a])+'\\n');
if(kind==='git' && a[0]==='-c'){
 if(a[1]!=='credential.helper=!gh auth git-credential')process.exit(91);
 a=a.slice(2);
}
if(kind==='gh' && a[0]==='api'){console.log(JSON.stringify({object:{type:'commit',sha:'a'.repeat(40)}}));}
else if(kind==='gh' && a[0]==='pr' && a[1]==='list'){
 const s=process.env.ROLLOUT_TEST_SCENARIO;
 if(s==='fresh' && ['RRDPLAT-105-shared-hooks-and-ci','RRDPLAT-103-delivery-rules'].includes(a[a.indexOf('--head')+1])){console.log(JSON.stringify(a[a.indexOf('--state')+1]==='open'?[]:[{state:'CLOSED',url:'https://example.invalid/pr/old'}]));process.exit(0);}
 if(s==='query-error')process.exit(19);
 console.log(JSON.stringify(s==='open'?[{state:'OPEN',url:'https://example.invalid/pr/1'}]:s==='closed'?[{state:'CLOSED',url:'https://example.invalid/pr/1'}]:[]));
}else if(kind==='git' && a[0]==='check-ref-format'){
 try{process.stdout.write(require('node:child_process').execFileSync(process.env.ROLLOUT_TEST_REAL_GIT,a,{encoding:'utf8'}));}catch(error){process.exit(error.status || 1);}
}else if(kind==='git' && a[0]==='ls-remote'){
 if(process.env.ROLLOUT_TEST_SCENARIO==='orphan')console.log('a'.repeat(40)+' refs/heads/synthetic');
 }else if(kind==='git' && a[0]==='clone'){
 const dir=a.at(-1);fs.mkdirSync(dir,{recursive:true});
 for(const [p,text] of Object.entries(JSON.parse(process.env.ROLLOUT_TEST_FILES))){fs.mkdirSync(require('node:path').dirname(require('node:path').join(dir,p)),{recursive:true});fs.writeFileSync(require('node:path').join(dir,p),text);}
}else if(['managed','fresh'].includes(process.env.ROLLOUT_TEST_SCENARIO) && (
 (kind==='git' && ['checkout','add','commit','push'].includes(a[0])) ||
 (kind==='npm' && a.join(' ')==='install --ignore-scripts --no-audit --no-fund') ||
 (kind==='npx' && ['--no-install prettier --write package.json','--no-install releaseready-hooks install'].includes(a.join(' ')))
) ){}
else if(['managed','fresh'].includes(process.env.ROLLOUT_TEST_SCENARIO) && kind==='sh' && a[0]==='-c' && a[1]===process.env.ROLLOUT_TEST_CHECK){}
else if(['managed','fresh'].includes(process.env.ROLLOUT_TEST_SCENARIO) && kind==='gh' && a.join(' ')==='auth token'){console.log('synthetic-fixture-value');}
else if(['managed','fresh'].includes(process.env.ROLLOUT_TEST_SCENARIO) && kind==='gh' && a[0]==='pr' && a[1]==='create'){console.log('https://example.invalid/pr/2');}
else{console.error('unexpected external command: '+kind+' '+a.join(' '));process.exit(91);}
`,
    );
    chmodSync(path, 0o755);
  }
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
  );
  const result = spawnSync(
    process.execPath,
    [join(import.meta.dirname, "../scripts/rollout.js"), ...args],
    {
      encoding: "utf8",
      env: {
        ...env,
        PATH: `${bin}:${process.env["PATH"]}`,
        TMPDIR: root,
        ROLLOUT_TEST_LOG: log,
        ROLLOUT_TEST_SCENARIO: scenario,
        ROLLOUT_TEST_REAL_GIT: spawnSync("which", ["git"], {
          encoding: "utf8",
        }).stdout.trim(),
        ROLLOUT_TEST_FILES: JSON.stringify(files),
        ROLLOUT_TEST_CHECK:
          loadRepos().repos.find((repo) => repo.name === "test-management")
            ?.checkCommand ?? "",
      },
    },
  );
  return { ...result, calls: existsSync(log) ? readFileSync(log, "utf8") : "" };
}

test("invalid tasks and repository names fail before any external command", (t) => {
  for (const { args, message } of [
    { args: ["--apply", "--task", "delivry-rules"], message: "unknown task" },
    { args: ["--dry-run", "--repo", "typo-consumer"], message: "unknown repo" },
  ]) {
    const r = cli(t, args, "none");
    assert.notEqual(r.status, 0);
    assert.ok(r.stderr.includes(message));
    assert.equal(r.calls, "");
  }
});

test("reruns report an existing open PR without cloning or applying for either task", (t) => {
  for (const task of ["hooks", "delivery-rules"]) {
    const r = cli(
      t,
      ["--apply", "--task", task, "--repo", "test-management"],
      "open",
    );
    assert.equal(r.status, 0, r.stderr);
    assert.match(
      r.stdout,
      /existing PR \(not updated\): https:\/\/example.invalid\/pr\/1/,
    );
    assert.doesNotMatch(
      r.calls,
      /"clone"|"auth","token"|"push"|"install"|"create"/,
    );
  }
});

test("closed PRs, orphan branches and failed PR queries stop before consumer changes", (t) => {
  for (const scenario of ["closed", "orphan", "query-error"]) {
    const r = cli(t, ["--apply", "--repo", "test-management"], scenario);
    assert.notEqual(r.status, 0);
    assert.doesNotMatch(
      r.calls,
      /"clone"|"auth","token"|"push"|"install"|"create"/,
    );
    if (scenario === "closed") assert.match(r.stderr, /already closed/);
    if (scenario === "orphan") {
      assert.match(r.stderr, /branch exists without a PR/);
      assert.ok(r.calls.includes("credential.helper=!gh auth git-credential"));
    }
  }
});

const governanceRepo = loadRepos().repos.find(
  (repo) => repo.name === "test-management",
);
if (!governanceRepo) throw new Error("missing synthetic rollout target");
const oldSha = "b".repeat(40);
const managedPr = renderPr(governanceRepo, oldSha);
const managedSetup = renderCopilotSetup(oldSha);
const consumerFiles = {
  "package.json": JSON.stringify({ scripts: { check: "true" } }),
  ".github/workflows/pr.yml": managedPr,
  ".github/workflows/copilot-setup-steps.yml": managedSetup,
};

test("rollout CLI refuses custom checks, setup, permissions and runners before any mutation", (t) => {
  /** @type {Record<string, string>[]} */
  const cases = [
    {
      ".github/workflows/pr.yml": managedPr.replace(
        "workflows/reusable-ci.yml",
        "actions/install-gitleaks",
      ),
    },
    {
      ".github/workflows/pr.yml": managedPr.replace(
        /buildproveship\/config\/\.github\/workflows\/reusable-ci.yml@[a-f\d]{40}/,
        "shared-release-reference",
      ),
    },
    {
      ".github/workflows/extra.yml":
        "on: pull_request\njobs:\n  custom:\n    runs-on: [self-hosted, rr-local]\n    steps: [{run: 'echo domain-check'}]\n",
    },
    {
      ".github/workflows/pr.yml": managedPr.replace(
        "    uses:",
        "    steps: [{run: 'echo local-verify'}]\n    uses:",
      ),
    },
    {
      ".github/workflows/pr.yml": managedPr.replace(
        "  contents: read",
        "  contents: write",
      ),
    },
    {
      ".github/workflows/pr.yml": managedPr.replace(
        "    with:",
        "    with:\n      runner: custom-runner",
      ),
    },
    {
      ".github/workflows/copilot-setup-steps.yml": managedSetup.replace(
        "      - run: npm ci",
        "      - run: echo required-setup\n      - run: npm ci",
      ),
    },
    { ".github/workflows/pr.yml": "jobs: [invalid" },
  ];
  for (const changes of cases) {
    const result = cli(t, ["--apply", "--repo", "test-management"], "custom", {
      ...consumerFiles,
      ...changes,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /governance review required/);
    assert.match(result.stderr, /resolve the warnings/);
    assert.doesNotMatch(
      result.calls,
      /"checkout"|"auth","token"|"install"|"push"|"create"/,
    );
    assert.doesNotMatch(result.stdout, /^M |^A |^RUN /m);
  }
});

test("managed PR-only callers preserve triggers and can pass the real CLI planning boundary", (t) => {
  const root = workspace(t);
  const prOnly = managedPr.replace("  push:\n    branches: [main]\n", "");
  for (const [path, content] of Object.entries({
    ...consumerFiles,
    ".github/workflows/pr.yml": prOnly,
  })) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  const plan = planRepo(root, governanceRepo, "a".repeat(40));
  assert.deepEqual(plan.warnings, []);
  assert.equal(
    plan.changes.find((c) => c.path === ".github/workflows/pr.yml")?.after,
    prOnly.replaceAll(oldSha, "a".repeat(40)),
  );
  const result = cli(t, ["--apply", "--repo", "test-management"], "managed", {
    ...consumerFiles,
    ".github/workflows/pr.yml": prOnly,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /example.invalid\/pr\/2/);
  assert.match(result.calls, /"npm","install"/);
});

test("an explicit fresh branch supports a later attempt without reusing a closed branch", (t) => {
  const branch = "RRDPLAT-111-fixture-next-attempt";
  for (const task of ["hooks", "delivery-rules"]) {
    const args = ["--apply", "--task", task, "--repo", "test-management"];
    const closed = cli(t, args, "fresh");
    assert.notEqual(closed.status, 0);
    assert.doesNotMatch(closed.calls, /"clone"|"push"|"create"/);
    const result = cli(t, [...args, "--branch", branch], "fresh", {
      "package.json": JSON.stringify({ scripts: { check: "true" } }),
    });
    assert.equal(result.status, 0, result.stderr);
    const calls = result.calls
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.ok(
      calls.some((args) => args.join(" ") === `git checkout -b ${branch}`),
    );
    assert.ok(
      calls.some((args) => args.join(" ") === `git push -u origin ${branch}`),
    );
    assert.ok(
      calls.some(
        (args) =>
          args[0] === "gh" &&
          args[2] === "create" &&
          args[args.indexOf("--head") + 1] === branch,
      ),
    );
    assert.match(result.stdout, new RegExp(`Rollout branch: ${branch}`));
  }
});

test("custom branches retain closed and orphan refusal and reject invalid names before remote calls", (t) => {
  for (const scenario of ["closed", "orphan", "query-error"]) {
    const result = cli(
      t,
      [
        "--apply",
        "--repo",
        "test-management",
        "--branch",
        "RRDPLAT-111-existing",
      ],
      scenario,
    );
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(
      result.calls,
      /"clone"|"auth","token"|"push"|"install"|"create"/,
    );
  }
  for (const branch of ["main", "bad branch", "@{-1}"]) {
    const result = cli(
      t,
      ["--apply", "--repo", "test-management", "--branch", branch],
      "none",
    );
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.calls, /"gh"|"clone"|"ls-remote"|"push"/);
  }
});

test("a fresh branch request reuses active work on the default task branch", (t) => {
  const result = cli(
    t,
    ["--apply", "--repo", "test-management", "--branch", "RRDPLAT-111-fresh"],
    "open",
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /existing PR \(not updated\)/);
  assert.match(
    result.calls,
    /"--head","RRDPLAT-105-shared-hooks-and-ci","--state","open"/,
  );
  assert.doesNotMatch(result.calls, /"clone"|"push"|"create"/);
});
