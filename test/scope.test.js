import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The GitHub org and npm scope are buildproveship. History lives in CHANGELOG.md, docs/history/ and docs/findings/
// (the review notes keep the names the repos had when they were reviewed).
// `git grep` (tracked files only) is the platform tool for this; no library needed.
const OLD_SCOPE = ["@release", "ready"].join("");

test("no tracked file refers to the old npm scope outside history docs", () => {
  // git grep exits 1 when nothing matches, which is the passing case.
  const { stdout, status } = spawnSync(
    "git",
    [
      "grep",
      "-lI",
      "-e",
      OLD_SCOPE,
      "--",
      ".",
      ":!CHANGELOG.md",
      ":!docs/history",
      ":!docs/findings",
    ],
    { encoding: "utf8" },
  );
  assert.equal(status, 1, `old scope found in:\n${stdout}`);
});

test("package name uses the buildproveship scope", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.match(pkg.name, /^@buildproveship\//);
});
