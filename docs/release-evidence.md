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
JSON. It does not run consumers, fetch logs, publish, create tags, or change CI. It is a local evidence
check, not an automatic release gate. Recollect evidence if the candidate changes; never backfill
missing historical measurements with guessed counts. Consumer fixes and adoption remain separate work.
