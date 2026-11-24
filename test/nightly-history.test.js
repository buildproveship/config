import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { parse } from "yaml";

/** @type {{ jobs: { e2e: { steps: { name?: string, uses?: string, run?: string, with?: Record<string, unknown> }[] } } }} */
const workflow = parse(
  readFileSync(
    new URL("../.github/workflows/reusable-nightly.yml", import.meta.url),
    "utf8",
  ),
);

test("nightly full-check shell sees deleted historical content with configured checkout depth", (t) => {
  const root = mkdtempSync(join(tmpdir(), "nightly history "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  );
  /** @param {string} cwd @param {string[]} args */
  const git = (cwd, args) =>
    execFileSync("git", args, {
      cwd,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  const source = join(root, "source");
  git(root, ["init", "-q", source]);
  git(source, ["config", "user.name", "Fixture"]);
  git(source, ["config", "user.email", "fixture@example.invalid"]);
  writeFileSync(join(source, "history.txt"), "HISTORY_AUDIT_SENTINEL\n");
  git(source, ["add", "."]);
  git(source, ["commit", "-qm", "fixture: historical marker"]);
  const historical = git(source, ["rev-parse", "HEAD"]).trim();
  git(source, ["rm", "history.txt"]);
  git(source, ["commit", "-qm", "fixture: remove marker"]);
  const rule = join(root, "fixture.toml");
  writeFileSync(
    rule,
    'title = "Benign history fixture"\n[[rules]]\nid = "history-fixture"\ndescription = "Not a credential"\nregex = "HISTORY_AUDIT_SENTINEL"\n',
  );
  const checkout = workflow.jobs.e2e.steps.find((step) =>
    step.uses?.startsWith("actions/checkout@"),
  );
  const shell = workflow.jobs.e2e.steps.find(
    (step) => step.name === "Full E2E",
  )?.run;
  assert.ok(shell);
  assert.equal(checkout?.with?.["persist-credentials"], false);
  assert.equal(checkout?.with?.["fetch-depth"], 0);
  for (const depth of [1, Number(checkout.with["fetch-depth"])]) {
    const clone = join(root, `clone ${depth}`);
    git(root, [
      "clone",
      "--quiet",
      ...(depth ? ["--depth", String(depth)] : []),
      pathToFileURL(source).href,
      clone,
    ]);
    const report = join(clone, "report.json");
    /** @type {import("node:child_process").SpawnSyncReturns<string>} */
    const result = spawnSync("bash", ["-e", "-c", shell], {
      cwd: clone,
      env: {
        ...env,
        RULE: rule,
        REPORT: report,
        E2E_COMMAND:
          'gitleaks git --redact --no-banner --config "$RULE" --report-format json --report-path "$REPORT" .',
      },
      encoding: "utf8",
    });
    assert.equal(result.status, depth ? 0 : 1, result.stderr);
    const findings = JSON.parse(readFileSync(report, "utf8"));
    if (depth) assert.deepEqual(findings, []);
    else {
      assert.equal(findings.length, 1);
      assert.equal(findings[0].Commit, historical);
      assert.equal(findings[0].RuleID, "history-fixture");
    }
  }
});
