// Classification: integration; synthetic package/config fixtures; Not Reviewed.
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
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
  for (const [subpath, target] of Object.entries(pkg.exports)) {
    if (typeof target === "object" && target !== null && "types" in target) {
      assert.equal(typeof target.types, "string", `${subpath} types target`);
      await access(new URL(`../${String(target.types)}`, import.meta.url));
    }
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

test("the Renovate preset opens ui-web and tokens updates at once and automerges them, so no app falls behind the design system", async () => {
  /** @type {{ packageRules: { groupName?: string; schedule?: string[]; automerge?: boolean; matchPackageNames?: string[] }[] }} */
  const preset = JSON.parse(
    await readFile(new URL("../default.json", import.meta.url), "utf8"),
  );
  const rule = preset.packageRules.find((r) => r.groupName === "design system");
  assert.deepEqual(rule?.matchPackageNames, [
    "@buildproveship/ui-web",
    "@buildproveship/tokens",
  ]);
  assert.deepEqual(rule.schedule, ["at any time"]);
  assert.equal(rule.automerge, true);
});
