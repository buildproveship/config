// Files that never need tests or type-checks. Used by the pre-push hook; the reusable CI workflow repeats the same
// default in its `docs-only-pattern` input (test/hooks.test.js fails if the two drift).
export const DOCS_ONLY_PATTERN = String.raw`^(.*\.md|docs/.*|LICENSE)$`;

/** @param {string[]} files */
export function isDocsOnly(files) {
  const pattern = new RegExp(DOCS_ONLY_PATTERN);
  return files.length > 0 && files.every((file) => pattern.test(file));
}
