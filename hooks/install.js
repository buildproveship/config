import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import husky from "husky";

const CLI = new URL("./cli.js", import.meta.url).pathname;
const HOOKS = ["pre-commit", "commit-msg", "pre-push"];

/**
 * Point git at Husky's hooks and write one `.husky/<hook>` file per shared hook. Meant for `"prepare"`.
 * @param {string} root the repo root
 */
export function install(root) {
  // CI and Docker builds have no use for hooks; HUSKY=0 skips too (handled by husky).
  if (process.env["CI"]) return 0;
  if (!existsSync(join(root, ".git"))) return 0;
  const previous = process.cwd();
  process.chdir(root);
  try {
    const problem = husky();
    if (problem) console.error(`husky: ${problem}`);
  } finally {
    process.chdir(previous);
  }
  mkdirSync(join(root, ".husky"), { recursive: true });
  for (const hook of HOOKS) {
    // The path from the repo root to this package's cli.js works wherever the package is hoisted, and in this repo.
    // `"$@"` passes git's arguments (the commit-msg file).
    writeFileSync(
      join(root, ".husky", hook),
      `node ${relative(root, CLI)} ${hook} "$@"\n`,
    );
  }
  return 0;
}
