import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const script = new URL(
  "../.github/actions/security-scan/satisfies-identifier.py",
  import.meta.url,
).pathname;

/** @param {string} source */
function scan(source) {
  const dir = mkdtempSync(join(tmpdir(), "satisfies-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  writeFileSync(join(dir, "a.ts"), source);
  execFileSync("git", ["add", "a.ts"], { cwd: dir });
  return spawnSync("python3", [script, dir], { encoding: "utf8" });
}

test("the security-scan step fails on satisfies used as an identifier", () => {
  for (const line of [
    "let satisfies: (a: string) => boolean;",
    "const satisfies = load();",
    "satisfies(version, range);",
    "function f(satisfies: Fn) {}",
  ]) {
    const result = scan(`${line}\n`);
    assert.equal(result.status, 1, line);
    assert.match(result.stderr, /a\.ts:1:/, line);
  }
});

test("the security-scan step allows the satisfies operator and mentions", () => {
  const result = scan(
    [
      "const config = {} satisfies Config;",
      'import ok from "semver/functions/satisfies";',
      '"Node satisfies the range."',
      "semver.satisfies(version, range);",
    ].join("\n") + "\n",
  );
  assert.equal(result.status, 0, result.stderr);
});
