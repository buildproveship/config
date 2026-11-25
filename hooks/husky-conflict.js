import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, withoutGitEnv } from "./run.js";

/** Compare existing destinations with the pinned SDK's own output, without copying its generated templates.
 * @param {string} root
 * @returns {string | undefined}
 */
export function huskyConflict(root) {
  if (!lstatSync(join(root, ".husky/_"), { throwIfNoEntry: false }))
    return undefined;
  const staging = mkdtempSync(join(tmpdir(), "shared-hook-preflight-"));
  try {
    if (
      run("git", ["init", "-q", staging], {
        env: withoutGitEnv(process.env),
      }) !== 0
    ) {
      throw new Error(
        "install: cannot prepare managed-hook comparison; nothing changed",
      );
    }
    const generate = `import husky from ${JSON.stringify(import.meta.resolve("husky"))}; const problem = husky(); if (problem) throw new Error(problem);`;
    if (
      run(process.execPath, ["--input-type=module", "--eval", generate], {
        cwd: staging,
        env: withoutGitEnv(process.env),
      }) !== 0
    ) {
      throw new Error(
        "install: cannot generate managed-hook comparison; nothing changed",
      );
    }
    for (const name of readdirSync(join(staging, ".husky/_"))) {
      const destination = join(root, ".husky/_", name);
      const stat = lstatSync(destination, { throwIfNoEntry: false });
      if (
        stat &&
        (!stat.isFile() ||
          !readFileSync(destination).equals(
            readFileSync(join(staging, ".husky/_", name)),
          ))
      ) {
        return destination;
      }
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  return undefined;
}
