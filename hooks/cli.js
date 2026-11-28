#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { commitMsg } from "./commit-msg.js";
import { install } from "./install.js";
import { preCommit } from "./pre-commit.js";
import { prePush } from "./pre-push.js";
import { verifyClean } from "./verify-clean.js";
import { capture } from "./run.js";

const USAGE = `buildproveship-hooks <command>

  install               set up Husky and the three shared hooks (use as the "prepare" script)
  pre-commit            lint-staged, then gitleaks on the staged diff
  commit-msg <file>     require a Jira key at the start of the subject
  pre-push              rebased on origin/main, not main, type-check and affected tests
  verify                the same check the CI workflow runs: npm run check
  verify-clean          install and check committed HEAD in a disposable clone`;

const [command, ...rest] = process.argv.slice(2);
const root =
  capture("git", ["rev-parse", "--show-toplevel"]).stdout.trim() ||
  process.cwd();

switch (command) {
  case "install":
    process.exitCode = install(process.cwd());
    break;
  case "pre-commit":
    process.exitCode = preCommit(root);
    break;
  case "commit-msg":
    process.exitCode = commitMsg(rest[0] ?? ".git/COMMIT_EDITMSG");
    break;
  case "pre-push":
    process.exitCode = prePush(root, readFileSync(0, "utf8"));
    break;
  case "verify-clean":
    process.exitCode = verifyClean(root);
    break;
  case "verify":
    process.exitCode =
      spawnSync("npm", ["run", "check"], { cwd: root, stdio: "inherit" })
        .status ?? 1;
    break;
  default:
    console.error(USAGE);
    process.exitCode = command ? 2 : 0;
}
