import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { run, reportTime } from "./run.js";

const require = createRequire(import.meta.url);
const SHARED_CONFIG = fileURLToPath(
  new URL("./lint-staged.config.js", import.meta.url),
);
const BUDGET_SECONDS = 10;

/**
 * A repo's own lint-staged config wins: a `lint-staged` key in package.json, `.lintstagedrc*` or `lint-staged.config.*`.
 * @param {string} root
 */
function hasOwnLintStagedConfig(root) {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if ("lint-staged" in pkg) return true;
  return readdirSync(root).some((name) =>
    /^(\.lintstagedrc|lint-staged\.config\.)/.test(name),
  );
}

/**
 * lint-staged (lint and format the staged files), then gitleaks on the staged diff.
 * @param {string} root the repo root
 */
export function preCommit(root) {
  const startedAt = Date.now();
  const configArgs =
    existsSync(join(root, "package.json")) && hasOwnLintStagedConfig(root)
      ? []
      : ["--config", SHARED_CONFIG];
  const lintStaged = run(
    process.execPath,
    [require.resolve("lint-staged/bin"), ...configArgs],
    { cwd: root },
  );
  if (lintStaged !== 0) return lintStaged;
  // `gitleaks git --staged` replaces the deprecated `gitleaks protect --staged`.
  const leaks = run(
    "gitleaks",
    ["git", "--staged", "--redact", "--no-banner", "--exit-code", "1"],
    { cwd: root },
  );
  reportTime("pre-commit", startedAt, BUDGET_SECONDS);
  return leaks;
}
