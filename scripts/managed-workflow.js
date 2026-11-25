import { isDeepStrictEqual } from "node:util";
import { parse } from "yaml";

const SHARED_REF =
  /buildproveship\/config\/\.github\/(?:workflows\/reusable-ci\.yml|actions\/install-gitleaks)@[a-f\d]{40}\b/g;

/**
 * Use the existing YAML parser and structural equality, not job-name heuristics.
 * Only release references may change. A managed PR-only caller keeps its triggers.
 * Unknown jobs, inputs, permissions, runners or setup require governance review.
 * @param {string} before
 * @param {string} expected
 * @param {string} sha
 * @returns {string | null}
 */
export function updateManagedWorkflow(before, expected, sha) {
  try {
    const normalize = (/** @type {string} */ text) =>
      parse(
        text.replace(SHARED_REF, (ref) =>
          ref.replace(/@[a-f\d]{40}$/, `@${sha}`),
        ),
      );
    const existing = normalize(before);
    const managed = normalize(expected);
    if (existing?.on?.pull_request && existing.on.push === undefined)
      delete managed.on.push;
    if (!isDeepStrictEqual(existing, managed)) return null;
    return before.replace(SHARED_REF, (ref) =>
      ref.replace(/@[a-f\d]{40}$/, `@${sha}`),
    );
  } catch {
    // Invalid/ambiguous YAML cannot establish managed ownership; never overwrite it.
    return null;
  }
}

/** @param {string} text every repo runs on rr-local, so a GitHub-hosted job is a runner migration */
export function additionalWorkflowReview(text) {
  try {
    const workflow = parse(text);
    const events =
      typeof workflow?.on === "string"
        ? [workflow.on]
        : Array.isArray(workflow?.on)
          ? workflow.on
          : Object.keys(workflow?.on ?? {});
    if (
      events.some((/** @type {string} */ event) =>
        ["pull_request", "pull_request_target"].includes(event),
      )
    )
      return "additional pull-request checks";
    for (const job of Object.values(workflow?.jobs ?? {}))
      if (
        typeof job["runs-on"] === "string" &&
        job["runs-on"].startsWith("ubuntu-")
      )
        return "runner migration";
    return null;
  } catch {
    return "invalid workflow YAML";
  }
}
