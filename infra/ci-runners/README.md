# CI spot runners

Ephemeral AWS spot runners that the shared CI uses when the Mac runner is offline or busy and the caller sets
`spot-runner: ci-spot`. Built on [github-aws-runners/terraform-aws-github-runner](https://github.com/github-aws-runners/terraform-aws-github-runner)
(Apache-2.0, pinned to a release); this folder only configures it. Nothing here is applied automatically.

Cost controls, tightest first:

- **Hard ceiling: US$20 a month** (`budget.tf`). At 100% of the budget an AWS Budgets action attaches a deny-launch policy to the
  scale-up role, so no new instance starts; alerts go to `alert_emails` at US$5, 10 and 15. Budget data refreshes a few times
  a day, so the worst case is about US$22 (the ceiling plus under half a day of two capped instances), plus roughly US$0.25 of
  fixed cost. The policy is detached automatically at 00:05 UTC on the 1st of each month (a free EventBridge schedule); to resume sooner, detach the `*-budget-stop-launches` policy from the scale-up role.
- At most 2 instances at once (`max_runners`, validated), a spot price cap of US$0.05 an hour each, cheapest 2 vCPU types
  first, one job per instance, no idle runners, 20-minute job timeout in the shared CI.
- No NAT gateway (public subnets of the default VPC, no inbound rules), 7-day logs.

Expected: about US$1-2 a month for 100 CI runs, about US$0.10-0.25 idle.

## Apply (once, by the account owner, with the `bps-admin` profile)

1. Create a GitHub App for runner registration (separate from the read-only router App): organisation permission
   "Self-hosted runners: read and write", repository permissions "Actions: read", "Metadata: read" and "Checks: read" as
   listed in the module's setup docs; subscribe to the "Workflow job" event; generate a webhook secret and a private key.
2. `export TF_VAR_alert_emails='["<email 1>","<email 2>"]'` and `export TF_VAR_github_app='{"id":"<app id>","key_base64":"<base64 of the .pem>","webhook_secret":"<secret>"}'`
3. `terraform init`, then `terraform apply -target=module.lambdas` (downloads the three lambda zips from the module's release; a plan needs them to exist), then `terraform plan`, read the plan, then `terraform apply`. A fresh-checkout plan reports about 99 resources, none of them a NAT gateway, load balancer or KMS key.
4. Put the `webhook_endpoint` output into the App's webhook URL, install the App on the org's private repos.
5. Callers set `spot-runner: ci-spot` in their `pr.yml` (or the org does it once in the template).

The budget covers the whole account until `budget_tag_active` is set to true, which you do about a day after the first apply once the `Project` cost allocation tag is active in Billing. State is local by default; keep it outside the repo (it holds the webhook secret). Never commit `*.tfvars` or state.
