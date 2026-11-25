// Classification: integration; actual release Checks shell and synthetic Git fixtures; Not Reviewed.
// No tags, publication, consumers or hosted workflow dispatch.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { withoutGitEnv } from "../hooks/run.js";

const script = fileURLToPath(
  new URL("../scripts/check-release-policy.js", import.meta.url),
);
const workflow = parse(
  readFileSync(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  ),
);
const steps = workflow.jobs.publish.steps;
const command = steps.find(
  (/** @type {{name?: string}} */ step) => step.name === "Checks",
).run;

test("the actual release Checks shell gates stricter releases, leaving routine measurements optional", async (t) => {
  assert.ok(
    steps.findIndex(
      (/** @type {{name?: string}} */ step) => step.name === "Checks",
    ) <
      steps.findIndex(
        (/** @type {{name?: string}} */ step) => step.name === "Publish",
      ),
  );
  assert.equal(command, "npm run release:check && npm run check");
  const root = mkdtempSync(join(tmpdir(), "release gate "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = withoutGitEnv(process.env);
  /** @param {string[]} args */
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, env, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "core.hooksPath", ".git/hooks");
  mkdirSync(join(root, "scripts"));
  writeFileSync(
    join(root, "scripts/rollout-repos.json"),
    JSON.stringify({ repos: [{ name: "consumer" }] }),
  );
  /** @param {string} version */
  const packageVersion = (version) =>
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        version,
        scripts: {
          "release:check": `node "${script}"`,
          check: "node -e \"console.log('EXISTING_CHECK_RAN')\"",
        },
      }),
    );
  /** @param {string} message */
  const commit = (message = "synthetic release") => {
    git("add", ".");
    git("commit", "-qm", message);
    return git("rev-parse", "HEAD");
  };
  packageVersion("1.0.0");
  const base = commit();
  packageVersion("2.0.0");
  const measured = commit();
  const evidence = {
    baseCommit: base,
    candidateCommit: measured,
    newRules: ["sample"],
    consumers: [
      {
        name: "consumer",
        commit: base,
        command: "check sample",
        evidenceUrl: "https://example.invalid/log",
        counts: { sample: 1 },
      },
    ],
  };
  const plan = {
    version: "2.0.0",
    baseCommit: base,
    classification: "stricter-rules",
    rationale: "Synthetic new error-level rule",
    evidence,
  };
  const check = () =>
    spawnSync("bash", ["-c", command], { cwd: root, env, encoding: "utf8" });
  /** @param {unknown} declaration @param {boolean} stale @param {string | undefined} version */
  const run = (declaration, stale = false, version = undefined) => {
    git("reset", "--hard", measured);
    if (declaration !== undefined) {
      if (version) packageVersion(version);
      writeFileSync(
        join(root, "release-plan.json"),
        JSON.stringify(declaration),
      );
      if (stale)
        writeFileSync(join(root, "code.js"), "export const changed = true;\n");
      commit();
    }
    return check();
  };
  await t.test("complete stricter evidence permits existing checks", () => {
    const r = run(plan);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /EXISTING_CHECK_RAN/);
  });
  await t.test("routine declaration needs no measurements", () => {
    const r = run(
      {
        version: "1.1.0",
        baseCommit: base,
        classification: "routine",
        rationale: "Synthetic packaging-only release",
      },
      false,
      "1.1.0",
    );
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /measurements not required/);
    assert.match(r.stdout, /EXISTING_CHECK_RAN/);
  });
  for (const [label, declaration, stale] of [
    ["no declaration", undefined, false],
    ["unknown classification", { ...plan, classification: "unsure" }, false],
    ["no evidence", { ...plan, evidence: undefined }, false],
    [
      "missing count",
      { ...plan, evidence: { ...evidence, newRules: ["sample", "missing"] } },
      false,
    ],
    ["stale measured content", plan, true],
    ["wrong version", { ...plan, version: "1.0.0" }, false],
    ["blank rationale", { ...plan, rationale: " " }, false],
  ])
    await t.test(String(label), () => {
      const r = run(declaration, Boolean(stale));
      assert.notEqual(r.status, 0);
      assert.doesNotMatch(r.stdout, /EXISTING_CHECK_RAN/);
    });
  await t.test(
    "squashing a topic measurement fails; two squash PRs preserve a measured main ancestor",
    () => {
      git("switch", "-qc", "release-content", base);
      packageVersion("2.0.0");
      const topicCandidate = commit("topic release content");
      writeFileSync(
        join(root, "release-plan.json"),
        JSON.stringify({
          ...plan,
          evidence: { ...evidence, candidateCommit: topicCandidate },
        }),
      );
      commit("topic measurement plan");
      git("switch", "-qc", "release-main", base);
      git("merge", "--squash", "release-content");
      commit("squashed content and plan");
      const rejected = check();
      assert.notEqual(rejected.status, 0);
      assert.match(rejected.stderr, /merge-base --is-ancestor/);
      assert.doesNotMatch(rejected.stdout, /EXISTING_CHECK_RAN/);

      // Rebuild only this disposable history: first PR contains final release content, no plan.
      git("reset", "--hard", base);
      git("switch", "release-content");
      git("reset", "--hard", topicCandidate);
      git("switch", "release-main");
      git("merge", "--squash", "release-content");
      const mainCandidate = commit("first PR squash: finalized content");
      assert.notEqual(mainCandidate, topicCandidate);
      git("switch", "-qc", "release-plan");
      writeFileSync(
        join(root, "release-plan.json"),
        JSON.stringify({
          ...plan,
          evidence: { ...evidence, candidateCommit: mainCandidate },
        }),
      );
      commit("second PR: measured main evidence");
      git("switch", "release-main");
      git("merge", "--squash", "release-plan");
      commit("second PR squash: plan only");
      assert.equal(
        git("diff", "--name-only", mainCandidate, "HEAD"),
        "release-plan.json",
      );
      const accepted = check();
      assert.equal(accepted.status, 0, accepted.stderr);
      assert.match(accepted.stdout, /EXISTING_CHECK_RAN/);
      writeFileSync(join(root, "code.js"), "export const changed = true;\n");
      commit("later content must still invalidate evidence");
      const stale = check();
      assert.notEqual(stale.status, 0);
      assert.match(stale.stderr, /content changed after measurement/);
    },
  );
});
