# @releaseready/config

One source for the code-quality settings every releaseready repo uses: an ESLint flat config, a Prettier config, a strict
tsconfig base, a Renovate preset, the `releaseready-guardrails` checker and the `releaseready-code-quality` skill.
Published to GitHub Packages as `@releaseready/config`.

## Install

Add the scope to the repo's `.npmrc`:

```ini
@releaseready:registry=https://npm.pkg.github.com
```

Then install it with its peers. Locally you need a token with `read:packages` (for example `gh auth refresh -s read:packages`
and `export NODE_AUTH_TOKEN=$(gh auth token)`); in GitHub Actions `actions/setup-node` with
`registry-url: https://npm.pkg.github.com` and `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` is enough, because the package is
public.

```sh
npm install --save-dev @releaseready/config eslint prettier typescript
```

## ESLint

```js
// eslint.config.js
import { defineConfig } from "eslint/config";
import { releaseready } from "@releaseready/config/eslint";

export default defineConfig(
  releaseready({ tsconfigRootDir: import.meta.dirname }), // add `react: true` in React repos
  { ignores: ["generated/**"] }, // repo-specific additions, each with a comment saying why
);
```

| Files             | Rules                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| every JS/TS file  | ESLint `recommended`; unused disable directives are errors; Node globals                                                                  |
| `*.ts`, `*.tsx` … | typescript-eslint `strict-type-checked` + `stylistic-type-checked`, typed through the TypeScript project service                          |
| React (`react`)   | `@eslint-react` recommended (type-checked on TS), `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y-x`, browser globals                |
| every JS/TS file  | suppressions: `eslint-disable` needs `-- reason`, no `@ts-ignore`/`@ts-nocheck`, `@ts-expect-error` needs a description, no `.only` tests |
| last              | `eslint-config-prettier`, so formatting is Prettier's job only                                                                            |

Shared rule settings, each with its reason, are in [`eslint.js`](eslint.js): `_`-prefixed unused bindings, `node:test`
calls allowed as floating promises, numbers allowed in template literals.

`@eslint-react` replaces `eslint-plugin-react`, whose 7.x line fails under ESLint 10, and `eslint-plugin-jsx-a11y-x`
(the es-tooling port, rule prefix `jsx-a11y-x/`) replaces `eslint-plugin-jsx-a11y`, whose 6.x line declares ESLint 9 at
most, so `npm ci` refuses it next to ESLint 10. Its hooks rules that duplicate
`eslint-plugin-react-hooks` are turned off, so each hooks problem is reported once.

Every TS file must be in a tsconfig the project service can find. Config files outside every tsconfig can be listed in
`allowDefaultProject`.

## Prettier

```json
{ "prettier": "@releaseready/config/prettier" }
```

Prettier's defaults (double quotes, trailing commas, 80 columns), spelled out so a Prettier major cannot change them.

## tsconfig

```json
{
  "extends": "@releaseready/config/tsconfig.json",
  "compilerOptions": { "module": "NodeNext", "outDir": "dist" },
  "include": ["src", "tests"]
}
```

The base sets the strictness and interop options only (`strict`, `noUnusedLocals`, `noUnusedParameters`,
`noImplicitReturns`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, …). Module system, `lib`, `types`, paths and
output stay in each repo because they differ by runtime.

## Renovate

```json
{ "extends": ["github>releaseready/config"] }
```

Weekly (Monday before 06:00 Hong Kong time), 3-day minimum release age, pinned versions and action digests, grouped
non-major dev updates, one group for lint/format/typecheck tooling, security updates at any time. Renovate needs the
[Renovate GitHub App](https://github.com/apps/renovate) installed on the `releaseready` organisation.

## Guardrails and the code-quality skill

`releaseready-guardrails` is the mechanical half of the
[`releaseready-code-quality` skill](skill/releaseready-code-quality/SKILL.md), which encodes the 191 findings of the
18 Nov 2026 cross-repo review. Run it from the repo root:

```sh
npx releaseready-guardrails            # static rules + knip + jscpd; what pr.yml runs (wrap it in npm run check:guardrails)
npx releaseready-guardrails --static   # static rules only
npx releaseready-guardrails sync       # copy the skill to skills/releaseready-code-quality/ and .claude/skills/
npx releaseready-guardrails baseline   # allow entries for today's findings, reasons left empty
```

The rules, the allowlist format (`releaseready-guardrails.json`, validated by
[`guardrails/config.schema.json`](guardrails/config.schema.json)) and the AGENTS.md block are in
[the checks reference](skill/releaseready-code-quality/references/checks.md). The skill's repo copy must equal the
published one (`skill-drift`), so it changes only here.

## Python

Python repos cannot consume the ESLint config; observability keeps the equivalent ruff and `mypy --strict` settings in
its own `pyproject.toml`, runs vulture and pip-audit, uses the same Renovate preset, and runs `releaseready-guardrails`
through `npx` for the language-neutral rules (legacy markers, README history, skill drift, jscpd).

## Releasing

Bump `version` in `package.json`, add a `CHANGELOG.md` entry, merge, then push a tag `vX.Y.Z` on `main`. The Release
workflow checks that the tag matches `package.json`, runs `npm run check` and publishes with the workflow's
`GITHUB_TOKEN`. Use semver: a new error-level rule is a major release.
