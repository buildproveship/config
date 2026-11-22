// Shared lint-staged config: lint and format staged files only, so pre-commit stays near 10 s. A repo's own
// lint-staged config (any file lint-staged finds) wins over this one.
export default {
  "*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}": [
    "eslint --max-warnings 0 --fix",
    "prettier --write",
  ],
  "*.{json,jsonc,md,yml,yaml,css,html}": "prettier --write",
};
