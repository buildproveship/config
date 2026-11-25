// Test classification: integration
// Review status: Not Reviewed
// Evidence: synthetic
// Scope: the pinned Renovate engine resolves our preset and generates ranges accepted by our guardrails; no registry or repository updates.
import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { rules } from "../guardrails/rules.js";

const { values } = parseArgs({
  options: { "renovate-bin": { type: "string" } },
});
assert.ok(values["renovate-bin"], "pass the pinned Renovate executable");
// Renovate does not publish a configuration-testing API. Reuse its pinned implementation instead of duplicating
// preset merging, package-rule matching or npm range generation in this regression check.
const dist = dirname(realpathSync(values["renovate-bin"]));
const { resolveConfigPresets } = await import(
  pathToFileURL(join(dist, "config/presets/index.js")).href
);
const { applyPackageRules } = await import(
  pathToFileURL(join(dist, "util/package-rules/index.js")).href
);
const { api } = await import(
  pathToFileURL(join(dist, "modules/versioning/npm/index.js")).href
);
const preset = JSON.parse(
  readFileSync(new URL("../default.json", import.meta.url), "utf8"),
);
const { config } = await resolveConfigPresets(preset);
for (const depType of ["dependencies", "devDependencies"]) {
  for (const name of [
    "@buildproveship/config",
    "@buildproveship/test-management",
    "eslint",
  ]) {
    const effective = await applyPackageRules({
      ...config,
      depName: name,
      packageName: name,
      depType,
      manager: "npm",
      datasource: "npm",
    });
    const internal = name.startsWith("@buildproveship/");
    assert.equal(
      effective.rangeStrategy,
      internal ? "bump" : "pin",
      `${name} in ${depType}`,
    );
    for (const newVersion of ["1.2.4", "1.3.0", "2.0.0"]) {
      const version = api.getNewValue({
        currentValue: internal ? "^1.2.3" : "1.2.3",
        currentVersion: "1.2.3",
        rangeStrategy: effective.rangeStrategy,
        newVersion,
      });
      assert.equal(version, internal ? `^${newVersion}` : newVersion);
      const packageText = JSON.stringify({ [depType]: { [name]: version } });
      const repo = {
        paths: ["package.json"],
        tracked: ["package.json"],
        read: () => packageText,
      };
      assert.deepEqual(
        rules.flatMap((rule) => rule(repo, {})),
        [],
        `${name}: ${version}`,
      );
    }
  }
}
console.log(
  "Renovate policy: internal caret ranges and external pins pass the actual guardrails (18 cases).",
);
