import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";

/** @type {{ on: { workflow_call: { inputs: Record<string, { default: string }> } }, jobs: { ci: { steps: { name?: string, if?: string, with: { key: string } }[] } } }} */
const workflow = parse(
  readFileSync(
    new URL("../.github/workflows/reusable-ci.yml", import.meta.url),
    "utf8",
  ),
);
const inputs = workflow.on.workflow_call.inputs;
const cache = workflow.jobs.ci.steps.find(
  (step) => step.name === "Restore build output",
);

assert.ok(cache);
const key = cache.with.key;

// Check file-selection/invalidation against the shipped expression, not a second pattern list.
// Native glob is a local contract test; the hosted Actions expression engine is not executed here.
function patterns(source = inputs["cache-key-files"].default) {
  const expression = key.match(/hashFiles\(([^)]+)\)/)?.[1];
  assert.ok(expression);
  return expression.split(",").map((value) => {
    const argument = value.trim();
    if (argument === "inputs.cache-key-files") return source;
    if (argument === "inputs.node-version-file")
      return inputs["node-version-file"].default;
    assert.match(argument, /^'[^']+'$/);
    return argument.slice(1, -1);
  });
}

test("opt-in build cache invalidates source, config and dependency inputs", (t) => {
  const root = mkdtempSync(join(tmpdir(), "cache inputs "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = [
    "src/a.ts",
    "src/with spaces/b.ts",
    "package.json",
    "package-lock.json",
    "npm-shrinkwrap.json",
    "packages/lib/package.json",
    "packages/lib/package-lock.json",
    "tsconfig.json",
    "packages/lib/tsconfig.build.json",
    "vite.config.ts",
    "postcss.config.cjs",
    ".nvmrc",
    "assets/logo.svg",
    "README.md",
    "docs/guide.md",
  ];
  for (const file of files) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), "before\n");
  }
  /** @param {string[]} globs */
  function fingerprint(globs) {
    const hash = createHash("sha256");
    for (const path of globSync(globs, { cwd: root }).sort((a, b) =>
      a.localeCompare(b),
    )) {
      // Ignore directories: only files affect hashFiles.
      if (files.includes(path)) hash.update(readFileSync(join(root, path)));
    }
    return hash.digest("hex");
  }
  const baseline = fingerprint(patterns());
  for (const file of files) {
    writeFileSync(join(root, file), "changed\n");
    const actual = fingerprint(patterns());
    if (["assets/logo.svg", "README.md", "docs/guide.md"].includes(file))
      assert.equal(actual, baseline, file);
    else assert.notEqual(actual, baseline, file);
    writeFileSync(join(root, file), "before\n");
  }
  const custom = patterns("assets/**");
  const before = fingerprint(custom);
  writeFileSync(join(root, "assets/logo.svg"), "new asset\n");
  assert.notEqual(fingerprint(custom), before);
  assert.equal(inputs["cache-paths"].default, "");
  assert.equal(
    cache.if,
    "${{ steps.diff.outputs.docs_only != 'true' && inputs.cache-paths != '' }}",
  );
  assert.ok(cache.with.key.includes("runner.arch"));
  assert.ok(cache.with.key.includes("steps.node.outputs.node-version"));
  assert.deepEqual(Object.keys(workflow.jobs), ["route", "ci"]);
});
