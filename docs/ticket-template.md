# Ticket template

Every new Jira ticket carries these sections, in this order. Keep it short: link `_review/PROGRAM.md` and [defects-we-dont-create.md](defects-we-dont-create.md) instead of pasting rules.

```markdown
**Why:** one or two sentences: the outcome and who it helps.

**Repo / files:** repository link and default branch. May change: paths. Must not change: paths.

**Build:** bullets, each small enough to review on its own.

**Done when:**

- numbered, checkable criteria
- Proof: the exact command (for example `npm run check`) and the CI check that must be green

**Depends on:** ticket keys, or none. **Blocks:** ticket keys, or none.

**Out of scope:** what this ticket must not do.

**Route:** the vendor that builds it. **Reviewer:** a different vendor.

**Data:** synthetic or the company's own only; no client data, no secrets.
```

## Size limits

- One ticket is one PR. If the Build list needs more than about 400 changed lines or more than one repo, split it.
- At most 7 Build bullets and 6 Done-when criteria.
- The route and the reviewer are different vendors.
- Exactly one `journey-*` label from the fixed list (onboarding, test-management, test-data, test-execution, reporting, admin-cost, qa-community, design-ui, platform, code-quality); sub-tasks take their parent's.

## Every fix ticket also

Adds a guard that fails the whole class, updates the finding's Status with the PR link in `docs/findings/`, and ends with a Jira comment naming the PR, the guard and the lesson.
