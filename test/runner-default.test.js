// Test classification: unit
// Review status: Not Reviewed
// Evidence: synthetic
// Scope: the shared workflows' runner input and runs-on expression read as text; no workflow run, no GitHub or AWS call.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (/** @type {string} */ name) =>
  readFileSync(`.github/workflows/${name}`, "utf8");

for (const name of [
  "reusable-ci.yml",
  "classify-changes.yml",
  "reusable-nightly.yml",
]) {
  test(`${name} defaults to the AWS runners and still accepts rr-local`, () => {
    const text = read(name);
    assert.match(
      text,
      /runner:\n(?:\s+description:[^\n]*\n)*(?:\s+description: >-\n(?:\s{10}[^\n]*\n)+)?\s+type: string\n\s+default: aws\n/,
    );
    assert.match(
      text,
      /inputs\.runner == 'aws' && format\('runs-on=\{0\}\/runner=4cpu-linux-x64', github\.run_id\) \|\| inputs\.runner/,
    );
  });
}

test("fork PRs never reach the AWS or Mac runners", () => {
  for (const name of ["reusable-ci.yml", "classify-changes.yml"]) {
    assert.match(
      read(name),
      /head\.repo\.full_name != github\.repository && 'ubuntu-24\.04' \|\|/,
    );
  }
});
