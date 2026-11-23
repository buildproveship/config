import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import * as prettier from "prettier";

const require = createRequire(import.meta.url);

test("Prettier resolves the shared config through the package export", async () => {
  const resolved = await prettier.resolveConfig(import.meta.filename);
  assert.equal(resolved?.singleQuote, false);
  assert.equal(resolved?.trailingComma, "all");
  const formatted = await prettier.format("const a = {b:'c'}", {
    ...resolved,
    parser: "babel",
  });
  assert.equal(formatted, 'const a = { b: "c" };\n');
});

test("every export target exists and the tsconfig base is strict", async () => {
  const pkg = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  for (const subpath of Object.keys(pkg.exports)) {
    assert.ok(
      require.resolve(`@buildproveship/config${subpath.slice(1)}`),
      subpath,
    );
  }
  const tsconfig = JSON.parse(
    await readFile(new URL("../tsconfig.json", import.meta.url), "utf8"),
  );
  assert.equal(tsconfig.compilerOptions.strict, true);
  assert.equal(tsconfig.compilerOptions.noUnusedLocals, true);
});

test("the Renovate preset pins actions and groups tooling", async () => {
  /** @type {{ extends: string[]; packageRules: { groupName?: string }[] }} */
  const preset = JSON.parse(
    await readFile(new URL("../default.json", import.meta.url), "utf8"),
  );
  assert.ok(preset.extends.includes("helpers:pinGitHubActionDigests"));
  assert.ok(
    preset.packageRules.some(
      (rule) => rule.groupName === "code-quality tooling",
    ),
  );
});
