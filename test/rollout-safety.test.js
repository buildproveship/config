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
import { planRepo } from "../scripts/rollout.js";

/** @param {import("node:test").TestContext} t */
function workspace(t) {
  const root = mkdtempSync(join(tmpdir(), "rollout safety "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test("planner refuses newer or unsupported dependency ranges without proposing any edits", (t) => {
  const root = workspace(t);
  for (const range of [
    "^5.1.0",
    "^4.3.0",
    "^4.2.1",
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

/** @param {import("node:test").TestContext} t @param {string[]} args @param {string} scenario */
function cli(t, args, scenario) {
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
 if(s==='query-error')process.exit(19);
 console.log(JSON.stringify(s==='open'?[{state:'OPEN',url:'https://example.invalid/pr/1'}]:s==='closed'?[{state:'CLOSED',url:'https://example.invalid/pr/1'}]:[]));
}else if(kind==='git' && a[0]==='ls-remote'){
 if(process.env.ROLLOUT_TEST_SCENARIO==='orphan')console.log('a'.repeat(40)+' refs/heads/synthetic');
}else{console.error('unexpected external command: '+kind+' '+a.join(' '));process.exit(91);}
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
