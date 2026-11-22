import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { parse } from "yaml";
import { HOOKS } from "../hooks/install.js";
import {
  loadRepos,
  planDeliveryRules,
  planRepo,
  prBody,
  renderCopilotSetup,
  renderPr,
} from "../scripts/rollout.js";

const SHA = "a".repeat(40);
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const { repos } = loadRepos();

/**
 * A synthetic consumer repo on disk.
 * @param {Record<string, string>} files
 */
function repoDir(files) {
  const dir = mkdtempSync(join(tmpdir(), "rollout-test-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

const PACKAGE = JSON.stringify({
  scripts: { check: "true" },
  devDependencies: { zod: "^4.0.0", "@releaseready/config": "^4.0.0" },
});
const HOSTED_WORKFLOW = "jobs:\n  a:\n    runs-on: ubuntu-24.04\n";

/** @param {boolean} isPrivate */
function consumer(isPrivate) {
  return planRepo(
    repoDir({
      "package.json": PACKAGE,
      "AGENTS.md": "# Agents\n",
      ".github/workflows/pr.yml": HOSTED_WORKFLOW,
      ".github/workflows/weekly.yml": HOSTED_WORKFLOW,
    }),
    { name: "synthetic", private: isPrivate },
    SHA,
  );
}

test("every GitHub repo of the org is listed once, and only config and observability are skipped", () => {
  assert.equal(repos.length, 10);
  assert.equal(new Set(repos.map((repo) => repo.name)).size, 10);
  assert.deepEqual(
    repos.filter((repo) => repo.skip).map((repo) => repo.name),
    ["observability", "config"],
  );
  assert.deepEqual(
    repos
      .filter((repo) => !repo.private)
      .map((repo) => repo.name)
      .sort(),
    [
      "config",
      "observability",
      "universal-api-framework",
      "universal-appium-framework",
      "universal-playwright-framework",
    ],
  );
});

test("the plan sets the config devDependency and the prepare script, and adds the hooks", () => {
  const { changes, warnings } = consumer(true);
  assert.deepEqual(warnings, []);
  const pkg = JSON.parse(
    changes.find((change) => change.path === "package.json")?.after ?? "",
  );
  assert.equal(pkg.devDependencies["@releaseready/config"], "^4.2.0");
  assert.equal(pkg.devDependencies.zod, "^4.0.0");
  assert.equal(pkg.scripts.prepare, "releaseready-hooks install");
  for (const hook of HOOKS)
    assert.ok(changes.some((change) => change.path === `.husky/${hook}`));
});

test("a private repo's hosted runners move to rr-local; a public repo's stay", () => {
  const privateAfter = consumer(true).changes.find(
    (change) => change.path === ".github/workflows/weekly.yml",
  )?.after;
  assert.match(privateAfter ?? "", /runs-on: \[self-hosted, rr-local\]/);
  assert.doesNotMatch(privateAfter ?? "", /ubuntu/);
  assert.ok(
    !consumer(false).changes.some(
      (change) => change.path === ".github/workflows/weekly.yml",
    ),
  );
});

test("the caller pr.yml is the template; only a public repo passes the hosted runner", () => {
  const privatePr = renderPr({ name: "x", private: true }, SHA);
  const publicPr = renderPr({ name: "x", private: false }, SHA);
  assert.match(privatePr, new RegExp(`reusable-ci.yml@${SHA}`));
  assert.doesNotMatch(privatePr, /runner:/);
  assert.match(publicPr, /with:\n {6}runner: ubuntu-24.04\n$/);
  assert.doesNotMatch(privatePr + publicPr, /<sha>|Copy to/);
});

test("a repo with its own check command passes it as the workflow input", () => {
  assert.match(
    renderPr({ name: "x", private: true, checkCommand: "npm run a && b" }, SHA),
    /check-command: "npm run a && b"/,
  );
});

test("the Copilot setup steps call the released install-gitleaks action, which exists in this repo", () => {
  const text = renderCopilotSetup(SHA);
  assert.match(
    text,
    new RegExp(`releaseready/config/.github/actions/install-gitleaks@${SHA}`),
  );
  assert.ok(existsSync(join(ROOT, ".github/actions/install-gitleaks")));
  assert.doesNotMatch(text, /uses: \.\//);
});

test("a repo with no check script, or its own prepare script, is a warning, not an overwrite", () => {
  const { changes, warnings } = planRepo(
    repoDir({
      "package.json": JSON.stringify({ scripts: { prepare: "tsc" } }),
      "AGENTS.md": "# Agents\n",
      ".github/workflows/pr.yml": HOSTED_WORKFLOW,
    }),
    { name: "synthetic", private: true },
    SHA,
  );
  assert.equal(warnings.length, 2);
  const pkg = JSON.parse(
    changes.find((change) => change.path === "package.json")?.after ?? "",
  );
  assert.equal(pkg.scripts.prepare, "tsc");
});

test("the AGENTS.md note is added once and names ignore-scripts when the repo's .npmrc sets it", () => {
  const files = {
    "package.json": PACKAGE,
    "AGENTS.md": "# Agents\n",
    ".npmrc": "ignore-scripts=true\n",
    ".github/workflows/pr.yml": HOSTED_WORKFLOW,
  };
  const repo = { name: "synthetic", private: true };
  const first = planRepo(repoDir(files), repo, SHA).changes.find(
    (change) => change.path === "AGENTS.md",
  );
  assert.match(first?.after ?? "", /npx releaseready-hooks install/);
  const again = planRepo(
    repoDir({ ...files, "AGENTS.md": first?.after ?? "" }),
    repo,
    SHA,
  );
  assert.ok(!again.changes.some((change) => change.path === "AGENTS.md"));
});

test("the PR body names the runner decision for the repo", () => {
  assert.match(
    prBody({ name: "x", private: false }, []),
    /Justified exception/,
  );
  assert.match(prBody({ name: "x", private: true }, []), /rr-local/);
});

test("a repo's extra scripts are added without replacing one it already has", () => {
  const repo = {
    name: "synthetic",
    private: true,
    scripts: { "test:affected": "npm run unit", lint: "never" },
  };
  const { changes } = planRepo(
    repoDir({
      "package.json": JSON.stringify({
        scripts: { check: "true", lint: "eslint ." },
      }),
      "AGENTS.md": "# Agents\n",
      ".github/workflows/pr.yml": HOSTED_WORKFLOW,
    }),
    repo,
    SHA,
  );
  const pkg = JSON.parse(
    changes.find((change) => change.path === "package.json")?.after ?? "",
  );
  assert.equal(pkg.scripts["test:affected"], "npm run unit");
  assert.equal(pkg.scripts.lint, "eslint .");
});

test("this repo's pr.yml reports the one required `ci` check after every other job, and skips drafts", () => {
  const { jobs } = parse(
    readFileSync(join(ROOT, ".github/workflows/pr.yml"), "utf8"),
  );
  assert.deepEqual(
    [...jobs.ci.needs].sort(),
    Object.keys(jobs)
      .filter((id) => id !== "ci")
      .sort(),
  );
  for (const job of Object.values(jobs))
    assert.match(job.if, /pull_request\.draft/);
});

test("the delivery rules section comes from templates/AGENTS.md, links both pages, and is added once", () => {
  const dir = repoDir({ "AGENTS.md": "# Agents\n\nOwn text.\n" });
  const [change] = planDeliveryRules(dir);
  assert.match(change?.after ?? "", /Own text\.\n\n## Delivery rules\n/);
  assert.match(change?.after ?? "", /pages\/27328513/);
  assert.match(change?.after ?? "", /pages\/27230233/);
  assert.match(change?.after ?? "", /pages\/26411190/);
  assert.match(change?.after ?? "", /\*\*Agent brief\*\*/);
  const section = (change?.after ?? "").split("## Delivery rules")[1] ?? "";
  assert.ok(section.trim().split("\n").length <= 10, "at most 10 lines");
  assert.deepEqual(
    planDeliveryRules(repoDir({ "AGENTS.md": change?.after ?? "" })),
    [],
  );
});
