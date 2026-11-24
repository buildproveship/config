import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";

/** @type {{ jobs: { publish: { steps: { name?: string, uses?: string, run?: string, with?: Record<string, unknown> }[] } } }} */
const workflow = parse(
  readFileSync(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  ),
);

test("release provenance shell accepts main history and fails closed on missing ancestry", (t) => {
  const root = mkdtempSync(join(tmpdir(), "release ancestry "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  );
  /** @param {string[]} args */
  const git = (args) =>
    execFileSync("git", args, {
      cwd: root,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git(["init", "-q"]);
  git(["config", "user.name", "Fixture"]);
  git(["config", "user.email", "fixture@example.invalid"]);
  writeFileSync(join(root, "source.txt"), "ancestor\n");
  git(["add", "."]);
  git(["commit", "-qm", "fixture: ancestor"]);
  const ancestor = git(["rev-parse", "HEAD"]);
  writeFileSync(join(root, "source.txt"), "main tip\n");
  git(["commit", "-qam", "fixture: main tip"]);
  const main = git(["rev-parse", "HEAD"]);
  git(["update-ref", "refs/remotes/origin/main", main]);
  const steps = workflow.jobs.publish.steps;
  const guardIndex = steps.findIndex(
    (step) => step.name === "Release commit belongs to main",
  );
  assert.equal(
    guardIndex,
    1,
    "provenance must run directly after checkout, before executing package code",
  );
  const guard = steps[guardIndex]?.run;
  assert.ok(guard);
  assert.equal(steps[0]?.with?.["fetch-depth"], 0);
  assert.equal(steps[0]?.with?.["persist-credentials"], false);
  /** @param {NodeJS.ProcessEnv} [extra] */
  const check = (extra = {}) =>
    spawnSync("bash", ["-e", "-c", guard], {
      cwd: root,
      env: { ...env, ...extra },
      encoding: "utf8",
    });
  assert.equal(check().status, 0, "main tip");
  git(["checkout", "--detach", ancestor]);
  assert.equal(
    check().status,
    0,
    "an earlier main ancestor remains releasable",
  );
  writeFileSync(join(root, "source.txt"), "divergent\n");
  git(["commit", "-qam", "fixture: divergent candidate"]);
  assert.notEqual(check().status, 0, "candidate outside main history");
  git(["checkout", "--detach", ancestor]);
  git(["update-ref", "-d", "refs/remotes/origin/main"]);
  assert.notEqual(check().status, 0, "missing main ref");
  git(["update-ref", "refs/remotes/origin/main", main]);
  const bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "git"),
    "#!/bin/sh\necho synthetic Git lookup failure >&2\nexit 73\n",
  );
  chmodSync(join(bin, "git"), 0o755);
  const failed = check({ PATH: `${bin}:${env.PATH}` });
  assert.equal(failed.status, 73);
  assert.match(failed.stderr, /synthetic Git lookup failure/);
});
