# Temporary `ci / ci` bypass while the Actions budget is spent

Decision: Rahul, 25 Nov 2026 (RRDPLAT-114). The org's GitHub Actions budget (US$10/month) is spent, so GitHub-hosted jobs
cannot start and `ci / ci` cannot report on repos that use hosted runners. Until the billing cycle resets, agents run the
full checks locally on Rahul's Mac, post the evidence on the pull request, and merge with the org ruleset's bypass.

## Turning it on (Rahul, once)

The ruleset "main - all repos (ci / ci)" has an empty bypass list. Add yourself (or the Admin role) as a bypass actor with
mode "For pull requests only". Agents cannot edit the ruleset. Do not remove the `ci / ci` rule itself.

## Evidence every bypassed PR needs

Post one comment on the PR, before merging, with:

1. The exact command run (the repo's own `check-command` from its `pr.yml`) and the commit SHA it ran on.
2. The final verdict line and exit code, from a clean checkout of that SHA on the Mac.
3. The names of any suites skipped and why (none is the expected answer).
4. `Bypass: RRDPLAT-114, budget spent, expires at billing reset`.

No evidence, no bypass merge. A failing local check is never bypassed.

## Turning it off (on or after the reset)

The reset is expected on 1 Dec 2026; confirm the date on the org billing page. Then:

1. Remove the bypass actor from the ruleset.
2. Open a throwaway PR and confirm `ci / ci` runs and is required again.
3. Close RRDPLAT-114 and re-run the RRDPLAT-108 billing check.

## Keeping it from happening again

`npm run check:workflow-cost` (part of `npm run check`) fails on hosted macOS or Windows or larger runners, jobs without
`timeout-minutes`, `push` triggers without a branch or tag filter, and schedules that run more than weekly. Consumers
should run it against their own `.github/workflows`.
