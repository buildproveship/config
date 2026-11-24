// Classification: integration; synthetic lint fixtures; Not Reviewed.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ESLint } from "eslint";
import { releaseready } from "../eslint.js";

const fixtures = join(import.meta.dirname, "fixtures");

/** @param {string} dir @param {boolean} react @param {string} file @param {string} [source] */
async function ruleIds(dir, react, file, source) {
  const cwd = join(fixtures, dir);
  const eslint = new ESLint({
    cwd,
    overrideConfigFile: true,
    overrideConfig: releaseready({ tsconfigRootDir: cwd, react }),
  });
  const [result] =
    source === undefined
      ? await eslint.lintFiles([file])
      : await eslint.lintText(source, { filePath: join(cwd, file) });
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
    const source = await readFile(join(fixtures, "react", "bad.tsx"), "utf8");
    const ids = await ruleIds(
      "react",
      true,
      "bad.tsx",
      source.replace(
        'return <img src="a.png" />;',
        'return [<img src="a.png" />];',
      ),
    );
    for (const rule of [
      "@eslint-react/no-missing-key",
      "jsx-a11y-x/alt-text",
      "react-hooks/rules-of-hooks",
      "react-hooks/exhaustive-deps",
    ]) {
      assert.ok(ids.includes(rule), `${rule} missing from ${ids.join(", ")}`);
    }
  });

  test("suppressions need a rule and a reason; @ts-ignore and .only fail", async () => {
    const ids = await ruleIds("node", false, "suppressions.ts");
    for (const rule of [
      "@eslint-community/eslint-comments/require-description",
      "@eslint-community/eslint-comments/no-unlimited-disable",
      "@typescript-eslint/ban-ts-comment",
      "no-only-tests/no-only-tests",
    ]) {
      assert.ok(ids.includes(rule), `${rule} missing from ${ids.join(", ")}`);
    }
    // ban-ts-comment fires twice: once for the ignore directive, once for the expect-error without a description.
    assert.equal(
      ids.filter((id) => id === "@typescript-eslint/ban-ts-comment").length,
      2,
    );
  });

  test("React rules stay off unless asked for", async () => {
    const ids = await ruleIds("react", false, "bad.tsx");
    assert.ok(
      !ids.some(
        (id) =>
          id.startsWith("jsx-a11y") ||
          id.startsWith("react") ||
          id.startsWith("@eslint-react/"),
      ),
      ids.join(", "),
    );
  });
});
