import { matches, skillCopies, testGlobs } from "./rules.js";

/** @typedef {import("./rules.js").Finding} Finding */
/** @typedef {import("./rules.js").Rule} Rule */

/**
 * Components exported by `@buildproveship/ui-web` (v8). An app that declares one of these names itself holds a second component set.
 * Keep in step with `packages/ui-web/src/v8/index.ts` in frontend-ui.
 */
const uiWebComponents = [
  "Button",
  "Callout",
  "Checkbox",
  "ChoiceCards",
  "ContextPanel",
  "DataTable",
  "Dialog",
  "DialogStage",
  "DiffList",
  "EmptyState",
  "FactList",
  "Field",
  "FieldRow",
  "FilterChips",
  "Icon",
  "JourneyStepper",
  "Loading",
  "Meter",
  "Notice",
  "PageHeader",
  "ResultCard",
  "RunStatus",
  "Scope",
  "SegmentedControl",
  "Select",
  "SideNav",
  "Skeleton",
  "StatGrid",
  "StateMessage",
  "StatusBadge",
  "SummaryCard",
  "TabNav",
  "Tabs",
  "Tag",
  "Timeline",
  "ToastRegion",
  "TwoColumn",
  "VersionBundle",
  "VersionCard",
];

const uiWebComponentDeclaration = new RegExp(
  `\\b(?:function\\s+|(?:const|let|var)\\s+)(?:${uiWebComponents.join("|")})\\b\\s*(?:=|\\(|<)`,
);

/** A literal colour: a hex value, or an rgb, hsl, oklch, lab or color function call. */
const literalColour =
  /#[0-9a-fA-F]{3,8}\b(?![\w-])|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/;

/**
 * Design-lint rule 10: an app that opts in with `designSystem.paths` builds its screens from `@buildproveship/ui-web` and
 * `@buildproveship/tokens`. A local component with a ui-web name is a second component set, and a literal colour bypasses the tokens
 * (the palette changes in one place). Token declarations in a CSS custom property line are exempt only in the packages themselves.
 *
 * @type {Rule}
 */
export function designSystemBypass(repo, config) {
  const paths = config.designSystem?.paths;
  if (!paths?.length) return [];
  /** @type {Finding[]} */
  const findings = [];
  for (const path of repo.paths.filter(
    (p) =>
      matches(p, paths) &&
      matches(p, "**/*.{ts,tsx,css}") &&
      !matches(p, testGlobs) &&
      !matches(p, skillCopies),
  )) {
    repo
      .read(path)
      .split("\n")
      .forEach((text, index) => {
        const code = text.replace(/\/\/.*$|\/\*.*?\*\//g, "");
        if (!path.endsWith(".css") && uiWebComponentDeclaration.test(code)) {
          findings.push({
            rule: "local-ui-component",
            path,
            line: index + 1,
            message:
              "local copy of a @buildproveship/ui-web component: import it from @buildproveship/ui-web (or add the variant to ui-web in frontend-ui)",
            text,
          });
        }
        if (literalColour.test(code)) {
          findings.push({
            rule: "literal-colour",
            path,
            line: index + 1,
            message:
              "literal colour: use a @buildproveship/tokens variable (var(--rr-v8-*)) so the palette changes in one place",
            text,
          });
        }
      });
  }
  return findings;
}
