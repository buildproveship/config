import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { Ajv } from "ajv";
import semver from "semver";
import { withoutGitEnv } from "../hooks/run.js";

/** @typedef {{baseCommit: string, candidateCommit: string, newRules: string[], consumers: {name: string, commit: string, command: string, evidenceUrl: string, counts: Record<string, number>}[]}} Evidence */
// Git supplies committed inputs, Ajv validates evidence, and semver owns version comparison.
// None classifies a rule change or verifies measurements; those remain release-review responsibilities.
const { values } = parseArgs({ options: { evidence: { type: "string" } } });
if (!values.evidence)
  throw new Error("pass --evidence with the measurement JSON");
const text = { type: "string", minLength: 1, pattern: "\\S" };
const commit = { type: "string", pattern: "^[0-9a-f]{40}$" };
const ajv = new Ajv({ strict: true });
/** @type {import("ajv").ValidateFunction<Evidence>} */
const validate = ajv.compile({
  type: "object",
  additionalProperties: false,
  required: ["baseCommit", "candidateCommit", "newRules", "consumers"],
  properties: {
    baseCommit: commit,
    candidateCommit: commit,
    newRules: { type: "array", minItems: 1, uniqueItems: true, items: text },
    consumers: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "commit", "command", "evidenceUrl", "counts"],
        properties: {
          name: text,
          commit,
          command: text,
          evidenceUrl: text,
          counts: {
            type: "object",
            additionalProperties: { type: "integer", minimum: 0 },
          },
        },
      },
    },
  },
});
/** @type {unknown} */
const evidence = JSON.parse(readFileSync(values.evidence, "utf8"));
if (!validate(evidence)) throw new Error(ajv.errorsText(validate.errors));
/** @param {string[]} args */
const git = (...args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    env: withoutGitEnv(process.env),
  }).trim();
for (const sha of [evidence.baseCommit, evidence.candidateCommit]) {
  if (git("rev-parse", "--verify", `${sha}^{commit}`) !== sha)
    throw new Error("evidence must identify full commit objects");
}
git(
  "merge-base",
  "--is-ancestor",
  evidence.baseCommit,
  evidence.candidateCommit,
);
const base = JSON.parse(
  git("show", `${evidence.baseCommit}:package.json`),
).version;
const candidate = JSON.parse(
  git("show", `${evidence.candidateCommit}:package.json`),
).version;
if (
  !semver.valid(base) ||
  !semver.valid(candidate) ||
  semver.major(candidate) <= semver.major(base)
)
  throw new Error("new error-level rules require a major version increase");
const inventory = JSON.parse(
  git("show", `${evidence.candidateCommit}:scripts/rollout-repos.json`),
);
/** @type {string[]} */
const expected = inventory.repos.map(
  (/** @type {{name: string}} */ repo) => repo.name,
);
const names = evidence.consumers.map((row) => row.name);
if (
  new Set(names).size !== names.length ||
  names.length !== expected.length ||
  expected.some((name) => !names.includes(name))
)
  throw new Error(
    "measure every inventory repo exactly once, including skipped rollout targets",
  );
for (const row of evidence.consumers) {
  const url = new URL(row.evidenceUrl);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("evidence links must use HTTPS without credentials");
  if (
    Object.keys(row.counts).length !== evidence.newRules.length ||
    evidence.newRules.some((rule) => !Object.hasOwn(row.counts, rule))
  )
    throw new Error(
      `${row.name}: provide a count for every new rule, with no extra rules`,
    );
}
/** @param {string} value */
const cell = (value) =>
  value.replaceAll("|", "\\|").replaceAll("\n", " ").replaceAll("\r", " ");
console.log(`New-rule evidence: ${base} → ${candidate}`);
console.log(
  `Base: ${evidence.baseCommit}\nCandidate: ${evidence.candidateCommit}`,
);
console.log(
  "\n| Repo | Commit | Rule | Count | Command | Evidence |\n| --- | --- | --- | --- | --- | --- |",
);
for (const row of evidence.consumers)
  for (const rule of evidence.newRules)
    console.log(
      `| ${[row.name, row.commit, rule, String(row.counts[rule]), row.command, row.evidenceUrl].map(cell).join(" | ")} |`,
    );
console.log(
  "\nValidated structure and major bump only. Review measurement provenance, candidate coverage and inventory completeness before release.",
);
