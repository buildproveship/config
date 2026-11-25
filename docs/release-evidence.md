# New-rule release evidence

[AGENTS.md](../AGENTS.md) requires a major release for a new error-level ESLint or guardrails rule,
measurement against every consumer before release, and counts in the PR. A fix or narrower rule
has a different release policy; the command below does not classify changes or choose a version.

For a proposed new-rule release, collect real measurements and run:

```sh
npm run --silent release:evidence -- --evidence /path/to/measurements.json
```

The JSON contains `baseCommit` (the prior release commit), `candidateCommit` (the measured Config
commit), `newRules` (the rule IDs), and `consumers`. Each consumer has `name`, `commit` (the measured
consumer commit), `command`, `evidenceUrl` (an HTTPS log or PR link), and `counts` (an object mapping
every new rule ID to its nonnegative integer finding count). Use full Git commit IDs. Keep credentials
and private log content out of this public repository; the command prints the supplied evidence links.

The command reads committed package versions and the candidate's existing
[supported repository inventory](../scripts/rollout-repos.json), including targets skipped by rollout.
It rejects a missing major increase, unrelated/missing Config commits, missing/duplicate consumers,
missing rule counts and malformed evidence. It prints a Markdown table for the release PR. Nonzero
counts are valid impact evidence, not permission to release or adopt the change.

Reviewers must verify that the base is the intended prior release, the inventory includes every current
consumer, measurements use the stated Config candidate and consumer commits, all new rules are listed,
and linked logs substantiate the counts. The command cannot establish those facts from assertions in
JSON. It does not run consumers, fetch logs, publish, create tags, or change CI. The standalone command is a local evidence
check; the required release gate described below reuses it for stricter releases. Recollect evidence if the candidate changes; never backfill
missing historical measurements with guessed counts. Consumer fixes and adoption remain separate work.

## Required future release declaration

The release workflow runs `npm run release:check` before its existing checks and publish step.
Every future release using this workflow must commit a root `release-plan.json` with `version`,
`baseCommit`, `classification` and `rationale`. Missing declarations, unknown classifications and
version mismatches fail closed. The base is the prior release commit; reviewers verify that selection.

Use `classification: "stricter-rules"` for new error-level rules or changes that make existing rules
reject previously accepted code, such as tighter thresholds. Include `evidence` containing the same
measurement object described above. All affected rule IDs go in `newRules`, including tightened rules.
This classification requires a major bump and complete consumer counts. No counts are invented or
inferred from a version number, changed filename, or empty result.

Use `classification: "routine"` only when the release introduces no such enforcement increase, and
explain that assessment in `rationale`. Routine releases do not require consumer measurements.
Classification is a visible release-PR decision: reviewers compare the entire diff since `baseCommit`
with the rationale. The checker validates the declaration, not the semantics of arbitrary rule code;
a false routine declaration cannot be detected reliably by this command.

For stricter releases, first commit the final proposed release content and measure that commit. Then
commit only `release-plan.json`, embedding the evidence whose `candidateCommit` identifies the measured
commit. The gate rejects any other committed content change after measurement, including package version,
inventory, source and documentation changes. This avoids a self-referencing evidence commit while keeping
the measured release content exact. Run `npm run release:check` on the final committed tree before merge.
A later code change requires new measurements. The command reads committed files, not dirty worktree edits.

The gate applies only when the updated workflow executes. It does not prevent tag creation, replace
branch/tag protections, authorize publication, or retroactively validate old releases.
