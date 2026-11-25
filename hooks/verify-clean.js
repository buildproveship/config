import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { capture, run, withoutGitEnv } from "./run.js";

/**
 * Verify committed HEAD without borrowing untracked helpers or installed/generated files from the caller.
 * Reuse Git clone and npm ci rather than copying files or reconstructing npm's dependency/lifecycle rules.
 * This is a separate command: existing consumer pre-push and verify contracts remain unchanged.
 * @param {string} root
 * @returns {number}
 */
export function verifyClean(root) {
  const head = capture("git", ["rev-parse", "--verify", "HEAD^{commit}"], {
    cwd: root,
  });
  if (head.status !== 0) {
    console.error(
      `verify-clean: cannot resolve committed HEAD: ${head.stderr}`,
    );
    return 1;
  }
  const scratch = mkdtempSync(join(tmpdir(), "config-verify-clean-"));
  const checkout = join(scratch, "checkout");
  const env = withoutGitEnv(process.env);
  try {
    console.error(
      `verify-clean: checking committed HEAD ${head.stdout.trim()}`,
    );
    if (
      run(
        "git",
        ["clone", "--quiet", "--no-local", "--no-checkout", root, checkout],
        { env },
      ) !== 0
    )
      return 1;
    const options = { cwd: checkout, env };
    // Git clone does not inherit project config. Keep the caller's effective hook location so normal prepare
    // sees the same managed hooks, rather than accidentally switching to a different global hook directory.
    const hooks = capture("git", ["config", "--get", "core.hooksPath"], {
      cwd: root,
    });
    if (hooks.status === 0) {
      if (
        run(
          "git",
          [
            "config",
            "--local",
            "core.hooksPath",
            hooks.stdout.replace(/\n$/, ""),
          ],
          options,
        ) !== 0
      )
        return 1;
    } else if (hooks.status !== 1) {
      console.error(
        `verify-clean: cannot inspect hook configuration: ${hooks.stderr}`,
      );
      return 1;
    }
    if (
      run(
        "git",
        ["checkout", "--quiet", "--detach", head.stdout.trim()],
        options,
      ) !== 0
    )
      return 1;
    // A consumer check can inspect origin/main even when its local main branch is stale.
    const base = capture(
      "git",
      ["rev-parse", "--verify", "--quiet", "refs/remotes/origin/main"],
      { cwd: root },
    );
    if (base.status === 0) {
      if (
        run(
          "git",
          ["fetch", "--quiet", "origin", "refs/remotes/origin/main"],
          options,
        ) !== 0
      )
        return 1;
      // Only the disposable clone is updated; local main can be ahead of the fetched remote branch.
      if (
        run(
          "git",
          ["update-ref", "refs/remotes/origin/main", "FETCH_HEAD"],
          options,
        ) !== 0
      )
        return 1;
    } else if (base.status !== 1) {
      console.error(`verify-clean: cannot inspect origin/main: ${base.stderr}`);
      return 1;
    }
    if (
      !existsSync(join(checkout, "package-lock.json")) &&
      !existsSync(join(checkout, "npm-shrinkwrap.json"))
    ) {
      console.error(
        "verify-clean: a committed npm lockfile is required; nothing was installed",
      );
      return 1;
    }
    if (run("npm", ["ci"], options) !== 0) return 1;
    return run("npm", ["run", "check"], options);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
