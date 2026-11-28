# AGENTS.md — @buildproveship/config

This repo is the one source of the shared ESLint, Prettier, tsconfig and Renovate settings, the
`buildproveship-guardrails` checker and the `buildproveship-code-quality` skill. Every BuildProveShip repo consumes it.

## Code quality (all changes)

Follow `skills/buildproveship-code-quality/SKILL.md` before writing code and before saying a change is done: no legacy
or compatibility code without a named consumer; search npm, the SDK, the framework or the CLI before writing a
helper; import shared code from `@buildproveship/test-management`, TDM `dev-fixtures`, `@buildproveship/config`,
`@buildproveship/ui-web` or `@buildproveship/tokens`, never copy it; depend on published `^` versions only; never weaken
a lint rule, test or guard to go green, and give every disable comment a reason; READMEs describe today's code.
An app takes its colours and components only from `@buildproveship/tokens` and `@buildproveship/ui-web`: no literal colour, no re-declared palette variable and no local copy of a ui-web component. List the app's source globs in `designSystem.paths` in `buildproveship-guardrails.json` and `check:guardrails` fails on any of them. Renovate opens ui-web and tokens updates at once and merges them when `ci` is green, so keep up with them.
The check command is `npm run check`; it runs `npm run check:guardrails`, which `pr.yml` enforces on every PR.

## Working here

- Git hooks (`.husky/`, from `hooks/`) run on every commit and push. Never use `--no-verify`, never edit a hook to get past it, never push to `main`.
- The skill's source is `skill/buildproveship-code-quality/`. Edit it there, then run `node guardrails/cli.js sync` so
  this repo's own copy under `skills/` matches; consumers get it with `npx buildproveship-guardrails sync` after
  upgrading.
- A new error-level rule (ESLint or guardrails) is a major release; a fix or a narrower rule is a minor or patch.
  Measure a new rule against every consumer repo before releasing it, and list the counts in the PR.
- Release: bump `version`, add a `CHANGELOG.md` entry, merge, push tag `vX.Y.Z` on `main`.

## Delivery rules

- Rules for people and agents: [How we work](https://noisegatemusicstudios.atlassian.net/wiki/spaces/RRDOCS/pages/27328513) and [Reuse first](https://noisegatemusicstudios.atlassian.net/wiki/spaces/RRDOCS/pages/27230233).
- Read only the ticket's **Agent brief** first ([template](https://noisegatemusicstudios.atlassian.net/wiki/spaces/RRDOCS/pages/26411190): Goal, Files, Done when, Blocked by/Reuses, Model); history and background are in the comments.
- Before you create a ticket, a branch or a helper, search Jira and the Reuse first list, then extend or link what exists.
- Fetch and rebase on `origin/main` before every push, open draft pull requests, and run the checks locally before CI.
- Push once: keep the pull request a draft until the full local check passes, then push and mark it ready in the same turn. Every push to a ready pull request starts CI, and CI minutes are capped (US$10/month across the org); do not push fixes one at a time to a ready pull request. Run `npm run check:workflow-cost` on `.github/workflows` before adding or changing a workflow.
