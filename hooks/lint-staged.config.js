// Shared lint-staged config: lint and format staged files only, so pre-commit stays near 10 s. A repo's own
// root config enables normal closest-config discovery; without it the hook uses this explicit fallback.
// `--no-warn-ignored`: a generated file the repo's ESLint config ignores is staged for Prettier only. Without the flag
// ESLint reports it as a warning and `--max-warnings 0` fails the commit.
export default {
  "*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}": [
    "eslint --max-warnings 0 --no-warn-ignored --fix",
    "prettier --write",
  ],
  "*.{json,jsonc,md,yml,yaml,css,html}": "prettier --write",
};
