import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, resolve } from "node:path";
import husky from "husky";
import { capture } from "./run.js";
import { huskyConflict } from "./husky-conflict.js";

const CLI = fileURLToPath(new URL("./cli.js", import.meta.url));
export const HOOKS = ["pre-commit", "commit-msg", "pre-push"];

/**
 * Point git at Husky's hooks and write one `.husky/<hook>` file per shared hook. Meant for `"prepare"`.
 * @param {string} root the repo root
 */
export function install(root) {
  // CI and Docker builds have no use for hooks, and HUSKY=0 turns hooks off: write nothing in either case.
  if (process.env["CI"] || process.env["HUSKY"] === "0") return 0;
  if (!existsSync(join(root, ".git"))) return 0;
  // Preflight every destination before Husky changes core.hooksPath or creates wrappers.
  for (const directory of [".husky", ".husky/_"]) {
    if (
      lstatSync(join(root, directory), {
        throwIfNoEntry: false,
      })?.isSymbolicLink()
    ) {
      console.error(
        `install: preserving symlinked hook directory ${directory}`,
      );
      return 1;
    }
  }
  const cliPath = relative(root, CLI).replaceAll("'", "'\\''");
  const contents = new Map(
    HOOKS.map((hook) => [hook, `node '${cliPath}' ${hook} "$@"\n`]),
  );
  for (const hook of HOOKS) {
    const path = join(root, ".husky", hook);
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (!stat) continue;
    // Consumers of the released installer have the previous unquoted one-line wrapper; refresh only that exact file.
    const previous = `node ${relative(root, CLI)} ${hook} "$@"\n`;
    if (
      !stat.isFile() ||
      ![contents.get(hook), previous].includes(readFileSync(path, "utf8"))
    ) {
      console.error(
        `install: preserving custom hook ${path}; integrate it with the shared hook before installing`,
      );
      return 1;
    }
  }
  const active = capture("git", ["rev-parse", "--git-path", "hooks"], {
    cwd: root,
  });
  if (active.status !== 0 || !active.stdout?.trim()) {
    console.error("install: cannot determine active hooks; nothing changed");
    if (active.stderr) console.error(active.stderr);
    return 1;
  }
  const activePath = resolve(root, active.stdout.trim());
  const activeStat = lstatSync(activePath, { throwIfNoEntry: false });
  if (activeStat?.isSymbolicLink()) {
    console.error(
      `install: preserving symlinked active hook directory ${activePath}`,
    );
    return 1;
  }
  if (activePath !== resolve(root, ".husky/_") && activeStat?.isDirectory()) {
    const custom = readdirSync(activePath).filter(
      (name) => !name.endsWith(".sample"),
    );
    if (custom.length) {
      console.error(
        `install: preserving existing hooks in ${activePath}; integrate them before changing core.hooksPath`,
      );
      return 1;
    }
  }
  const conflict = huskyConflict(root);
  if (conflict) {
    console.error(
      `install: preserving custom Husky file ${conflict}; integrate it before installing`,
    );
    return 1;
  }
  const previous = process.cwd();
  process.chdir(root);
  try {
    const problem = husky();
    if (problem) {
      console.error(`husky: ${problem}`);
      return 1;
    }
  } finally {
    process.chdir(previous);
  }
  mkdirSync(join(root, ".husky"), { recursive: true });
  for (const hook of HOOKS) {
    // The path from the repo root to this package's cli.js works wherever the package is hoisted, and in this repo.
    // `"$@"` passes git's arguments (the commit-msg file).
    writeFileSync(join(root, ".husky", hook), contents.get(hook) ?? "");
  }
  return 0;
}
