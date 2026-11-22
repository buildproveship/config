import { spawnSync } from "node:child_process";

/**
 * The environment git gives a hook (GIT_DIR, GIT_INDEX_FILE, ...) points git at this repo. A test suite that makes its
 * own temporary repos would then fail or touch the wrong one, so repo scripts run without it.
 * @param {NodeJS.ProcessEnv} env
 */
export function withoutGitEnv(env) {
  return Object.fromEntries(
    Object.entries(env).filter(([name]) => !name.startsWith("GIT_")),
  );
}

/**
 * Run a command with inherited output.
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string; env?: NodeJS.ProcessEnv }} [options]
 * @returns {number} the exit status; a command that cannot start counts as 1
 */
export function run(command, args, options = {}) {
  console.error(`> ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: options.cwd,
    env: options.env,
  });
  if (result.error) {
    console.error(`${command}: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

/**
 * Run a command and return its trimmed stdout.
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string }} [options]
 */
export function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    cwd: options.cwd,
  });
  return {
    status: result.error ? 1 : (result.status ?? 1),
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

/**
 * Print how long a hook took and warn when it is over its budget. The budget is advice, never a failure.
 * @param {string} hook
 * @param {number} startedAt Date.now() when the hook started
 * @param {number} budgetSeconds
 */
export function reportTime(hook, startedAt, budgetSeconds) {
  const seconds = Math.round((Date.now() - startedAt) / 1000);
  const note =
    seconds > budgetSeconds
      ? ` (over the ${budgetSeconds} s budget: tell the platform team)`
      : "";
  console.error(`${hook}: ${seconds} s${note}`);
}
