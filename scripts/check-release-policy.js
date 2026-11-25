import { Ajv } from "ajv";
import semver from "semver";
import { checkEvidence, git } from "./release-evidence.js";

/** @typedef {{version: string, baseCommit: string, classification: "routine" | "stricter-rules", rationale: string, evidence?: unknown}} Plan */
const ajv = new Ajv({ strict: true });
/** @type {import("ajv").ValidateFunction<Plan>} */
const validate = ajv.compile({
  type: "object",
  additionalProperties: false,
  required: ["version", "baseCommit", "classification", "rationale"],
  properties: {
    version: { type: "string" },
    baseCommit: { type: "string", pattern: "^[0-9a-f]{40}$" },
    classification: { enum: ["routine", "stricter-rules"] },
    rationale: { type: "string", minLength: 1, pattern: "\\S" },
    evidence: { type: "object" },
  },
});
// Read committed inputs only. Missing declarations never mean "routine".
/** @type {unknown} */
const plan = JSON.parse(git("show", "HEAD:release-plan.json"));
if (!validate(plan)) throw new Error(ajv.errorsText(validate.errors));
const version = JSON.parse(git("show", "HEAD:package.json")).version;
const baseVersion = JSON.parse(
  git("show", `${plan.baseCommit}:package.json`),
).version;
git("merge-base", "--is-ancestor", plan.baseCommit, "HEAD");
if (
  !semver.valid(version) ||
  !semver.valid(baseVersion) ||
  !semver.gt(version, baseVersion) ||
  plan.version !== version
)
  throw new Error(
    "release declaration must match an increased committed package version",
  );
if (plan.classification === "routine") {
  if (plan.evidence !== undefined)
    throw new Error(
      "routine releases must not carry stricter-rule evidence; review classification",
    );
  console.log(
    "Routine release: explicit declaration accepted; consumer measurements not required.",
  );
} else {
  const evidence = checkEvidence(plan.evidence);
  if (evidence.baseCommit !== plan.baseCommit)
    throw new Error("evidence baseline differs from release declaration");
  git("merge-base", "--is-ancestor", evidence.candidateCommit, "HEAD");
  const changed = git(
    "diff",
    "--name-only",
    evidence.candidateCommit,
    "HEAD",
    "--",
    ".",
    ":(exclude)release-plan.json",
  );
  if (changed)
    throw new Error(
      "release content changed after measurement; recollect evidence",
    );
  console.log(
    "Stricter-rule release: complete evidence accepted for unchanged measured content.",
  );
}
