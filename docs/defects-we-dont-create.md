# Defects we don't create

The classes of defect the Nov 2026 cross-repo review found. Every agent and vendor reads this before writing code, and every repo's `AGENTS.md` links it. The rules behind each point are in the `buildproveship-code-quality` skill and the guardrails (`skill/buildproveship-code-quality/references/checks.md`); the programme decisions are in `_review/PROGRAM.md`.

- Don't hand-write what a maintained library already does (ZIP or XML parsing, JWT verification, canonical JSON, WCAG contrast). Search npm, the SDK, the framework or the CLI first.
- Don't redeclare contract types or schema primitives. Import them from `@buildproveship/test-management`, TDM `dev-fixtures`, `@buildproveship/ui-web` or `@buildproveship/tokens`.
- Don't keep legacy, `v1` or compatibility code. Nothing is in production; delete it, or name its current consumer.
- Don't let a source file grow past 1,000 lines. Split it by responsibility.
- Don't copy and paste. Duplication stays at or below 1%; extract the shared module.
- Don't pin dependencies to a SHA, tarball, `file:` path or `dist/` alias. Depend on published `^` versions.
- Don't weaken a lint rule, test or guard to go green. Fix the cause.
- Don't add `eslint-disable`, `@ts-ignore` or `any` without a reason a reviewer can check.
- Don't skip tests (`.skip`, `.todo`); fix or delete them.
- Don't leave docs stale. READMEs describe today's code; history goes in `CHANGELOG.md` or `docs/history/`.
- Don't commit build output (`dist/`, `build/`) or `.DS_Store`.
- Don't build UI from literal colours or local copies of ui-web components. Use tokens and shared components.
- Don't ship a fix without a guard. Add the cheapest check that fails the whole class (skill rule 9), update the findings record and comment on the Jira ticket.
- Don't put secrets or client data in code, tests or tickets.
