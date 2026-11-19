# CLAUDE.md — @releaseready/config

This repo is the one source of the shared ESLint, Prettier, tsconfig and Renovate settings, the
`releaseready-guardrails` checker and the `releaseready-code-quality` skill. Every releaseready repo consumes it.

## Code quality (all changes)

Follow `skills/releaseready-code-quality/SKILL.md` before writing code and before saying a change is done: no legacy
or compatibility code without a named consumer; search npm, the SDK, the framework or the CLI before writing a
helper; import shared code from `@releaseready/test-management`, TDM `dev-fixtures`, `@releaseready/config`,
`@releaseready/ui-web` or `@releaseready/tokens`, never copy it; depend on published `^` versions only; never weaken
a lint rule, test or guard to go green, and give every disable comment a reason; READMEs describe today's code.
The check command is `npm run check`; it runs `npm run check:guardrails`, which `pr.yml` enforces on every PR.

## Working here

- The skill's source is `skill/releaseready-code-quality/`. Edit it there, then run `node guardrails/cli.js sync` so
  this repo's own copy under `skills/` matches; consumers get it with `npx releaseready-guardrails sync` after
  upgrading.
- A new error-level rule (ESLint or guardrails) is a major release; a fix or a narrower rule is a minor or patch.
  Measure a new rule against every consumer repo before releasing it, and list the counts in the PR.
- Release: bump `version`, add a `CHANGELOG.md` entry, merge, push tag `vX.Y.Z` on `main`.
