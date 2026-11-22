# Agent instructions

Read [.github/copilot-instructions.md](.github/copilot-instructions.md) before working in this repository. It holds the shared rules, including tests and classification.

## Code quality (all changes)

Follow `skills/releaseready-code-quality/SKILL.md` before writing code and before saying a change is done: no legacy
or compatibility code without a named consumer; search npm, the SDK, the framework or the CLI before writing a
helper; import shared code from `@releaseready/test-management`, TDM `dev-fixtures`, `@releaseready/config`,
`@releaseready/ui-web` or `@releaseready/tokens`, never copy it; depend on published `^` versions only; never weaken
a lint rule, test or guard to go green, and give every disable comment a reason; READMEs describe today's code.
The check command is `<command>`; it runs `npm run check:guardrails`, which `pr.yml` enforces on every PR.

## Delivery rules

- Rules for people and agents: [How we work](https://noisegatemusicstudios.atlassian.net/wiki/spaces/RRDOCS/pages/27328513) and [Reuse first](https://noisegatemusicstudios.atlassian.net/wiki/spaces/RRDOCS/pages/27230233).
- Read only the ticket's **Agent brief** first ([template](https://noisegatemusicstudios.atlassian.net/wiki/spaces/RRDOCS/pages/26411190): Goal, Files, Done when, Blocked by/Reuses, Model); history and background are in the comments.
- Before you create a ticket, a branch or a helper, search Jira and the Reuse first list, then extend or link what exists.
- Fetch and rebase on `origin/main` before every push, open draft pull requests, and run the checks locally before CI.
