// Test classification: unit
// Review status: Not Reviewed
// Evidence: synthetic
// Scope: the workflow cost checker on synthetic YAML and on this repo's own workflows; no GitHub API or billing data.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkDirectory,
  findCostProblems,
} from "../scripts/check-workflow-cost.js";

const ok = `on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: "0 18 * * 0"
jobs:
  a:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
`;

test("a lean workflow passes", () => {
  assert.deepEqual(findCostProblems("ok.yml", ok), []);
});

test("each costly pattern is reported", () => {
  /** @type {[string, RegExp][]} */
  const cases = [
    [ok.replace("ubuntu-24.04", "macos-14"), /costly hosted runner/],
    [
      ok.replace("ubuntu-24.04", "ubuntu-latest-8-cores"),
      /costly hosted runner/,
    ],
    [ok.replace("    timeout-minutes: 10\n", ""), /timeout-minutes/],
    [
      ok.replace("    branches: [main]", "    paths: ['src/**']"),
      /branches or tags filter/,
    ],
    [ok.replace("0 18 * * 0", "30 18 * * *"), /more than weekly/],
  ];
  for (const [text, message] of cases) {
    assert.match(findCostProblems("bad.yml", text).join("\n"), message);
  }
});

test("self-hosted macOS and reusable-workflow calls are not flagged", () => {
  const selfHosted = ok.replace(
    "ubuntu-24.04",
    "[self-hosted, rr-local, macos]",
  );
  assert.deepEqual(findCostProblems("s.yml", selfHosted), []);
  const call =
    "on: pull_request\njobs:\n  ci:\n    uses: o/r/.github/workflows/x.yml@abc\n";
  assert.deepEqual(findCostProblems("c.yml", call), []);
});

test("this repository's own workflows pass", () => {
  assert.deepEqual(
    checkDirectory(new URL("../.github/workflows", import.meta.url).pathname),
    [],
  );
});
