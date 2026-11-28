# Validation of the 18 Nov 2026 review — final check (19 Nov 2026)

Every Status in the 191 rows was checked against the fresh `origin/main` of its repo (read-only: `git show`/`git grep`, `gh`, detached scratch worktrees). Per-repo detail: `side-session-notes/.../val-<repo>.md`.

**ReleaseReady was validated against what is merged (f89faff).** PR #342 is still OPEN; "PR B" and the guardrails PR are not merged. No ReleaseReady row's claimed status depends on them, so none is marked pending, but ReleaseReady has **no guardrails yet** (see §4).

## 1. Counts per repo

| Repo                           | main sha | Rows    | Fixed   | Partly fixed | Open                 | Needs owner                      |
| ------------------------------ | -------- | ------- | ------- | ------------ | -------------------- | -------------------------------- |
| ReleaseReady                   | f89faff  | 21      | 9       | 2            | 8                    | 2                                |
| frontend-ui                    | e614122  | 20      | 9       | 5            | 2                    | 3 (+1 closed, no change: FUI-20) |
| observability                  | 5b933c9  | 17      | 13      | 0            | 2                    | 2                                |
| releaseready-product-tests     | 079634b  | 21      | 15      | 1            | 5 (4 are cross-repo) | 0                                |
| test-data-management           | c902b98  | 24      | 16      | 3            | 3 (2 cross-repo)     | 2                                |
| test-management                | 0545206  | 26      | 16      | 3            | 6 (3 cross-repo)     | 1                                |
| universal-api-framework        | 750058b  | 18      | 13      | 0            | 4 (1 cross-repo)     | 1                                |
| universal-appium2-framework    | 3cc1cbb  | 22      | 16      | 1            | 3 (1 cross-repo)     | 2                                |
| universal-playwright-framework | 4a19540  | 22      | 14      | 0            | 6 (1 cross-repo)     | 2                                |
| **Total**                      |          | **191** | **121** | **15**       | **39**               | **15** (+1 closed)               |

All PRs cited by Fixed rows are MERGED, and spot-checks of path/line evidence found the defects gone.

## 2. Rows whose status I changed

| Row    | Old                                            | New                     | Reason                                                                                                                                                                                                                                                                                       |
| ------ | ---------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FUI-07 | Fixed                                          | Partly fixed            | `renovate.json` exists, but no licence checker was added (the row's own text says so)                                                                                                                                                                                                        |
| TM-12  | Fixed for the schema version, plus Needs owner | Needs owner (not Fixed) | Schema fence is real, but live legacy code remains: v1 `compareCaseVersions` beside V2 (`src/version-comparison.ts:74`), optional provenance with unknown states, content-only data review (`dataRevision: null`), unattributed write path. The 63 legacy markers were reworded, not removed |
| RPT-19 | Open                                           | Fixed                   | PR #26 merged, `knip.jsonc` present, `npx knip` exits 0, `check:guardrails` runs in pr.yml                                                                                                                                                                                                   |
| RR-12  | Partly fixed                                   | Fixed                   | Lint gate (#336) merged with `no-explicit-any`; 0 explicit `any` outside the generated `central-api.d.ts`                                                                                                                                                                                    |

Notes appended (status unchanged) on UAF-14 and UAF-18. All other statuses held.

## 3. Remaining open items

### Needs owner decision

> **19 Nov 2026: decided.** See [OWNER-DECISIONS.md](OWNER-DECISIONS.md). Most rows are covered by standing decisions and are being implemented; the per-row Status in `findings/<repo>.md` is the live state. All four owner questions were answered yes. FUI-18 is done: auto-delete is on and 226 branches are deleted. The UA2-22 repo is renamed. UPF-13 and UPF-21 are in progress (od-upf). FUI-01 is decided: stay on GitHub Free, with `merge-guard.sh` as the gate. TDM-14 waits on RRDSCRUM-207. **20 Nov status:** fixed: FUI-11, FUI-12, FUI-18, FUI-19, RR-03, RR-06 (exact matches; unmatched colours with the owner), RR-16, TM-11, TDM-09, TDM-13, UPF-11, UPF-13, UPF-21, UAF-09, UAF-16, UA2-01, UA2-22, OBS-16, OBS-17. Also fixed: RR-04 (v1 evidence kept as current, #359; bare `synthetic-profile` removed, #360) and TM-12 (TM #110, TM 2.0.0 #112, TDM 0.4.0 #65, RR #362). RPT-01 closed: duplicates removed (RR #330); the remaining ~169 RR files are RR-owned in-process tests and stay by design, with the boundary documented (RR #364, product-tests #35). RR `checkedPublicDraft` copy removed (TM 2.1.0 #113, RR #363). All 22 decided findings are closed except TDM-14 (waits on RRDSCRUM-207). Also merged: oasdiff runner cache (TM #111), `.DS_Store` untracked (RR #361, OBS #24, config #13) and the `tracked-ds-store` guardrail (config #14, 2.2.3). Waiting: TDM-14 (RRDSCRUM-207). CI-only fixes found on the new macOS runner: RR #356 (RR207-ARTIFACT-012/013/014 deterministic), RR #358 (operator-pty ^D race).

- FUI-11 (tracked `public/v8.css` copies need a wrangler build step), FUI-12 (5 marketing pages inline one style block; approved page source and CSP), FUI-18 (60 remote branches, 28 merged; `delete_branch_on_merge` off), FUI-19 (React-only peers vs a headless a11y library)
- RR-04 (v1 adapter evidence, legacy owner/member roles, synthetic profile), RR-06 (14 hex colours left in `apps/**/*.css`; design approval), RR-16 (`source-selection.paths.json` 9,046 lines, 150 `$ref`; contract change)
- TM-11 (v1 recipe store beside v2; live RR-03 path), TM-12 (legacy provenance and data-review paths)
- TDM-09 (custom Postgres migration runner; awaits leasing ADR), TDM-13 (ProviderScope / RecipeLifecycleAuthority re-declared), TDM-14 (RR constants and recipe datasets)
- UPF-11 (`injectedFailure` and similar test hooks in the published result schema), UPF-21 (review digests hash package.json; no review-pin check). UPF-13 licence question (MIT) is still open for the owner
- UAF-09 (Dev profile pins RR 2d6b7f0: re-pin or delete), UAF-16 (which framework owns API testing)
- UA2-01 (preflight custom implementation; RRDMOBILE-9 call), UA2-22 (repo/package rename)
- OBS-16 (Prometheus 3.10→3.16 needs Linux re-verification), OBS-17 (rename Compose projects/volume off Jira keys)
- RPT-01 (~165 RR-only browser tests kept centrally)
- Also needs a decision: **FUI-01 branch protection.** The 8 free-plan private repos cannot enforce required checks (API 403), so pr.yml is advisory except in config and appium2; enforcement rests on the local `merge-guard.sh` hook.

### Large refactor, own PR

- RR-03 (v1 recipes stack), RR-07 (20 hand-written clients, no openapi-fetch), RR-18 (DevPortal.tsx 2,329 lines, web-job.service.ts 1,461; both grew)
- FUI-08 (picomatch, vitest 5, TS 7), FUI-13 (shared Playwright fixture, tdm-*.html stubs), FUI-15 (no `checkJs`, ~306 errors)
- TM-04 (890-line `openapi.mjs` and comparator), TM-10 (hand-written XML parser; use saxes), TM-23 (controller duplication; jscpd 6.24% vs 6.5% threshold), TM-24 (openapi-typescript, tied to TM-04)
- TDM-08 (hand-written validation, not Ajv from OpenAPI)
- RPT-12 (hand-rolled validation and Cucumber JSON parsing)
- UPF-12 (`execution/index.ts` now 1429 lines, grew), UPF-15 (own socket tracking), UPF-19 (Cucumber majors)
- UA2-21 (per-repo code-quality caller, rules, dotenv/Allure setup)

### Other

- RR-08 (custom zip parser; security-sensitive), RR-09 (custom GitHub client), RR-10 (72 `process.argv` uses), RR-17 (3 SQLite rehearsal stores), RR-19 (hard-coded componentTests set), RR-20 (pins; waits on upstream)
- FUI-03, FUI-07 (add a licence allow-list check), FUI-17 (no packageManager pin)
- TM-17, TM-19, TM-20, TM-21 (cross-repo); TDM-10, TDM-12, TDM-22, TDM-23 (cross-repo, Renovate not set up in TDM); RPT-13, RPT-14, RPT-18; UPF-16, UPF-18, UPF-22; UAF-13 (deliberate), UAF-14 (k6 installer; `performance.yml` still uses `perf:install-k6`), UAF-18 (3 moderate dev-only advisories); UA2-16, UA2-17, UA2-18
- OBS-13, OBS-14 (deliberate), RPT-16 (kept by design)

### Other findings that are not rows

- **TM-06 marked Fixed but** `src/creation-receipts.ts:63` still has a locale-default sort that feeds a sha256 receipt digest (same defect class).
- **Stale "waits for RR" text:** many TM rows (TM-13 to 16, 18) say they wait for RR #338/#336, both now merged. TM-22 keeps `./jira-forge-lifecycle/v1` for RR draft PR #316, still open.
- **RR eslint-disable count rose from 6 to 73.** All are `-next-line` with named rules, none blanket, but they are worth a sampling review, since they are what made the lint gate green.
- UPF nightly "Browser suites" on main is red: the known `install-policy` "prepare hook" test. UAF `test:performance` has 10 failures because k6 isn't installed.
- TDM-01's evidence lines are stale (chmod moved into TM `openFencedSqlite`); the fix is real.

## 4. Is `pr.yml` green on main?

`pr.yml` triggers on `pull_request` only, in every repo, so no run ever exists on `main` itself. The table gives the last PR run before merge, which is the head of main's squash commit.

| Repo                           | Verdict                                              | Latest run                                                                                                                                                                                                                |
| ------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| config                         | green                                                | PR #3 head cd2d2d4, https://github.com/releaseready/config/actions/runs/44452375579                                                                                                                                       |
| frontend-ui                    | green                                                | https://github.com/releaseready/frontend-ui/actions/runs/44448850199                                                                                                                                                      |
| observability                  | green                                                | https://github.com/releaseready/observability/actions/runs/44453085515                                                                                                                                                    |
| releaseready-product-tests     | green                                                | https://github.com/releaseready/releaseready-product-tests/actions/runs/44448210869                                                                                                                                       |
| test-data-management           | green                                                | https://github.com/releaseready/test-data-management/actions/runs/44452747741                                                                                                                                             |
| test-management                | green                                                | https://github.com/releaseready/test-management/actions/runs/44448902060                                                                                                                                                  |
| universal-api-framework        | green                                                | https://github.com/releaseready/universal-api-framework/actions/runs/44453125627                                                                                                                                          |
| universal-appium2-framework    | green                                                | https://github.com/releaseready/universal-appium2-framework/actions/runs/44453262742                                                                                                                                      |
| universal-playwright-framework | green (PR level); nightly Browser suites on main red | https://github.com/releaseready/universal-playwright-framework/actions/runs/44452280848                                                                                                                                   |
| **ReleaseReady**               | **light checks green, guardrails not adopted**       | https://github.com/releaseready/ReleaseReady/actions/runs/44450911473; uses `@releaseready/config` 1.0.0 for ESLint, prettier and tsconfig, but has no `releaseready-guardrails` step. Pending: #342, PR B, guardrails PR |

## 5. ReleaseReady "Quality" workflow (`.github/workflows/code-quality.yml`)

- It is `workflow_dispatch` only. It calls the shared `code-quality` scan, pinned to e0aa401, with `enforce: true`.
- All four runs (13–14 Nov) failed by design: "Would fail in enforce mode: failed or incomplete: gitleaks, trivy, jscpd". The engines were incomplete because inputs exceeded adapter limits. The scan also reported 731 non-null assertions, 2,482 markdownlint hits and 39 semgrep `hardcoded-secret` hits.
- **Obsolete? Only partly.** `pr.yml` plus `@releaseready/config` replaces its lint, format and type-check part. It does not replace gitleaks, trivy, semgrep, zizmor, hadolint, OSV or jscpd.
- It is referenced by `docs/operations/release-validation.md:37` and `docs/sonarqube.md:5`. No required check points at it (branch protection is unreadable, 403).
- **Recommendation: don't delete yet.** First either make its enforcement work (fix the incomplete engines, or set `enforce: false` with a baseline), or fold secret, container and workflow scanning into `pr.yml` through the guardrails adoption. Then delete it and update both docs in the same PR. frontend-ui's manual `quality.yml` is in the same state: last failed 14 Nov and is not a PR gate.

## 6. Jira RRDSCRUM-295 to 321

Checked on frontend-ui main e614122. `npm run check:guardrails`: 245 files checked, **0 errors**, 116 warnings (RRDSCRUM-297 narrow breakpoints, -305 error titles, -307 hex literals). One "Validated on main e614122" comment was added per ticket (27 in all). No transitions or field edits.

**Resolved (18):** 295, 296, 298, 299, 300, 301, 302, 306, 309, 310, 311, 313, 314, 315, 316, 318, 319, 320.

**Not resolved (9):**

| Ticket | What is missing                                                       |
| ------ | --------------------------------------------------------------------- |
| 297    | Breakpoints 480/520/620/24rem are still mixed                         |
| 303    | Per-ticket helper CSS remains in the design areas                     |
| 304    | DecisionsPanel is unused in the areas; there is no decisions register |
| 305    | No copy guide; terms are mixed (11 guardrail warnings)                |
| 307    | 21 literal px remain in `v8.css`; hex warnings                        |
| 308    | `qc-row-*` classes remain; no prefix map                              |
| 312    | The fix lives in the Design System artifact; no evidence on main      |
| 317    | `pr.yml` has no axe or visual checks on PRs                           |
| 321    | No approve action (the other parts are done)                          |

The 9 unresolved tickets still need the owner's decision on whether to reopen them or accept them as they are. Details: `side-session-notes/.../val-jira.md`.

## 7. Follow-ups after the validation (19 Nov 2026)

| Item                                            | Result                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TM-06 sort feeding a digest                     | Fixed: test-management [#98](https://github.com/releaseready/test-management/pull/98) (`creationDigest` uses shared `canonicalDigest`; test added; repo grepped). Also `packageManager` pin                                                                                                                                                                                                                                                         |
| TM-13 to TM-16, TM-18 stale "waits for RR" text | Removed (findings text)                                                                                                                                                                                                                                                                                                                                                                                                                             |
| TDM-01 evidence                                 | Corrected (chmod now in TM `openFencedSqlite`, `src/sqlite.ts:38-39`)                                                                                                                                                                                                                                                                                                                                                                               |
| UPF-23 nightly "Browser suites" red             | Fixed: universal-playwright-framework [#88](https://github.com/releaseready/universal-playwright-framework/pull/88). Next scheduled nightly still to be confirmed                                                                                                                                                                                                                                                                                   |
| UAF-14 k6                                       | Fixed: universal-api-framework [#23](https://github.com/releaseready/universal-api-framework/pull/23). Installed from the official Grafana apt repo, because the org allows only GitHub-owned actions (`grafana/setup-k6-action` fails at startup). Custom installer deleted; performance dispatch green                                                                                                                                            |
| FUI-07 licence check                            | Fixed: frontend-ui [#123](https://github.com/releaseready/frontend-ui/pull/123), `license-checker-rseidelsohn` in `pr.yml`. Permissive allow-list only; a few MPL-2.0 dev tools are excluded by name, so the owner may want to review that list                                                                                                                                                                                                     |
| FUI-17 `packageManager`                         | Fixed: pinned in frontend-ui #123, test-management #98, test-data-management [#56](https://github.com/releaseready/test-data-management/pull/56), universal-api-framework #23, config [#4](https://github.com/releaseready/config/pull/4), product-tests [#27](https://github.com/releaseready/releaseready-product-tests/pull/27), appium2 [#31](https://github.com/releaseready/universal-appium2-framework/pull/31). ReleaseReady still to check |
| TDM Renovate                                    | Already present (#48); no change needed. TDM-10/12/22/23 stay cross-repo                                                                                                                                                                                                                                                                                                                                                                            |
| Security scanners (item 7)                      | gitleaks, trivy, semgrep, zizmor are in the shared action `releaseready/config/.github/actions/security-scan` (config #5, #6). Rolled out through `pr.yml`: frontend-ui #127, observability #17, product-tests #28, TDM #57, TM #99, UAF #24, appium2 #32, UPF #89. No real secret or vulnerability found; baselines reviewed. frontend-ui `quality.yml` deleted                                                                                    |

**Left:** (a) tag `v2.1.0` on config `6248d46` is not pushed, because the auto-mode classifier denied it; it only publishes the npm package, and consumers pin by SHA. (b) ReleaseReady: add the `security` job, baseline, delete `code-quality.yml`, edit `docs/operations/release-validation.md` and `docs/sonarqube.md`, and add the `packageManager` pin. This waits for #342 and its follow-up PR. Steps are in `side-session-notes/.../scanners-handover.md`.
