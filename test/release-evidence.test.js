// Classification: integration; real npm CLI and synthetic Git evidence; Not Reviewed.
// No consumer execution, measurements, release, network or publication.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../scripts/check-release-evidence.js", import.meta.url),
);
test("release evidence checks real committed inputs through the npm entry point", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "release evidence "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  /** @param {string[]} args */
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "core.hooksPath", ".git/hooks");
  mkdirSync(join(root, "scripts"));
  writeFileSync(
    join(root, "scripts/rollout-repos.json"),
    JSON.stringify({
      repos: [{ name: "alpha" }, { name: "python", skip: "no npm" }],
    }),
  );
  /** @param {string} version */
  const commit = (version) => {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        version,
        scripts: { "release:evidence": `node "${script}"` },
      }),
    );
    git("add", ".");
    git("commit", "-qm", `version ${version}`);
    return git("rev-parse", "HEAD");
  };
  const base = commit("1.0.0");
  const minor = commit("1.1.0");
  const candidate = commit("2.0.0");
  const evidence = {
    baseCommit: base,
    candidateCommit: candidate,
    newRules: ["sample-rule"],
    consumers: ["alpha", "python"].map((name) => ({
      name,
      commit: base,
      command: "npm run check",
      evidenceUrl: "https://example.invalid/measurement",
      counts: { "sample-rule": 2 },
    })),
  };
  /** @param {unknown} value */
  const run = (value) => {
    writeFileSync(join(root, "measurement file.json"), JSON.stringify(value));
    return spawnSync(
      "npm",
      [
        "run",
        "--silent",
        "release:evidence",
        "--",
        "--evidence",
        "measurement file.json",
      ],
      { cwd: root, encoding: "utf8" },
    );
  };
  await t.test(
    "valid nonzero measurements render the table; dirty version does not replace committed version",
    () => {
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({
          version: "99.0.0",
          scripts: { "release:evidence": `node "${script}"` },
        }),
      );
      const result = run(evidence);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /1\.0\.0 → 2\.0\.0/);
      assert.match(result.stdout, /python.*sample-rule.*2/);
      assert.match(result.stdout, /Validated structure and major bump only/);
    },
  );
  for (const [name, value, message] of [
    [
      "minor bump",
      { ...evidence, candidateCommit: minor },
      /major version increase/,
    ],
    [
      "missing commit",
      { ...evidence, candidateCommit: "a".repeat(40) },
      /fatal/,
    ],
    [
      "reversed ancestry",
      { ...evidence, baseCommit: candidate, candidateCommit: base },
      /merge-base/,
    ],
    [
      "omitted skipped repo",
      { ...evidence, consumers: evidence.consumers.slice(0, 1) },
      /every inventory repo/,
    ],
    [
      "duplicate repo",
      {
        ...evidence,
        consumers: [evidence.consumers[0], evidence.consumers[0]],
      },
      /every inventory repo/,
    ],
    [
      "missing count",
      { ...evidence, newRules: ["sample-rule", "second-rule"] },
      /every new rule/,
    ],
    [
      "negative count",
      {
        ...evidence,
        consumers: evidence.consumers.map((row) => ({
          ...row,
          counts: { "sample-rule": -1 },
        })),
      },
      /must be >= 0/,
    ],
    [
      "credential URL",
      {
        ...evidence,
        consumers: evidence.consumers.map((row) => ({
          ...row,
          evidenceUrl: "https://name:password@example.invalid/log",
        })),
      },
      /without credentials/,
    ],
    ["empty evidence", {}, /required property/],
  ]) {
    await t.test(String(name), () => {
      const result = run(value);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /** @type {RegExp} */ (message));
    });
  }
});
