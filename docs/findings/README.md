# Findings record

The 191 defects found in the 18 Nov 2026 cross-repo review, with their status, the PR that fixed each and the guard that stops it coming back. Read the file for the repo you are about to change before you write code there, so a past defect is not made again. The classes are summarised in [defects-we-dont-create](../defects-we-dont-create.md) and the rules are in the `buildproveship-code-quality` skill.

| File                                | Repo                                      |
| ----------------------------------- | ----------------------------------------- |
| `ReleaseReady.md`                   | ReleaseReady                              |
| `frontend-ui.md`                    | frontend-ui                               |
| `observability.md`                  | observability                             |
| `releaseready-product-tests.md`     | releaseready-product-tests                |
| `test-data-management.md`           | test-data-management                      |
| `test-management.md`                | test-management                           |
| `universal-api-framework.md`        | universal-api-framework                   |
| `universal-appium2-framework.md`    | universal-appium2-framework               |
| `universal-playwright-framework.md` | universal-playwright-framework            |
| `VALIDATION.md`                     | Final check of every status (19 Nov 2026) |

Each repo file has one row per finding: ID, standard, severity, the finding, evidence, fix, whether it crosses repos, whether it needs an owner decision, and **Status** (Fixed with the PR link, Partly fixed, Open, Needs owner).

## Keeping it current

Every fix PR in a covered repo updates its finding's Status with the PR link and names its guard, in the same PR (skill rule 9). A new defect class adds a row and a smell → fix lesson in the skill. This folder is a copy of the company's review notes; the content is not changed here except for Status updates. It holds no client data or secrets.
