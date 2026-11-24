// Classification: integration; synthetic temporary fixtures; Not Reviewed.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const fixtureRoot = mkdtempSync(join(tmpdir(), "config-security-scan-"));
after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

const script = new URL(
  "../.github/actions/security-scan/satisfies-identifier.py",
  import.meta.url,
).pathname;

/** @param {string} source */
function scan(source) {
  const dir = mkdtempSync(join(fixtureRoot, "satisfies-"));
  // Run from a git hook (pre-push), GIT_DIR is set and `git init` would rewrite the real repo's config.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
  );
  execFileSync("git", ["init", "-q"], { cwd: dir, env });
  writeFileSync(join(dir, "a.ts"), source);
  execFileSync("git", ["add", "a.ts"], { cwd: dir, env });
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
