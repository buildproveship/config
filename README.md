# @buildproveship/config

One source for the code-quality settings every BuildProveShip repo uses: an ESLint flat config, a Prettier config, a strict
tsconfig base, a Renovate preset, the `releaseready-guardrails` checker and the `buildproveship-code-quality` skill.
Published to GitHub Packages as `@buildproveship/config`.

## Install

Add the scope to the repo's `.npmrc`:

```ini
@buildproveship:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Keep the environment-variable reference literal in `.npmrc`; never put a token value in the file.

Then install it with its peers. Locally you need a token with `read:packages` (for example `gh auth refresh -s read:packages`
and `export NODE_AUTH_TOKEN=$(gh auth token)`); in GitHub Actions `actions/setup-node` with
`registry-url: https://npm.pkg.github.com` and `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` is enough, because the package is
public.

```sh
npm install --save-dev @buildproveship/config eslint prettier typescript
```

## ESLint

```js
// eslint.config.js
import { defineConfig } from "eslint/config";
import { releaseready } from "@buildproveship/config/eslint";

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
{ "prettier": "@buildproveship/config/prettier" }
```

Prettier's defaults (double quotes, trailing commas, 80 columns), spelled out so a Prettier major cannot change them.

## tsconfig

```json
{
  "extends": "@buildproveship/config/tsconfig.json",
  "compilerOptions": { "module": "NodeNext", "outDir": "dist" },
  "include": ["src", "tests"]
}
```

The base sets the strictness and interop options only (`strict`, `noUnusedLocals`, `noUnusedParameters`,
`noImplicitReturns`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, …). Module system, `lib`, `types`, paths and
output stay in each repo because they differ by runtime.

## Renovate

```json
{ "extends": ["github>buildproveship/config"] }
```

Weekly (Monday before 06:00 Hong Kong time), 3-day minimum release age, pinned versions and action digests, grouped
non-major dev updates, one group for lint/format/typecheck tooling, security updates at any time. Renovate needs the
[Renovate GitHub App](https://github.com/apps/renovate) installed on the `buildproveship` organisation.

## Local quality gates and CI

Nothing should reach GitHub unless it passes on the developer's machine, so CI only confirms. One `prepare` line installs
three [Husky](https://typicode.github.io/husky/) hooks, each a script in [`hooks/`](hooks):

```sh
npm install --save-dev @buildproveship/config
npm pkg set scripts.prepare="releaseready-hooks install"
npm install # runs prepare; commit the generated .husky/ files
```

`gitleaks` must be on the PATH (`brew install gitleaks`; in CI use [`install-gitleaks`](.github/actions/install-gitleaks)). `install` does nothing when `CI` or `HUSKY=0` is set. It refuses custom hooks or conflicting Husky files before changing Git configuration or hook contents. Integrate consumer hook behavior deliberately before adopting the shared hooks; fresh installs and recognized generated wrappers can be refreshed.

| Hook         | Runs                                                                                                                                                                             | Budget  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `pre-commit` | lint-staged (ESLint `--fix` and Prettier on staged files; a repo's own lint-staged config wins over [the shared one](hooks/lint-staged.config.js)), then `gitleaks git --staged` | ~10 s   |
| `commit-msg` | the subject must match `^[A-Z][A-Z0-9]+-\d+: ` (any Jira project key, for example `RRDPLAT-104: add hooks`), so the commit shows in the ticket's Development panel               | instant |
| `pre-push`   | blocks pushes to `main`; fetches `origin/main` and requires the branch to be rebased on it; then the `typecheck` script and the tests affected by the change                     | ~2 min  |

`pre-push` tests the working tree, so it only accepts the checked-out branch (one branch per push) with no uncommitted
changes to tracked files. A moved file counts at both ends: moving `src/a.ts` into `docs/` still runs the tests.

A hook prints how long it took and warns when it is over budget; the warning never fails the push.

Affected tests: `pre-push` runs the repo's `test:affected` script with the changed files as arguments (for Vitest,
`"test:affected": "vitest related --run"`). A repo without that script runs its `test` script, which must fit the budget.
A change that touches only `*.md`, `docs/` or `LICENSE` skips type-check and tests. Full E2E is never in a hook: run
`npm run check:full`.

`npx releaseready-hooks verify` runs `npm run check`, the same command CI runs.

`npx releaseready-hooks verify-clean` checks committed `HEAD` in a disposable local clone: normal `npm ci`
(including lifecycle scripts), then `npm run check`. It requires a committed npm lockfile. Dependencies and generated
outputs must be produced by those ordinary commands; it does not borrow the caller's `node_modules`, ignored output
or untracked helpers. Paths with spaces are supported. The caller's files and Git configuration are left untouched,
and the temporary clone is removed on normal success or failure. A terminated process can leave its temporary clone.

This explicit verification does not change the faster `verify` or pre-push behavior. It tests committed code, so
uncommitted edits are not included. Normal npm authentication and tool availability still apply. The clone retains
Git history, the caller's fetched `origin/main` and configured hook location; its remote points to the local source clone, not to a hosted
service. Checks requiring other external state or custom bootstrap steps still need their project-specific setup.
The command is not a process sandbox.

### `--no-verify`

`git commit --no-verify` and `git push --no-verify` skip every hook above. **Agents must never use them**, never disable
or edit a hook, and never push to `main`; a failing hook is fixed at its cause. The shared agent rules say so
(`templates/copilot-instructions.md`). A person may use it only to save work in progress on a branch nobody has asked to review, and CI and review still apply.

### CI workflows

`npm ci` installs `@buildproveship/config` from GitHub Packages, so the callers grant `packages: read` and the workflows pass
`github.token` as `NODE_AUTH_TOKEN`. Call these from the repo's own workflows with the templates in [`templates/workflows/`](templates/workflows), pinned to
the full commit sha of a release tag:

- [`reusable-ci.yml`](.github/workflows/reusable-ci.yml): runs for ready pull requests and `main` (drafts are skipped; the
  caller adds `ready_for_review`), one run per PR (`cancel-in-progress`), docs-only PRs skip the checks
  (`docs-only-pattern`), caches npm and, with `cache-paths`, build output. The required status check is the job `ci`; a
  skipped run counts as passed. It runs `check-command` (default `npx releaseready-hooks verify`).
- [`reusable-nightly.yml`](.github/workflows/reusable-nightly.yml): the full E2E (`npm run check:full`) on a schedule.
- [`templates/copilot-setup-steps.yml`](templates/copilot-setup-steps.yml): the Copilot coding agent's environment
  installs Node, dependencies and the pinned, checksum-verified `gitleaks` prerequisite through the [shared action](.github/actions/install-gitleaks).
  The copied workflow includes an immutable installer reference; the rollout renderer substitutes the already-selected Config release SHA.
  Both paths install the scanner once. The agent rules tell it to run `npx releaseready-hooks verify` before it opens a pull request.

The `runner` input defaults to the owner's self-hosted `rr-local` runner (RRDPLAT-114, 25 Nov 2026: the org's
GitHub-hosted Actions budget was spent), so no repo needs a runner rule of its own. **Pull requests from forks always run on `ubuntu-24.04`**: this repo and its consumers
can be public, and the self-hosted runner must never execute a stranger's code. The nightly workflow never runs for pull
requests.

## Guardrails and the code-quality skill

`releaseready-guardrails` is the mechanical half of the
[`buildproveship-code-quality` skill](skill/buildproveship-code-quality/SKILL.md), which encodes the 191 findings of the
18 Nov 2026 cross-repo review. Run it from the repo root:

```sh
npx releaseready-guardrails            # static rules + knip + jscpd; what pr.yml runs (wrap it in npm run check:guardrails)
npx releaseready-guardrails --static   # static rules only
npx releaseready-guardrails sync       # copy the skill to skills/buildproveship-code-quality/ and .claude/skills/
npx releaseready-guardrails baseline   # allow entries for today's findings, reasons left empty
```

The rules, the allowlist format (`releaseready-guardrails.json`, validated by
[`guardrails/config.schema.json`](guardrails/config.schema.json)) and the AGENTS.md block are in
[the checks reference](skill/buildproveship-code-quality/references/checks.md). The skill's repo copy must equal the
published one (`skill-drift`), so it changes only here.

## Shared test setup

For the WebdriverIO and Playwright frameworks (appium2, UPF); synthetic values only, no secrets.

- `@buildproveship/config/dotenv`: `loadEnv({ path?, processEnv? })` reads a `.env` file into `process.env` (dotenv; values already set win; a missing file is fine) and returns what the file held.
- `@buildproveship/config/allure`: `allureReporter(options?)` returns the `["allure", { outputDir: "allure-results", ...options }]` reporter tuple: `reporters: ["spec", allureReporter()]`. The repo installs `@wdio/allure-reporter` itself.
- `@buildproveship/config/templates/AGENTS.md`, `CLAUDE.md` and `copilot-instructions.md`: the shared agent rule files (test classification, design before implementation). Copy them into the repo once, then add repo-specific rules above the shared sections; fill in the check command in the AGENTS.md and CLAUDE.md code-quality block.

## Security scanners

`.github/actions/security-scan` runs gitleaks (full git history), trivy fs (vuln, secret, misconfig; HIGH and CRITICAL,
fixed only), semgrep (`p/default`) and zizmor on every PR. It runs on Linux x64 and on macOS arm64 (the self-hosted
`rr-local` runner; python3 must be installed for semgrep) and picks the pinned, checksum-verified binary by `runner.os` and
`runner.arch`. Add a job to `pr.yml`:

```yaml
security:
  runs-on: ubuntu-24.04 # a self-hosted repo: [self-hosted, rr-local]
  timeout-minutes: 15
  steps:
    - uses: actions/checkout@<sha> # same pin as the other jobs
      with:
        fetch-depth: 0
        persist-credentials: false
    - uses: buildproveship/config/.github/actions/security-scan@<full commit sha of the release tag>
```

Existing findings go in a baseline in the consumer repo, never a switch-off:

- gitleaks: `.gitleaks-baseline.json` (`gitleaks git --report-path .gitleaks-baseline.json --redact` once; review each
  entry first, a live secret is rotated, not baselined).
- trivy: `.trivyignore`, one id per line with a reason comment above it.
- semgrep: a tracked TypeScript file that uses `satisfies` as an identifier fails the scan (Semgrep skips such lines without failing); rename the identifier. Other findings take an inline `nosemgrep: <rule-id> -- reason` comment on the line.
- zizmor: `.github/zizmor.yml` with `rules.<id>.ignore` entries and a reason comment each.

## Python

Python repos cannot consume the ESLint config; observability keeps the equivalent ruff and `mypy --strict` settings in
its own `pyproject.toml`, runs vulture and pip-audit, uses the same Renovate preset, and runs `releaseready-guardrails`
through `npx` for the language-neutral rules (legacy markers, README history, skill drift, jscpd).

## Rollout planning

`node scripts/rollout.js --dry-run --repo <name>` reviews a consumer against this repository's shared workflow
templates. An existing managed workflow can update its pinned shared release while retaining its triggers,
permissions, runner and setup. A PR-only caller stays PR-only. Missing workflows use the shared templates.

Custom jobs, setup, inputs or permissions require governance review before migration; the planner reports the
conflicting path and proposes no changes or hook installation for that consumer. Additional PR workflows and
private workflows needing runner migration also require review. Other workflows are never rewritten incidentally.
`--apply` refuses these warnings before modifying the checkout, installing dependencies or creating a PR.
First establish which checks are necessary and verify their coverage in the shared workflow or explicit shared
inputs. A similar job name is not evidence that a check is redundant.

For a later rollout attempt, inspect the previous attempt first, then select a fresh branch with
`--branch <name>` on either task. The dry run prints the selected branch. The default task branch is unchanged.
An existing open PR on the task’s default or selected branch is reported without changes, so a fresh attempt does
not duplicate active work. A closed PR or an orphan branch on the selected branch still
stops the apply. The tool never resets, force-pushes, reopens or overwrites that branch. Branch names are validated
by Git, and `main` and checkout-history shorthand are rejected before remote operations.

## Releasing

Bump `version` in `package.json`, add a `CHANGELOG.md` entry, merge, then push a tag `vX.Y.Z` on `main`. The Release
workflow checks that the tag matches `package.json`, runs `npm run check` and publishes with the workflow's
`GITHUB_TOKEN`. Use semver: a new error-level rule is a major release.

## Licence

Apache-2.0. See [LICENSE](LICENSE).
