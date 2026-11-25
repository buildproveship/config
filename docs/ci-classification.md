# Shared change classification

`.github/workflows/classify-changes.yml` is a reusable workflow for the docs-only decision. It needs Bash,
`gh` and `grep`, with `pull-requests: read`; it does not check out project code, install dependencies, or require
Node or npm. Callers receive the string output `docs_only`. Only the exact value `true` permits the existing
docs-only skip. Classification or API failures fail the job and never produce a true result.

The shared Node CI (`reusable-ci.yml`) no longer calls this workflow: it runs the identical script as the first step of its single `ci` job, which saves two billed hosted minutes per run (RRDPLAT-114), and a test fails if the two scripts differ. Its runner
input, fork guard, draft behavior, skip pattern and required `ci` status remain unchanged. The `ci` log reports
that checks were not run when the docs-only policy applies. This does not broaden or narrow which docs changes
are exempt from checks; reconsidering that coverage policy is separate work.

Other toolchains can call the classifier by a reviewed, pinned Config commit and use its output to condition
their checks. A Python consumer can keep pinned `uv`, `uv sync --locked` and `sh scripts/check.sh` after the
classification job. Migration must preserve docs-only success, code-change checks and security scanning,
PR-only hosted Ubuntu, and any separate weekly/manual Docker profile. Verify the consumer's actual protected
check context before adoption. Classification reuse alone does not supply a Python check workflow or replace
those checks, schedules, runners or protection settings.
