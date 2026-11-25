// Integration: exercise the published guardrails CLI against synthetic consumer repositories.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { test } from "node:test";
import { syncSkill } from "../guardrails/skill.js";

const cli = new URL("../guardrails/cli.js", import.meta.url);

/** @param {Record<string, string>} files */
async function check(files) {
  const root = mkdtempSync(join(tmpdir(), "guardrails consumer "));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    await syncSkill(root);
    for (const [name, content] of Object.entries({
      "AGENTS.md": "Read skills/buildproveship-code-quality/SKILL.md.\n",
      "CLAUDE.md": "Read skills/buildproveship-code-quality/SKILL.md.\n",
      ...files,
    })) {
      writeFileSync(join(root, name), content);
    }
    return spawnSync(
      process.execPath,
      [fileURLToPath(cli), "--static", "--root", root],
      {
        cwd: root,
        encoding: "utf8",
      },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("CLI rejects non-caret internal aliases but accepts published caret aliases", async () => {
  for (const spec of ["1.2.3", "~1.2.3", "latest", "*", "", "@"]) {
    const result = await check({
      "package.json": JSON.stringify({
        dependencies: {
          alias: `npm:@buildproveship/example${spec === "@" ? "@" : spec ? `@${spec}` : ""}`,
        },
      }),
    });
    assert.equal(result.status, 1, result.stderr + result.stdout);
    assert.match(result.stdout, /unpublished-internal-dependency/);
  }
  const result = await check({
    "package.json": JSON.stringify({
      dependencies: {
        alias: "npm:@buildproveship/example@^1.2.3",
        external: "npm:example@1.2.3",
      },
      overrides: { alias: "npm:@buildproveship/example@1.2.3" },
    }),
  });
  assert.equal(result.status, 0, result.stderr + result.stdout);
});

test("CLI rejects external local directories in every dependency field", async () => {
  const specs = [
    ".",
    "..",
    "../external",
    "vendor/packages/external",
    "vendor\\packages\\external",
    "./external",
    "/external",
    "~/external",
    "C:\\external",
    "\\\\server\\external",
  ];
  for (const field of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
    "overrides",
  ]) {
    const result = await check({
      "package.json": JSON.stringify({
        [field]: Object.fromEntries(
          specs.map((spec, index) => [`external-${String(index)}`, spec]),
        ),
      }),
    });
    assert.equal(result.status, 1, result.stderr + result.stdout);
    assert.equal(
      result.stdout.split("  dependency-source  ").length - 1,
      specs.length,
    );
  }
});

test("CLI diagnostics locate nested JSON properties rather than an earlier matching key", async () => {
  const result = await check({
    "package.json":
      '{\n  "name": "example",\n  "dependencies": {"external": "1.2.3"},\n  "devDependencies": {\n    "external": "file:../external"\n  },\n  "overrides": {\n    "@buildproveship/example": {\n      ".": "../external/dist"\n    }\n  }\n}\n',
    "tsconfig.json":
      '{\n  "strict": true,\n  "compilerOptions": {\n    "strict": false\n  }\n}\n',
  });
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.match(result.stdout, /package.json:5 {2}dependency-source/);
  assert.match(
    result.stdout,
    /package.json:9 {2}unpublished-internal-dependency/,
  );
  assert.match(result.stdout, /tsconfig.json:4 {2}tsconfig-not-strict/);
});

test("CLI locations follow JSONC's last duplicate value, including escaped keys", async () => {
  const result = await check({
    "package.json":
      '{\n  "dependencies": {"external": "1.2.3"},\n  "dependencies": {\n    "external": "1.2.3",\n    "exter\\u006eal": "file:../external"\n  }\n}\n',
  });
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.match(result.stdout, /package.json:5 {2}dependency-source/);
  assert.equal(result.stdout.split("  dependency-source  ").length - 1, 1);
});
