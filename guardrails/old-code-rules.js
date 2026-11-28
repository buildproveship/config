// Rules for legacy and hand-rolled code: legacy markers, regex-built XML parsers and v1/legacy/compat path names.
import {
  alwaysExcluded,
  generatedGlobs,
  matches,
  scanLines,
  skillCopies,
  sourceGlob,
} from "./rules.js";

/** @typedef {import("./rules.js").Rule} Rule */

/**
 * Standard 1: RR-03, RR-04, TM-11, TM-12, UPF-01, UPF-02, FUI-17. Deprecated, legacy and compatibility code.
 *
 * @type {Rule}
 */
function legacyMarkers(repo) {
  return scanLines(repo, sourceGlob, [
    {
      rule: "legacy-marker",
      pattern:
        /@deprecated\b|legacy|\bbackwards?[- _]?compat|\bcompat(?:ibility)?[ _-]?(?:layer|shim|mode|path|alias|code|wrapper|reader)\b|\bshims?\b|\bTODO:?\s*remove\b/i,
      message:
        "legacy/compatibility marker: delete the old code, or name its current consumer in an allowlist entry",
    },
  ]);
}

/**
 * Nov 2026 review: hand-written XML parsers (a regex over tag text) break on attributes, entities, CDATA and nesting.
 * A tag-shaped pattern with a negated-`>` class or a lazy wildcard is the signature; use a maintained parser.
 *
 * @type {Rule}
 */
function handWrittenXmlParser(repo) {
  return scanLines(repo, sourceGlob, [
    {
      rule: "hand-written-xml-parser",
      pattern:
        /(?:\/|RegExp\(\s*["'`])[^\n]*<\\?\/?[A-Za-z:_\\([][^\n]*(?:\[\^>\]|\.\*\?|\[\\s\\S\]\*?\??)[^\n]*(?:>|\\?\/)/,
      message:
        "regex-built XML parsing: use a maintained parser such as fast-xml-parser or sax",
    },
  ]);
}

/** Path segments that name old versions or compatibility code: `v1`, `legacy`, `compat` as a whole word. */
const legacyPathSegment = /(?:^|[._-])(?:v1|legacy|compat)(?:[._-]|$)/i;

/**
 * Nov 2026 review: kept `v1`/`legacy`/`compat` files and folders hold the old path next to the new one. Generated
 * sources and the repo's `contractPaths` (published contract versions that keep `v1` in their import path) are exempt.
 *
 * @type {Rule}
 */
function legacyPathNames(repo, config) {
  const exempt = [
    ...generatedGlobs(config),
    ...(config.contractPaths ?? []).map((entry) => entry.path),
  ];
  return repo.paths
    .filter(
      (path) =>
        !matches(path, [...alwaysExcluded, ...skillCopies, ...exempt]) &&
        path.split("/").some((segment) => legacyPathSegment.test(segment)),
    )
    .map((path) => ({
      rule: "legacy-path-name",
      path,
      line: 0,
      message:
        "file or folder named v1/legacy/compat: delete the old path, or list a published contract folder in contractPaths (with a reason)",
    }));
}

/** Every legacy and hand-rolled-code rule, in report order. */
export const legacyRules = [
  legacyMarkers,
  handWrittenXmlParser,
  legacyPathNames,
];
