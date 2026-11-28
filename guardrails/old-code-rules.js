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
 * HTML element names (plus the `<think>` tag some models emit). A regex over these is HTML or model-text scanning, not
 * XML parsing, so the XML rule skips it (the Nov 2026 rollout measured these as false positives).
 */
const htmlTags =
  "a|abbr|article|aside|body|br|button|caption|code|div|em|embed|footer|form|h[1-6]|head|header|html|iframe|img|input|label|li|link|main|meta|nav|object|ol|option|p|path|pre|script|section|select|span|strong|style|svg|table|tbody|td|textarea|th|thead|title|tr|think|ul";

/** A tag-shaped pattern (`<name`, not an HTML element) with a negated-`>` class or lazy wildcard, in a regex or `RegExp` string. */
const xmlRegexPattern = new RegExp(
  String.raw`(?:\/|RegExp\(\s*["'\x60])[^\n]*<\\?\/?(?:\((?!(?:${htmlTags})\b))?(?:(?!(?:${htmlTags})\b)[A-Za-z:_]|\[)[^\n]*(?:\[\^>\]|\.\*\?|\[\\s\\S\]\*?\??)[^\n]*(?:>|\\?\/)`,
);

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
      pattern: xmlRegexPattern,
      message:
        "regex-built XML parsing: use a maintained parser such as fast-xml-parser or sax",
    },
  ]);
}

/** Path segments that name old versions or compatibility code: `v1`, `legacy`, `compat` as a whole word (`v1.9.2` is an upstream version number, not an old path). */
const legacyPathSegment = /(?:^|[._-])(?:v1(?!\.\d)|legacy|compat)(?:[._-]|$)/i;

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
