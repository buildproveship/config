import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ESLint } from "eslint";
import { releaseready } from "../eslint.js";

const fixtures = join(import.meta.dirname, "fixtures");

/** @param {string} dir @param {boolean} react @param {string} file */
async function ruleIds(dir, react, file) {
  const cwd = join(fixtures, dir);
  const eslint = new ESLint({
    cwd,
    overrideConfigFile: true,
    overrideConfig: releaseready({ tsconfigRootDir: cwd, react }),
  });
  const [result] = await eslint.lintFiles([file]);
  assert.ok(result);
  return result.messages.map((m) => m.ruleId ?? `fatal: ${m.message}`).sort();
}

describe("releaseready() ESLint config", () => {
  test("requires tsconfigRootDir", () => {
    // @ts-expect-error -- the call is deliberately missing its required option.
    assert.throws(() => releaseready({}), TypeError);
  });

  test("type-aware rules catch floating promises, any and unsafe templates", async () => {
    const ids = await ruleIds("node", false, "bad.ts");
    for (const rule of [
      "@typescript-eslint/no-explicit-any",
      "@typescript-eslint/no-floating-promises",
      "@typescript-eslint/restrict-template-expressions",
      "@typescript-eslint/require-await",
    ]) {
      assert.ok(ids.includes(rule), `${rule} missing from ${ids.join(", ")}`);
    }
  });

  test("clean code, node:test calls, numbers in templates and rest-sibling omission pass", async () => {
    assert.deepEqual(await ruleIds("node", false, "good.ts"), []);
  });

  test("React preset applies react, react-hooks and jsx-a11y", async () => {
    const ids = await ruleIds("react", true, "bad.tsx");
    for (const rule of [
      "jsx-a11y-x/alt-text",
      "react-hooks/rules-of-hooks",
      "react-hooks/exhaustive-deps",
    ]) {
      assert.ok(ids.includes(rule), `${rule} missing from ${ids.join(", ")}`);
    }
  });

  test("React rules stay off unless asked for", async () => {
    const ids = await ruleIds("react", false, "bad.tsx");
    assert.ok(
      !ids.some((id) => id.startsWith("jsx-a11y") || id.startsWith("react")),
      ids.join(", "),
    );
  });
});
