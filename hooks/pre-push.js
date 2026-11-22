import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isDocsOnly } from "./paths.js";
import { capture, reportTime, run, withoutGitEnv } from "./run.js";

const BUDGET_SECONDS = 120;
const ZERO_SHA = /^0+$/;

/**
 * @param {string} root
 * @returns {Record<string, string>} package.json scripts
 */
function readScripts(root) {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  return pkg.scripts ?? {};
}

/**
 * Block pushes that would skip the rules in "How we work". `refs` is what git writes to the hook's stdin:
 * "<local ref> <local sha> <remote ref> <remote sha>" per line.
 * @param {string} root the repo root
 * @param {string} refs
 */
export function prePush(root, refs) {
  const startedAt = Date.now();
  const pushes = refs
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [, localSha = "", remoteRef = ""] = line.split(" ");
      return { localSha, remoteRef };
    });

  if (pushes.some((push) => push.remoteRef === "refs/heads/main")) {
    console.error(
      "pre-push: direct pushes to main are blocked. Push a branch and open a pull request.",
    );
    return 1;
  }

  const toCheck = pushes.filter((push) => !ZERO_SHA.test(push.localSha)); // all-zero sha = branch deletion
  if (toCheck.length === 0) return 0;

  // Fetch first: the rebase check is only true against the latest main.
  const fetched = run("git", ["fetch", "--quiet", "origin", "main"], {
    cwd: root,
  });
  if (fetched !== 0) {
    console.error(
      "pre-push: could not fetch origin/main, so the rebase check cannot run.",
    );
    return 1;
  }

  for (const { localSha } of toCheck) {
    const stale = capture(
      "git",
      ["merge-base", "--is-ancestor", "origin/main", localSha],
      { cwd: root },
    );
    if (stale.status !== 0) {
      console.error(
        "pre-push: the branch is not rebased on the latest origin/main. Run: git rebase origin/main",
      );
      return 1;
    }
  }

  const { localSha } = toCheck[0] ?? { localSha: "HEAD" };
  const changed = capture(
    "git",
    ["diff", "--name-only", "origin/main", localSha],
    { cwd: root },
  )
    .stdout.split("\n")
    .filter(Boolean);
  if (changed.length === 0 || isDocsOnly(changed)) {
    reportTime("pre-push", startedAt, BUDGET_SECONDS);
    return 0;
  }

  const scripts = readScripts(root);
  const scriptOptions = { cwd: root, env: withoutGitEnv(process.env) };
  if (
    scripts["typecheck"] &&
    run("npm", ["run", "--silent", "typecheck"], scriptOptions) !== 0
  )
    return 1;

  // Affected tests: the repo's `test:affected` script gets the changed files; vitest has this built in
  // (`vitest related`). A repo with neither runs its whole `test` script, which must fit the budget.
  let tests = 0;
  if (scripts["test:affected"]) {
    tests = run(
      "npm",
      ["run", "--silent", "test:affected", "--", ...changed],
      scriptOptions,
    );
  } else if (scripts["test"]) {
    tests = run("npm", ["run", "--silent", "test"], scriptOptions);
  }
  reportTime("pre-push", startedAt, BUDGET_SECONDS);
  return tests === 0 ? 0 : 1;
}
