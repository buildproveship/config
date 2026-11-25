// Test classification: integration
// Review status: Not Reviewed
// Evidence: synthetic
// Scope: runs the guardrails CLI in synthetic consumer repositories to check reason validation; it does not run real consumer repos.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { syncSkill } from "../guardrails/skill.js";

let root = "";
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "markdown reason consumer "));
  execFileSync("git", ["init", "-q"], { cwd: root });
  for (const name of ["AGENTS.md", "CLAUDE.md"]) {
    writeFileSync(
      join(root, name),
      "Read skills/buildproveship-code-quality/SKILL.md.\n",
    );
  }
  await syncSkill(root);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function run() {
  return spawnSync(
    process.execPath,
    [
      join(import.meta.dirname, "../guardrails/cli.js"),
      "--static",
      "--root",
      root,
    ],
    { encoding: "utf8" },
  );
}

test("CLI pairs fences by character and length and resumes scanning after the real close", () => {
  for (const newline of ["\n", "\r\n", "\r"]) {
    for (const opening of ["````js", "~~~~text"]) {
      const fence = opening.slice(0, 4);
      const other = fence[0] === "`" ? "~~~" : "```";
      const lines = [
        opening,
        other,
        "ReleaseReady",
        fence.slice(0, 3),
        "ReleaseReady",
        `${fence} trailing text`,
        "ReleaseReady",
        `  ${fence}${fence[0]}\t`,
        "ReleaseReady",
      ];
      writeFileSync(join(root, "README.md"), lines.join(newline));
      const result = run();
      assert.equal(result.status, 1, result.stderr + result.stdout);
      assert.match(result.stdout, /README.md:9 {2}old-brand/);
      assert.equal(result.stdout.split("  old-brand  ").length - 1, 1);
    }
  }
});

test("CLI keeps unmatched fences open and rejects invalid backtick info strings", () => {
  writeFileSync(join(root, "README.md"), "```js\n~~~\nReleaseReady\n");
  assert.equal(run().status, 0);
  writeFileSync(join(root, "README.md"), "```js`invalid\nReleaseReady\n");
  const result = run();
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.match(result.stdout, /README.md:2 {2}old-brand/);
});

test("CLI validates unpadded reasons for every exception setting", () => {
  for (const reason of [
    " ".repeat(20),
    "\t\n".repeat(20),
    "\u00a0".repeat(20),
    "    too short               ",
    "A named consumer needs this exception.",
    "  A named consumer needs this exception.  ",
  ]) {
    const valid = reason.trim().length >= 20;
    const configs = [
      { allow: [{ rule: "old-brand", path: "README.md", reason }] },
      { knip: { enabled: false, reason } },
      { fileLength: { maxLines: 1100, reason } },
      { fileLength: { generated: [{ path: "generated/**", reason }] } },
    ];
    for (const config of configs) {
      writeFileSync(
        join(root, "README.md"),
        "allow" in config ? "ReleaseReady\n" : "BuildProveShip\n",
      );
      writeFileSync(
        join(root, "releaseready-guardrails.json"),
        JSON.stringify(config),
      );
      const result = run();
      assert.equal(result.status, valid ? 0 : 1, result.stderr + result.stdout);
      if (!valid) assert.match(result.stderr, /releaseready-guardrails.json/);
    }
  }
});

test("CLI rejects leading-whitespace placeholders where the schema already forbids placeholders", () => {
  for (const reason of [
    "  TODO provide a proper reason",
    "\nBaseline this existing code temporarily",
  ]) {
    for (const config of [
      { allow: [{ rule: "old-brand", path: "README.md", reason }] },
      { fileLength: { generated: [{ path: "generated/**", reason }] } },
    ]) {
      writeFileSync(
        join(root, "releaseready-guardrails.json"),
        JSON.stringify(config),
      );
      const result = run();
      assert.equal(result.status, 1, result.stderr + result.stdout);
      assert.match(result.stderr, /must NOT be valid/);
    }
  }
});
