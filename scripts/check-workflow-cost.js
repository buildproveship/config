// Fails on GitHub Actions patterns that burn paid minutes (RRDPLAT-114). The org cap is US$10/month, so a workflow
// that runs often, runs long or runs on a multiplied runner must be moved to the self-hosted `rr-local` runner or
// removed. Used by `npm run check:workflow-cost` and by consumers through `releaseready-hooks`-style scripts.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parse } from "yaml";

/** Hosted runner labels billed at a multiplier or on larger machines. */
const COSTLY_RUNNER = /macos|windows|larger|xlarge|\d+-?core|-arm/i;

/** @param {unknown} value @returns {string[]} */
function labels(value) {
  if (Array.isArray(value)) return value.flatMap(labels);
  return typeof value === "string" ? [value] : [];
}

/**
 * True when the cron fires more than once a week (day-of-month and day-of-week both wildcards).
 * @param {string} cron
 */
function moreOftenThanWeekly(cron) {
  const [, , dayOfMonth, month, dayOfWeek] = cron.trim().split(/\s+/);
  return dayOfMonth === "*" && month === "*" && dayOfWeek === "*";
}

/**
 * @param {string} file label used in messages
 * @param {string} text workflow YAML
 * @returns {string[]} one message per problem
 */
export function findCostProblems(file, text) {
  /** @type {Record<string, any>} */
  const wf = parse(text) ?? {};
  const problems = [];
  const on = wf.on ?? wf.true ?? {};
  const events = typeof on === "string" ? [on] : Object.keys(on);
  if (events.includes("push") && !on.push?.branches && !on.push?.tags) {
    problems.push(`${file}: push trigger needs a branches or tags filter`);
  }
  for (const item of on.schedule ?? []) {
    if (moreOftenThanWeekly(String(item.cron))) {
      problems.push(
        `${file}: schedule "${item.cron}" runs more than weekly; use a weekly cron or the self-hosted runner`,
      );
    }
  }
  for (const [name, job] of Object.entries(wf.jobs ?? {})) {
    if (!job || typeof job !== "object" || job.uses) continue;
    const runsOn = labels(job["runs-on"]);
    const selfHosted =
      runsOn.includes("self-hosted") || runsOn.includes("rr-local");
    if (
      events.includes("pull_request") &&
      !selfHosted &&
      !/\bdraft\b/.test(String(job.if ?? ""))
    ) {
      problems.push(
        `${file}: job ${name} runs hosted on pull_request but does not skip drafts`,
      );
    }
    if (!selfHosted && runsOn.some((l) => COSTLY_RUNNER.test(l))) {
      problems.push(
        `${file}: job ${name} uses a costly hosted runner (${runsOn.join(", ")})`,
      );
    }
    if (typeof job["timeout-minutes"] !== "number") {
      problems.push(`${file}: job ${name} needs timeout-minutes`);
    }
  }
  return problems;
}

/** @param {string} dir workflows directory */
export function checkDirectory(dir) {
  return readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .flatMap((f) => findCostProblems(f, readFileSync(join(dir, f), "utf8")));
}

if (import.meta.main) {
  const { positionals } = parseArgs({ allowPositionals: true });
  const problems = checkDirectory(positionals[0] ?? ".github/workflows");
  for (const p of problems) console.error(p);
  process.exit(problems.length === 0 ? 0 : 1);
}
