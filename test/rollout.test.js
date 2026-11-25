// Classification: integration; synthetic temporary fixtures; Not Reviewed.
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { parse } from "yaml";
import {
  loadRepos,
  planDeliveryRules,
  planRepo,
  prBody,
  renderCopilotSetup,
  renderPr,
} from "../scripts/rollout.js";
import { additionalWorkflowReview } from "../scripts/managed-workflow.js";

const fixtureRoot = mkdtempSync(join(tmpdir(), "config-rollout-"));
after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

const SHA = "a".repeat(40);
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const { repos } = loadRepos();

/**
 * A synthetic consumer repo on disk.
 * @param {Record<string, string>} files
 */
function repoDir(files) {
  const dir = mkdtempSync(join(fixtureRoot, "rollout-test-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

const PACKAGE = JSON.stringify({
  scripts: { check: "true" },
  devDependencies: { zod: "^4.0.0", "@buildproveship/config": "^4.0.0" },
});
const HOSTED_WORKFLOW = "jobs:\n  a:\n    runs-on: ubuntu-24.04\n";

/** @param {boolean} isPrivate */
function consumer(isPrivate) {
  return planRepo(
    repoDir({
      "package.json": PACKAGE,
      "AGENTS.md": "# Agents\n",
      ".github/workflows/pr.yml": renderPr(
        { name: "synthetic", private: isPrivate },
        "b".repeat(40),
      ),
      ".github/workflows/weekly.yml": isPrivate
        ? HOSTED_WORKFLOW.replace("ubuntu-24.04", "[self-hosted, rr-local]")
        : HOSTED_WORKFLOW,
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

test("the plan sets the dependency and prepare script, and reports hook generation separately", () => {
  const { changes, warnings, actions } = consumer(true);
  assert.deepEqual(warnings, []);
  const pkg = JSON.parse(
    changes.find((change) => change.path === "package.json")?.after ?? "",
  );
  assert.equal(pkg.devDependencies["@buildproveship/config"], "^5.2.0");
  assert.equal(pkg.devDependencies.zod, "^4.0.0");
  assert.equal(pkg.scripts.prepare, "releaseready-hooks install");
  assert.deepEqual(actions, ["npx --no-install releaseready-hooks install"]);
  assert.ok(!changes.some((change) => change.path.startsWith(".husky/")));
});

test("other workflows retain their runner choices", () => {
  for (const privateRepo of [true, false])
    assert.ok(
      !consumer(privateRepo).changes.some(
        (change) => change.path === ".github/workflows/weekly.yml",
      ),
    );
});

test("the caller pr.yml is the template and passes no runner: rr-local is the reusable default", () => {
  const pr = renderPr({ name: "x", private: true }, SHA);
  assert.match(pr, new RegExp(`reusable-ci.yml@${SHA}`));
  assert.doesNotMatch(pr, /runner:|<sha>|Copy to/);
});

test("a GitHub-hosted job in any repo is flagged as a runner migration", () => {
  const hostedJob = "jobs:\n  a:\n    runs-on: ubuntu-24.04\n";
  assert.equal(additionalWorkflowReview(hostedJob), "runner migration");
});

test("no repo carries a per-repo runner rule (RRDPLAT-114)", () => {
  assert.deepEqual(
    repos.filter((repo) => "selfHosted" in repo),
    [],
  );
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
    new RegExp(`buildproveship/config/.github/actions/install-gitleaks@${SHA}`),
  );
  assert.ok(existsSync(join(ROOT, ".github/actions/install-gitleaks")));
  assert.doesNotMatch(text, /uses: \.\//);
});

test("a repo with no check script, or its own prepare script, is a warning, not an overwrite", () => {
  const { changes, warnings } = planRepo(
    repoDir({
      "package.json": JSON.stringify({ scripts: { prepare: "tsc" } }),
      "AGENTS.md": "# Agents\n",
      ".github/workflows/pr.yml": renderPr(
        { name: "synthetic", private: true },
        "b".repeat(40),
      ),
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
    ".github/workflows/pr.yml": renderPr(
      { name: "synthetic", private: true },
      "b".repeat(40),
    ),
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

test("the PR body names the rr-local default and the fork exception", () => {
  assert.match(prBody([]), /self-hosted `rr-local`.*forks.*ubuntu-24.04/);
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
      ".github/workflows/pr.yml": renderPr(
        { name: "synthetic", private: true },
        "b".repeat(40),
      ),
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

test("the rollout accepts consumers already on the published governance release", () => {
  const dir = repoDir({
    "package.json": JSON.stringify({
      scripts: { check: "true" },
      devDependencies: { "@buildproveship/config": "^5.2.0" },
    }),
  });
  const plan = planRepo(dir, { name: "synthetic", private: false }, SHA);
  assert.deepEqual(plan.warnings, []);
  const pkg = JSON.parse(
    plan.changes.find((change) => change.path === "package.json")?.after ??
      "{}",
  );
  assert.equal(pkg.devDependencies["@buildproveship/config"], "^5.2.0");
});
