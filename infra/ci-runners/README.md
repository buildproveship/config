# CI spot runners (RRDPLAT-114)

Ephemeral AWS spot runners that the shared CI uses when the Mac runner is offline or busy and the caller sets
`spot-runner: ci-spot`. Built on [github-aws-runners/terraform-aws-github-runner](https://github.com/github-aws-runners/terraform-aws-github-runner)
(Apache-2.0, pinned to a release); this folder only configures it. Nothing here is applied automatically.

Cost controls (the budget alerts at US$10/25/50 do not stop spending, so these are the real cap): at most 2 instances at
once (`max_runners`, validated), spot only, one job per instance, no idle runners, public subnets of the default VPC with no
inbound rules (no NAT gateway), 7-day logs. Estimated US$1-3 a month for light use; the worst case with 2 instances running
all month is a few tens of dollars.

## Apply (once, by the account owner, with the `bps-admin` profile)

1. Create a GitHub App for runner registration (separate from the read-only router App): organisation permission
   "Self-hosted runners: read and write", repository permissions "Actions: read", "Metadata: read" and "Checks: read" as
   listed in the module's setup docs; subscribe to the "Workflow job" event; generate a webhook secret and a private key.
2. `export TF_VAR_github_app='{"id":"<app id>","key_base64":"<base64 of the .pem>","webhook_secret":"<secret>"}'`
3. `terraform init`, then `terraform apply -target=module.lambdas` (downloads the three lambda zips from the module's release; a plan needs them to exist), then `terraform plan`, read the plan, then `terraform apply`. A fresh-checkout plan reports about 99 resources, none of them a NAT gateway, load balancer or KMS key.
4. Put the `webhook_endpoint` output into the App's webhook URL, install the App on the org's private repos.
5. Callers set `spot-runner: ci-spot` in their `pr.yml` (or the org does it once in the template).

State is local by default; keep it outside the repo (it holds the webhook secret). Never commit `*.tfvars` or state.
