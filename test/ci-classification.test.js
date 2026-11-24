// Classification: integration; actual workflow shell entry points with synthetic API responses; Not Reviewed.
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

const classifier = parse(
  readFileSync(
    new URL("../.github/workflows/classify-changes.yml", import.meta.url),
    "utf8",
  ),
);
const ci = parse(
  readFileSync(
    new URL("../.github/workflows/reusable-ci.yml", import.meta.url),
    "utf8",
  ),
);

/** @param {import("node:test").TestContext} t @param {Record<string, string>} [overrides] */
function classify(t, overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "classifier fixture "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [name, script] of Object.entries({
    gh: '#!/bin/sh\nprintf "%s\\n" "$*" > "$CALLS"\n[ "$API_FAILURE" = 0 ] || exit 17\nprintf "%s\\n" "$FILES"\n',
    grep: '#!/bin/sh\n[ "$GREP_FAILURE" = 0 ] || exit 2\nexec /usr/bin/grep "$@"\n',
  })) {
    writeFileSync(join(root, name), script);
    chmodSync(join(root, name), 0o755);
  }
  const output = join(root, "output");
  writeFileSync(output, "");
  const result = spawnSync(
    "bash",
    ["-c", classifier.jobs.classify.steps[0].run],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${root}:${process.env["PATH"]}`,
        GITHUB_OUTPUT: output,
        CALLS: join(root, "calls"),
        EVENT: "pull_request",
        REPO: "synthetic/consumer",
        PR: "1",
        PATTERN:
          classifier.on.workflow_call.inputs["docs-only-pattern"].default,
        FILES: "README.md\ndocs/guide with spaces.md",
        API_FAILURE: "0",
        GREP_FAILURE: "0",
        ...overrides,
      },
    },
  );
  return { ...result, output: readFileSync(output, "utf8") };
}

test("classifier errors never yield a docs-only success", (t) => {
  /** @type {Record<string, string>[]} */
  const failures = [
    { PATTERN: "[" },
    { API_FAILURE: "1" },
    { GREP_FAILURE: "1" },
  ];
  for (const overrides of failures) {
    const result = classify(t, overrides);
    assert.notEqual(result.status, 0, result.stderr);
    assert.equal(result.output, "docs_only=false\n");
  }
});

test("actual shared classifier distinguishes docs, code, renames and empty/non-PR diffs", (t) => {
  const docs = classify(t);
  assert.equal(docs.status, 0, docs.stderr);
  assert.equal(docs.output.trim().split("\n").at(-1), "docs_only=true");
  /** @type {Record<string, string>[]} */
  const nonDocs = [
    { FILES: "docs/readme.md\nsrc/code.ts" },
    { FILES: "docs/moved.ts\nsrc/original.ts" },
    { FILES: "" },
    { EVENT: "push" },
  ];
  for (const overrides of nonDocs) {
    const result = classify(t, overrides);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.output, "docs_only=false\n");
  }
});

test("required ci keeps failure behavior and reports docs-only checks as not run", () => {
  const run = ci.jobs.ci.steps[0].run;
  for (const results of [
    "failure skipped",
    "success failure",
    "success cancelled",
  ]) {
    assert.notEqual(
      spawnSync("bash", ["-c", run], {
        env: { ...process.env, RESULTS: results, DOCS_ONLY: "false" },
      }).status,
      0,
    );
  }
  const skipped = spawnSync("bash", ["-c", run], {
    encoding: "utf8",
    env: { ...process.env, RESULTS: "success skipped", DOCS_ONLY: "true" },
  });
  assert.equal(skipped.status, 0, skipped.stderr);
  assert.match(skipped.stdout, /checks were not run/);
  assert.equal(
    spawnSync("bash", ["-c", run], {
      env: { ...process.env, RESULTS: "success success", DOCS_ONLY: "false" },
    }).status,
    0,
  );
});

test("classification is toolchain-independent and wired to the same-commit shared workflow", () => {
  assert.equal(
    ci.jobs.changes.uses,
    "./.github/workflows/classify-changes.yml",
  );
  assert.equal(
    ci.jobs.changes.with["docs-only-pattern"],
    "${{ inputs.docs-only-pattern }}",
  );
  assert.equal(
    classifier.on.workflow_call.outputs.docs_only.value,
    "${{ jobs.classify.outputs.docs_only }}",
  );
  assert.equal(
    classifier.jobs.classify.outputs.docs_only,
    "${{ steps.diff.outputs.docs_only }}",
  );
  assert.deepEqual(classifier.permissions, { "pull-requests": "read" });
  assert.deepEqual(Object.keys(classifier.on), ["workflow_call"]);
  assert.equal(classifier.jobs.classify.steps.length, 1);
  assert.equal(classifier.jobs.classify.steps[0].shell, "bash");
  assert.doesNotMatch(
    classifier.jobs.classify.steps[0].run,
    /npm|checkout|uv sync/,
  );
  assert.equal(
    ci.jobs.checks.if,
    "${{ needs.changes.outputs.docs_only != 'true' }}",
  );
  assert.deepEqual(ci.jobs.ci.needs, ["changes", "checks"]);
});
