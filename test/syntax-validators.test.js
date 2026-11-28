// Integration: guardrails CLI parses benign source fixtures without executing consumer code.
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { syncSkill } from "../guardrails/skill.js";

/** @param {Record<string, string>} files */
async function check(files) {
  const directory = mkdtempSync(join(tmpdir(), "syntax consumer "));
  try {
    execFileSync("git", ["init", "-q", directory]);
    await syncSkill(directory);
    for (const name of ["AGENTS.md", "CLAUDE.md"]) {
      writeFileSync(
        join(directory, name),
        "Read skills/buildproveship-code-quality/SKILL.md.\n",
      );
    }
    for (const [name, text] of Object.entries(files))
      writeFileSync(join(directory, name), text);
    return spawnSync(
      process.execPath,
      [
        join(import.meta.dirname, "../guardrails/cli.js"),
        "--root",
        directory,
        "--static",
      ],
      { encoding: "utf8" },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("CLI finds real suppression comments after regex literals and within interpolation/JSX", async () => {
  for (const source of [
    "const example = `\n// Not a real explanation\n`; // eslint-disable-line no-console\n",
    "const pattern = /[\"']/; // eslint-disable-line no-console\n",
    'const value = `${(() => { // eslint-disable-line no-console\n return "ok"; })()}`;\n',
    "const view = <div>{/* eslint-disable no-console */}text</div>;\n",
  ]) {
    const result = await check({ "source.tsx": source });
    assert.equal(result.status, 1, result.stderr + result.stdout);
    assert.match(result.stdout, /suppression-without-reason/);
  }
});

test("CLI ignores literal comment text and retains tolerant parsing and reason semantics", async () => {
  const result = await check({
    "source.tsx":
      "const a = `// eslint-disable no-console`;\nconst b = <div>// eslint-disable no-console</div>;\n// eslint-disable-next-line no-console -- 修复上游类型\nconst incomplete =\n",
  });
  assert.equal(result.status, 0, result.stderr + result.stdout);
});

test("CLI recognizes multiline skipped calls/options without increasing same-line allowlist counts", async () => {
  const blocked = await check({
    "sample.test.ts":
      'test\n .skip\n ("x", () => {});\ntest("y", {\n skip:\n true\n}, () => {});\n',
  });
  assert.equal(blocked.status, 1, blocked.stderr + blocked.stdout);
  assert.match(blocked.stdout, /sample.test.ts:1 {2}skipped-test/);
  assert.match(blocked.stdout, /sample.test.ts:5 {2}skipped-test/);
  const allowed = await check({
    "sample.test.ts": 'test.skip("x", { skip: true }, () => {});\n',
    "buildproveship-guardrails.json": JSON.stringify({
      allow: [
        {
          rule: "skipped-test",
          path: "sample.test.ts",
          max: 1,
          reason: "Synthetic caller verifies the existing count contract",
        },
      ],
    }),
  });
  assert.equal(allowed.status, 0, allowed.stderr + allowed.stdout);
});

test("CLI detects numeric warnings and multiline severities but preserves explanation groups", async () => {
  const blocked = await check({
    "eslint.config.js":
      'export default [{ rules: {\n "one": 1,\n "two": [1],\n "three": [\n "off"\n ],\n} }];\n',
  });
  assert.equal(blocked.status, 1, blocked.stderr + blocked.stdout);
  assert.equal(
    blocked.stdout.split("  eslint-rule-off-without-reason  ").length - 1,
    3,
  );
  const allowed = await check({
    "eslint.config.js":
      'throw new Error("This configuration must never execute");\nexport default [{ rules: {\n // Generated clients require these exceptions.\n "one": 1,\n "two": [\n "off"\n ],\n "three": [1],\n "four": "warn", // explained inline\n} }];\n',
  });
  assert.equal(allowed.status, 0, allowed.stderr + allowed.stdout);
});

test("CLI preserves namespaced skipped calls and distinguishes numeric rule severities from settings", async () => {
  const skipped = await check({
    "sample.test.ts":
      'nodeTest.test.skip("x", () => {});\nmocha.it.todo("x");\nframework.xit("x", () => {});\n',
  });
  assert.equal(skipped.status, 1, skipped.stderr + skipped.stdout);
  assert.equal(skipped.stdout.split("  skipped-test  ").length - 1, 3);
  const settings = await check({
    "eslint.config.js":
      'export default [{ settings: { max: 1 }, rules: { a: "0", b: "1", c: 2 } }];\n',
  });
  assert.equal(settings.status, 0, settings.stderr + settings.stdout);
});
