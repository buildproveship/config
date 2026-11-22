#!/usr/bin/env node
// Rolls the shared Husky hooks and lean CI (RRDPLAT-104) out to every releaseready repo: one deterministic plan per
// repo, a dry run that lists it, and an apply step that opens one draft PR per repo (RRDPLAT-105).
//   node scripts/rollout.js --dry-run [--repo <name>]...
//   node scripts/rollout.js --apply --repo <name>
// Reuses: node:util.parseArgs (flags), `gh` (clone credentials, the release sha, the draft PR), `npm` (lockfile and
// install) and `releaseready-hooks install` (writes .husky/). Nothing here parses YAML: the workflow templates are
// copied as text so their comments survive.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { HOOKS } from "../hooks/install.js";

const CONFIG_ROOT = fileURLToPath(new URL("../", import.meta.url));
const BRANCH = "RRDPLAT-105-shared-hooks-and-ci";
const HOSTED = /^(\s*runs-on:\s*)ubuntu-[\w.-]+\s*$/gm;
const SELF_HOSTED = "[self-hosted, rr-local]";
const AGENTS_MARKER = "## Local hooks and CI";

/**
 * @typedef {{ name: string, private: boolean, checkCommand?: string, skip?: string }} Repo
 * @typedef {{ path: string, before: string | null, after: string | null }} Change
 */

/** @returns {{ release: string, repos: Repo[] }} */
export function loadRepos() {
  return JSON.parse(
    readFileSync(join(CONFIG_ROOT, "scripts/rollout-repos.json"), "utf8"),
  );
}

/** @param {string} path a path under this repo */
function template(path) {
  return readFileSync(join(CONFIG_ROOT, path), "utf8");
}

/**
 * The caller workflow: templates/workflows/pr.yml with the release sha filled in and, for a public repo or a repo
 * whose check is not `npm run check`, the reusable workflow's inputs.
 * @param {Repo} repo
 * @param {string} sha full commit sha of the release tag
 */
export function renderPr(repo, sha) {
  const inputs = [];
  if (!repo.private) inputs.push(`      runner: ubuntu-24.04`);
  if (repo.checkCommand)
    inputs.push(`      check-command: ${JSON.stringify(repo.checkCommand)}`);
  const text = template("templates/workflows/pr.yml")
    .replace(/^# Copy to .*\n/, "")
    .replace(/^# Replace <sha> .*\n/, "")
    .replace("<sha>", sha);
  return inputs.length > 0
    ? `${text.trimEnd()}\n    with:\n${inputs.join("\n")}\n`
    : text;
}

/**
 * templates/copilot-setup-steps.yml plus the gitleaks step the commit hooks need, taken from the released config action.
 * @param {string} sha
 */
export function renderCopilotSetup(sha) {
  const action = `releaseready/config/.github/actions/install-gitleaks@${sha}`;
  return (
    "# Runs before the Copilot coding agent starts, so it can run `npx releaseready-hooks verify` and its commit hooks.\n" +
    template("templates/copilot-setup-steps.yml")
      .replace(/^(#.*\n)+/, "")
      // The pre-commit hook needs gitleaks, which a hosted runner does not have.
      .replace(
        "      - run: npm ci",
        `      - uses: ${action}\n      - run: npm ci`,
      )
  );
}

/**
 * @param {Repo} repo
 * @param {boolean} ignoreScripts the repo's .npmrc sets ignore-scripts=true
 */
function agentsNote(repo, ignoreScripts) {
  const lines = [
    AGENTS_MARKER,
    "",
    "- Husky runs the shared hooks from `@releaseready/config` (`releaseready-hooks`): pre-commit (lint-staged, gitleaks), commit-msg (Jira key) and pre-push (never `main`, rebased, type-check, affected tests). Never use `--no-verify` or `HUSKY=0`.",
    ignoreScripts
      ? "- `.npmrc` sets `ignore-scripts=true`, so `prepare` does not run on `npm install`: run `npx releaseready-hooks install` once per clone."
      : "- `npm install` installs the hooks through the `prepare` script.",
    `- CI is one required check, \`ci\`, from the reusable workflow in \`releaseready/config\`; it runs \`${repo.checkCommand ?? "npm run check"}\`. Run the same command locally before you push.`,
    repo.private
      ? "- Workflows run on the self-hosted `rr-local` runner."
      : "- This repo is public, so its workflows run on GitHub-hosted `ubuntu-24.04` (a public repo never uses the self-hosted runner).",
  ];
  return `${lines.join("\n")}\n`;
}

/**
 * Everything the rollout changes in one checked-out repo, as before/after file contents. Reads only; the caller writes.
 * @param {string} dir the repo's working tree
 * @param {Repo} repo
 * @param {string} sha
 * @returns {{ changes: Change[], warnings: string[] }}
 */
export function planRepo(dir, repo, sha) {
  /** @type {Change[]} */
  const changes = [];
  /** @type {string[]} */
  const warnings = [];
  /** @param {string} path */
  const read = (path) =>
    existsSync(join(dir, path)) ? readFileSync(join(dir, path), "utf8") : null;
  /**
   * @param {string} path
   * @param {string | null} after
   */
  const put = (path, after) => {
    const before = read(path);
    if (before !== after) changes.push({ path, before, after });
  };

  const packageText = read("package.json");
  if (packageText === null) {
    warnings.push("no package.json");
    return { changes, warnings };
  }
  const pkg = JSON.parse(packageText);
  const release = loadRepos().release.slice(1);
  pkg.devDependencies = {
    ...pkg.devDependencies,
    "@releaseready/config": `^${release}`,
  };
  pkg.devDependencies = Object.fromEntries(
    Object.entries(pkg.devDependencies).sort(([a], [b]) => a.localeCompare(b)),
  );
  if (pkg.dependencies?.["@releaseready/config"])
    warnings.push(
      "@releaseready/config is also in dependencies; left as is, remove one",
    );
  const prepare = "releaseready-hooks install";
  pkg.scripts ??= {};
  if (pkg.scripts.prepare && pkg.scripts.prepare !== prepare)
    warnings.push(
      `scripts.prepare is "${pkg.scripts.prepare}"; left as is, chain the hooks install by hand`,
    );
  else pkg.scripts.prepare = prepare;
  if (!pkg.scripts.check && !repo.checkCommand)
    warnings.push(
      "no `check` script and no checkCommand in rollout-repos.json: `releaseready-hooks verify` would fail",
    );
  put("package.json", `${JSON.stringify(pkg, null, 2)}\n`);

  for (const hook of HOOKS)
    put(`.husky/${hook}`, `(written by releaseready-hooks install)\n`);

  put(".github/workflows/pr.yml", renderPr(repo, sha));
  put(".github/workflows/copilot-setup-steps.yml", renderCopilotSetup(sha));
  if (repo.private) {
    for (const file of readdirSync(join(dir, ".github/workflows")))
      if (file !== "pr.yml" && file !== "copilot-setup-steps.yml") {
        const path = `.github/workflows/${file}`;
        const before = read(path) ?? "";
        put(path, before.replace(HOSTED, `$1${SELF_HOSTED}`));
      }
  }

  const agents = read("AGENTS.md") ?? "# Agent instructions\n";
  if (!agents.includes(AGENTS_MARKER)) {
    const ignoreScripts = /^ignore-scripts\s*=\s*true/m.test(
      read(".npmrc") ?? "",
    );
    put(
      "AGENTS.md",
      `${agents.trimEnd()}\n\n${agentsNote(repo, ignoreScripts)}`,
    );
  }
  return { changes, warnings };
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} [options]
 */
function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    ...options,
  }).trim();
}

/**
 * @param {string} name
 * @param {string} into
 */
function clone(name, into) {
  const dir = join(into, name);
  run("git", [
    "-c",
    "credential.helper=!gh auth git-credential",
    "clone",
    "--quiet",
    `https://github.com/releaseready/${name}.git`,
    dir,
  ]);
  return dir;
}

/**
 * The full commit sha of the release tag, from the tag ref (dereferencing an annotated tag).
 * @param {string} tag
 */
function releaseSha(tag) {
  const ref = JSON.parse(
    run("gh", ["api", `repos/releaseready/config/git/ref/tags/${tag}`]),
  ).object;
  return ref.type === "tag"
    ? JSON.parse(
        run("gh", ["api", `repos/releaseready/config/git/tags/${ref.sha}`]),
      ).object.sha
    : ref.sha;
}

/**
 * @param {Repo} repo
 * @param {Change[]} changes
 */
export function prBody(repo, changes) {
  const files = changes.map(({ path }) => `- \`${path}\``).join("\n");
  const runner = repo.private
    ? "Workflows run on the self-hosted `rr-local` runner (the default of the reusable workflow)."
    : "**Justified exception:** this repo is public, and the org runner group keeps public repos off `rr-local` so fork code never runs on the owner's Mac. Workflows stay on `ubuntu-24.04` (owner decision, RRDPLAT-105, 22 Nov 2026).";
  return `RRDPLAT-105. Generated by \`scripts/rollout.js\` in releaseready/config; no application code changes.

${runner}

Changed files:
${files}

Not changed: scheduled and manual workflows other than \`pr.yml\` keep their own steps. The old pull-request security job is dropped: the pre-commit hook runs gitleaks and the reusable workflow runs the one \`ci\` check.

🤖 Generated with [Claude Code](https://claude.com/claude-code)`;
}

/**
 * @param {string} dir
 * @param {Repo} repo
 * @param {Change[]} changes
 * @param {string} work scratch directory for the npm auth file
 */
function apply(dir, repo, changes, work) {
  const git = (/** @type {string[]} */ ...args) =>
    run("git", args, { cwd: dir });
  git("checkout", "-b", BRANCH);
  for (const { path, after } of changes)
    if (!path.startsWith(".husky/") && after !== null) {
      mkdirSync(join(dir, path, ".."), { recursive: true });
      writeFileSync(join(dir, path), after);
    }
  // GitHub Packages needs a token to resolve @releaseready/config, even though the package is public.
  const userconfig = join(work, "npmrc");
  writeFileSync(
    userconfig,
    `//npm.pkg.github.com/:_authToken=${run("gh", ["auth", "token"])}\n`,
    { mode: 0o600 },
  );
  /** @type {NodeJS.ProcessEnv} */
  const env = { ...process.env, NPM_CONFIG_USERCONFIG: userconfig };
  delete env["CI"];
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: dir,
    env,
  });
  run("npx", ["--no-install", "prettier", "--write", "package.json"], {
    cwd: dir,
    env,
  });
  // The repo's own .npmrc may set ignore-scripts=true, so install the hooks explicitly instead of through `prepare`.
  run("npx", ["--no-install", "releaseready-hooks", "install"], {
    cwd: dir,
    env,
  });
  // The repo's own check first (it builds what the pre-push type-check needs, and "local checks first" saves CI minutes).
  run("sh", ["-c", repo.checkCommand ?? "npm run check"], { cwd: dir, env });
  git("add", "-A");
  git(
    "commit",
    "-m",
    `RRDPLAT-105: shared Husky hooks and lean CI (config ${loadRepos().release})\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`,
  );
  git("push", "-u", "origin", BRANCH);
  return run(
    "gh",
    [
      "pr",
      "create",
      "--draft",
      "--repo",
      `releaseready/${repo.name}`,
      "--head",
      BRANCH,
      "--title",
      "RRDPLAT-105: shared Husky hooks and lean CI",
      "--body",
      prBody(repo, changes),
    ],
    { cwd: dir },
  );
}

function main() {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean" },
      apply: { type: "boolean" },
      repo: { type: "string", multiple: true },
    },
  });
  if (values["dry-run"] === values.apply)
    throw new Error("pass exactly one of --dry-run and --apply");
  const { release, repos } = loadRepos();
  const sha = releaseSha(release);
  const work = mkdtempSync(join(tmpdir(), "rollout-"));
  try {
    for (const repo of repos) {
      if (values.repo && !values.repo.includes(repo.name)) continue;
      console.log(
        `\n## ${repo.name} (${repo.private ? "private, rr-local" : "public, ubuntu-24.04 exception"})`,
      );
      if (repo.skip) {
        console.log(`skipped: ${repo.skip}`);
        continue;
      }
      const dir = clone(repo.name, work);
      const { changes, warnings } = planRepo(dir, repo, sha);
      for (const { path, before } of changes)
        console.log(`${before === null ? "A" : "M"} ${path}`);
      for (const warning of warnings) console.log(`warning: ${warning}`);
      if (values.apply) {
        if (warnings.length > 0)
          throw new Error(`${repo.name}: resolve the warnings before --apply`);
        console.log(apply(dir, repo, changes, work));
      }
    }
  } finally {
    // The token file must not outlive the run; the clones stay for inspection.
    rmSync(join(work, "npmrc"), { force: true });
  }
}

if (import.meta.main) main();
