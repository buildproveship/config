// Shared ESLint flat config for releaseready repos.
//
//   // eslint.config.js
//   import { defineConfig } from "eslint/config";
//   import { releaseready } from "@releaseready/config/eslint";
//   export default defineConfig(
//     releaseready({ tsconfigRootDir: import.meta.dirname, react: true }),
//     { ignores: ["generated/**"] }, // repo-specific additions, each with a reason
//   );
//
// Rule set: ESLint `recommended` on every JS/TS file; typescript-eslint `strict-type-checked` and
// `stylistic-type-checked` on every TS file (type information from the TypeScript project service);
// for React repos @eslint-react (the maintained flat-config React rule set; eslint-plugin-react 7.x
// fails under ESLint 10), eslint-plugin-react-hooks and eslint-plugin-jsx-a11y-x (the
// es-tooling port of eslint-plugin-jsx-a11y, whose 6.x line declares ESLint 9 at most);
// eslint-config-prettier last so formatting is Prettier's job alone.
import eslintReact from "@eslint-react/eslint-plugin";
import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import jsxA11y from "eslint-plugin-jsx-a11y-x";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Build output, caches and reports that no repo should lint. */
export const defaultIgnores = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.build/**",
  "**/coverage/**",
  "**/.cache/**",
  "**/test-results/**",
  "**/playwright-report/**",
  "**/allure-results/**",
  "**/reports/**",
];

export const tsFiles = ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"];
export const jsFiles = ["**/*.js", "**/*.jsx", "**/*.mjs", "**/*.cjs"];
export const jsxFiles = ["**/*.tsx", "**/*.jsx"];

/** `_name` marks a deliberately unused binding; `{ omitted, ...rest }` drops a key from a spread. */
const unusedVars = {
  argsIgnorePattern: "^_",
  varsIgnorePattern: "^_",
  caughtErrorsIgnorePattern: "^_",
  destructuredArrayIgnorePattern: "^_",
  ignoreRestSiblings: true,
};

/** @eslint-react rules that duplicate an eslint-plugin-react-hooks rule of the same name. */
const reactHooksDuplicates =
  /** @type {import("eslint").Linter.RulesRecord} */ (
    Object.fromEntries(
      Object.keys(
        eslintReact.configs["disable-conflict-eslint-plugin-react-hooks"]
          .rules ?? {},
      ).map((rule) => [
        rule.replace(/^react-hooks\//, "@eslint-react/"),
        "off",
      ]),
    )
  );

/**
 * Rule settings every repo shares, each with its reason.
 *
 * @type {import("eslint").Linter.RulesRecord} */
const sharedTypeScriptRules = {
  "@typescript-eslint/no-unused-vars": ["error", unusedVars],
  // node:test registers describe/it/test synchronously and awaits their promises itself.
  "@typescript-eslint/no-floating-promises": [
    "error",
    {
      allowForKnownSafeCalls: [
        {
          from: "package",
          package: "node:test",
          name: [
            "describe",
            "it",
            "test",
            "suite",
            "before",
            "after",
            "beforeEach",
            "afterEach",
          ],
        },
      ],
    },
  ],
  // Numbers read naturally in messages, paths and URLs; every other type must be converted explicitly.
  "@typescript-eslint/restrict-template-expressions": [
    "error",
    {
      allowAny: false,
      allowBoolean: false,
      allowNullish: false,
      allowNumber: true,
      allowRegExp: false,
      allowNever: false,
    },
  ],
};

/**
 * @typedef {object} ReleasereadyOptions
 * @property {string} tsconfigRootDir Directory the TypeScript project service resolves tsconfig files from
 *   (pass `import.meta.dirname`).
 * @property {boolean} [react] Add the React presets (react, react-hooks, jsx-a11y) and browser globals.
 * @property {boolean} [browser] Add browser globals without the React presets.
 * @property {string[]} [allowDefaultProject] Files outside every tsconfig (such as `eslint.config.js`) that the
 *   project service may type-check with default options. Globs, at most 8 by typescript-eslint's limit.
 * @property {string[]} [project] Explicit tsconfig files instead of the project service, for repos whose files
 *   belong to tsconfigs the service cannot discover (any name other than `tsconfig.json`).
 */

/**
 * The shared configuration as a list of flat-config objects.
 *
 * @param {ReleasereadyOptions} options
 * @returns {import("eslint").Linter.Config[]}
 */
export function releaseready(options) {
  if (!options || typeof options.tsconfigRootDir !== "string") {
    throw new TypeError(
      "releaseready(): pass { tsconfigRootDir: import.meta.dirname }",
    );
  }
  const {
    tsconfigRootDir,
    react = false,
    browser = react,
    allowDefaultProject = [],
    project,
  } = options;
  const typeInformation = project
    ? { project, tsconfigRootDir }
    : {
        projectService:
          allowDefaultProject.length > 0 ? { allowDefaultProject } : true,
        tsconfigRootDir,
      };

  return defineConfig(
    { name: "releaseready/ignores", ignores: defaultIgnores },
    {
      name: "releaseready/base",
      files: [...jsFiles, ...tsFiles],
      extends: [js.configs.recommended],
      linterOptions: {
        reportUnusedDisableDirectives: "error",
        reportUnusedInlineConfigs: "error",
      },
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        globals: { ...globals.node, ...(browser ? globals.browser : {}) },
      },
      rules: { "no-unused-vars": ["error", unusedVars] },
    },
    {
      name: "releaseready/commonjs",
      files: ["**/*.cjs", "**/*.cts"],
      languageOptions: { sourceType: "commonjs" },
    },
    {
      name: "releaseready/typescript",
      files: tsFiles,
      extends: [
        tseslint.configs.strictTypeChecked,
        tseslint.configs.stylisticTypeChecked,
      ],
      languageOptions: {
        parserOptions: typeInformation,
      },
      rules: sharedTypeScriptRules,
    },
    react
      ? [
          {
            name: "releaseready/react",
            files: [...jsxFiles, ...tsFiles, ...jsFiles],
            extends: [
              reactHooks.configs.flat["recommended-latest"],
              jsxA11y.configs.recommended,
            ],
          },
          {
            name: "releaseready/react-javascript",
            files: jsFiles,
            extends: [eslintReact.configs.recommended],
          },
          {
            name: "releaseready/react-typescript",
            files: tsFiles,
            extends: [eslintReact.configs["recommended-type-checked"]],
          },
          {
            // eslint-plugin-react-hooks (the React team's rules) owns the hooks rules, so @eslint-react's
            // same-named copies are turned off. The list comes from @eslint-react's own conflict map.
            name: "releaseready/react-hooks-owner",
            files: [...jsFiles, ...tsFiles],
            rules: reactHooksDuplicates,
          },
        ]
      : [],
    prettier,
  );
}

export default releaseready;
