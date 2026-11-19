# Changelog

## 2.0.1 (2026-11-19)

- Skill: merge only when `pr.yml` is green; says where GitHub branch protection enforces it and where the local
  merge hook does (free-plan private repos).

## 2.0.0 (2026-11-19)

Breaking: new error-level rules, so consumers fix or explicitly allow each finding when they upgrade.

- ESLint: every `eslint-disable*` comment needs `-- reason` and names its rules
  (`@eslint-community/eslint-comments`); `@ts-ignore` and `@ts-nocheck` are banned and `@ts-expect-error` needs a
  description (`@typescript-eslint/ban-ts-comment`, on JS files too); focused `.only` tests fail (`no-only-tests`).
- New `releaseready-guardrails` bin: dependency sources, tsconfig private paths and strictness, builds inside
  `node_modules`, copied shared code, legacy markers, skipped tests, unexplained rule overrides, README history, skill
  drift, knip and jscpd. Allowlist with reasons and ratchet counts in `releaseready-guardrails.json`.
- Ships the `releaseready-code-quality` skill; `releaseready-guardrails sync` installs it in a repo.
- Removed the default export of `@releaseready/config/eslint`; import `{ releaseready }` (every consumer already does).

## 1.0.0 (2026-11-18)

First release: ESLint flat config (typescript-eslint strict-type-checked and stylistic-type-checked; React presets
@eslint-react, react-hooks and jsx-a11y-x), Prettier config, strict tsconfig base and Renovate preset.
