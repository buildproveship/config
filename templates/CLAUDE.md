# Claude Code instructions

Follow the shared rules in .github/copilot-instructions.md.

@.github/copilot-instructions.md

## Code quality (all changes)

Follow `skills/buildproveship-code-quality/SKILL.md` before writing code and before saying a change is done: no legacy
or compatibility code without a named consumer; search npm, the SDK, the framework or the CLI before writing a
helper; import shared code from `@buildproveship/test-management`, TDM `dev-fixtures`, `@buildproveship/config`,
`@buildproveship/ui-web` or `@buildproveship/tokens`, never copy it; depend on published `^` versions only; never weaken
a lint rule, test or guard to go green, and give every disable comment a reason; READMEs describe today's code.
An app takes its colours and components only from `@buildproveship/tokens` and `@buildproveship/ui-web`: no literal colour, no re-declared palette variable and no local copy of a ui-web component. List the app's source globs in `designSystem.paths` in `releaseready-guardrails.json` and `check:guardrails` fails on any of them. Renovate opens ui-web and tokens updates at once and merges them when `ci` is green, so keep up with them.
The check command is `<command>`; it runs `npm run check:guardrails`, which `pr.yml` enforces on every PR.
