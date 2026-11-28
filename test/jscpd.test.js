// Test classification: integration
// Review status: Not Reviewed
// Evidence: synthetic
// Scope: runs the guardrails CLI, including real jscpd, in throwaway git repos to check the 1% duplication cap and that generated sources are not counted; it does not run real consumer repos.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, test } from "node:test";
import { cli, repo } from "./guardrails-repo.js";

describe("jscpd duplication limit", () => {
  /**
   * Files of distinct lines, so only the copied block counts as duplication. Each stays under the 1,000-line limit.
   *
   * @param {number} files
   */
  const unique = (files) =>
    Object.fromEntries(
      Array.from({ length: files }, (_, f) => [
        `src/unique${String(f)}.ts`,
        Array.from(
          { length: 900 },
          (_, i) =>
            `export const value${String(f)}x${String(i)} = "${String((f * 900 + i) * 7919)}";`,
        ).join("\n") + "\n",
      ]),
    );
  const copied = Array.from(
    { length: 40 },
    (_, i) =>
      `export function copied${String(i % 3)}x${String(i)}(input: number[]) { return input.map((n) => n * ${String(i)}).filter((n) => n > ${String(i)}); }`,
  ).join("\n");
  /** @param {Record<string, string>} files */
  async function runCli(files) {
    const root = await repo(files);
    return spawnSync(process.execPath, [cli], { cwd: root, encoding: "utf8" });
  }

  test("more than 1% duplicated source fails by default", async () => {
    const result = await runCli({
      ...unique(2),
      "src/a.ts": `${copied}\n`,
      "src/b.ts": `${copied}\n`,
    });
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /at or below 1%/);
  });

  test("the same copy under 1% of the source passes", async () => {
    const result = await runCli({
      ...unique(10),
      "src/a.ts": `${copied}\n`,
      "src/b.ts": `${copied}\n`,
    });
    assert.equal(result.status, 0, result.stdout);
  });

  test("generated sources are not counted, built-in or listed with a reason", async () => {
    /** @type {Record<string, string>[]} */
    const cases = [
      {
        "src/generated/a.ts": `${copied}\n`,
        "src/generated/b.ts": `${copied}\n`,
      },
      {
        "src/api/a.ts": `${copied}\n`,
        "src/api/b.ts": `${copied}\n`,
        "buildproveship-guardrails.json": JSON.stringify({
          fileLength: {
            generated: [
              {
                path: "src/api/**",
                reason: "written by openapi-typescript from openapi/api.yaml",
              },
            ],
          },
        }),
      },
    ];
    for (const files of cases) {
      const result = await runCli({ ...unique(2), ...files });
      assert.equal(result.status, 0, result.stdout);
    }
  });
});
