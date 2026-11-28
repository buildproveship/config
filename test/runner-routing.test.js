// Test classification: integration
// Review status: Not Reviewed
// Evidence: synthetic
// Scope: the reusable CI route step's real shell script against stub `gh` output; no GitHub API, runner or AWS.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";

const ci = parse(
  readFileSync(
    new URL("../.github/workflows/reusable-ci.yml", import.meta.url),
    "utf8",
  ),
);
const script = ci.jobs.route.steps.find(
  (/** @type {{ id?: string }} */ step) => step.id === "pick",
).run;

const runners = (/** @type {object[]} */ list) =>
  JSON.stringify({ runners: list });
const mac = (/** @type {string} */ status, /** @type {boolean} */ busy) => ({
  status,
  busy,
  labels: [{ name: "self-hosted" }, { name: "rr-local" }],
});

/**
 * @param {import("node:test").TestContext} t
 * @param {Record<string, string>} env
 * @param {string} [ghOutput] what the stub `gh api` prints; omit for a failing gh
 */
function pick(t, env, ghOutput) {
  const root = mkdtempSync(join(tmpdir(), "route fixture "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, "gh"),
    ghOutput === undefined
      ? "#!/bin/sh\nexit 22\n"
      : `#!/bin/sh\ncat <<'JSON'\n${ghOutput}\nJSON\n`,
  );
  chmodSync(join(root, "gh"), 0o755);
  const output = join(root, "output");
  writeFileSync(output, "");
  const result = spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    env: {
      PATH: `${root}:${process.env["PATH"]}`,
      GITHUB_OUTPUT: output,
      RUNNER: "auto",
      LOCAL: "rr-local",
      SPOT: "",
      OWNER: "synthetic-org",
      FORK: "false",
      PRIVATE: "true",
      GH_TOKEN: "synthetic-token",
      ...env,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  const line = readFileSync(output, "utf8").trim();
  return JSON.parse(line.replace("runs-on=", ""));
}

test("a private repo uses the Mac when it is online and idle", (t) => {
  assert.deepEqual(pick(t, {}, runners([mac("online", false)])), ["rr-local"]);
});

test("a busy or offline Mac goes to the spot runner when one is set", (t) => {
  for (const state of [mac("online", true), mac("offline", false)])
    assert.deepEqual(pick(t, { SPOT: "ci-spot" }, runners([state])), [
      "ci-spot",
    ]);
});

test("without a spot runner a busy Mac falls back to hosted ubuntu", (t) => {
  assert.deepEqual(pick(t, {}, runners([mac("online", true)])), [
    "ubuntu-24.04",
  ]);
});

test("an unreadable runner list or a missing token counts as no idle Mac", (t) => {
  assert.deepEqual(pick(t, { SPOT: "ci-spot" }), ["ci-spot"]);
  assert.deepEqual(pick(t, { GH_TOKEN: "" }, runners([mac("online", false)])), [
    "ubuntu-24.04",
  ]);
});

test("fork PRs and public repos never reach the Mac or the spot runner", (t) => {
  const idle = runners([mac("online", false)]);
  assert.deepEqual(pick(t, { FORK: "true", SPOT: "ci-spot" }, idle), [
    "ubuntu-24.04",
  ]);
  assert.deepEqual(pick(t, { PRIVATE: "false", SPOT: "ci-spot" }, idle), [
    "ubuntu-24.04",
  ]);
});

test("a fixed runner is used as given, with no routing", (t) => {
  assert.deepEqual(pick(t, { RUNNER: "custom-runner" }, runners([])), [
    "custom-runner",
  ]);
});
