// Classification: integration; synthetic temporary fixtures; Not Reviewed.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { allureReporter } from "@buildproveship/config/allure";
import { loadEnv } from "@buildproveship/config/dotenv";

const fixtureRoot = mkdtempSync(join(tmpdir(), "config-shared-setup-"));
after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

const require = createRequire(import.meta.url);

test("loadEnv fills the target from a .env file and keeps values already set", () => {
  const file = join(mkdtempSync(join(fixtureRoot, "env-")), ".env");
  writeFileSync(file, "SYNTHETIC_A=from-file\nSYNTHETIC_B=from-file\n");
  const target = { SYNTHETIC_B: "already-set" };
  const parsed = loadEnv({ path: file, processEnv: target });
  assert.deepEqual(parsed, {
    SYNTHETIC_A: "from-file",
    SYNTHETIC_B: "from-file",
  });
  assert.deepEqual(target, {
    SYNTHETIC_A: "from-file",
    SYNTHETIC_B: "already-set",
  });
});

test("loadEnv treats a missing .env file as empty", () => {
  /** @type {Record<string, string>} */
  const target = {};
  assert.deepEqual(
    loadEnv({
      path: join(tmpdir(), "no-such-dir", ".env"),
      processEnv: target,
    }),
    {},
  );
  assert.deepEqual(target, {});
});

test("loadEnv throws when the path cannot be read as a file", () => {
  assert.throws(() => loadEnv({ path: tmpdir(), processEnv: {} }), {
    code: "EISDIR",
  });
});

test("allureReporter returns the wdio reporter tuple with one output directory", () => {
  assert.deepEqual(allureReporter(), [
    "allure",
    { outputDir: "allure-results" },
  ]);
  assert.deepEqual(
    allureReporter({ outputDir: "out", disableWebdriverStepsReporting: true }),
    ["allure", { outputDir: "out", disableWebdriverStepsReporting: true }],
  );
});

test("the rule-file templates resolve through the package export", () => {
  for (const name of ["AGENTS.md", "CLAUDE.md", "copilot-instructions.md"]) {
    const text = readFileSync(
      require.resolve(`@buildproveship/config/templates/${name}`),
      "utf8",
    );
    assert.ok(text.length > 0, name);
  }
  const rules = readFileSync(
    require.resolve("@buildproveship/config/templates/copilot-instructions.md"),
    "utf8",
  );
  assert.match(rules, /## Tests and classification/);
  assert.match(rules, /## Design before implementation/);
  for (const name of ["AGENTS.md", "CLAUDE.md"]) {
    const text = readFileSync(
      require.resolve(`@buildproveship/config/templates/${name}`),
      "utf8",
    );
    assert.ok(
      text.includes("skills/buildproveship-code-quality/SKILL.md"),
      `${name} must point to the skill (skill-drift)`,
    );
  }
});
