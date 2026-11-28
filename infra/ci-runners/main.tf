# Ephemeral AWS spot runners for the shared CI (RRDPLAT-114). Scales to zero: a queued job starts one instance, which
# takes that one job and is terminated. Cost controls, all enforced here:
#   - at most var.max_runners instances at once (2): AWS budget alerts do not stop spending
#   - spot only, ephemeral (one job per instance), no idle runners
#   - the default VPC's public subnets with no inbound rules: no NAT gateway, which is the usual hidden monthly cost
#   - 7-day log retention
# Private org repos only: the shared CI never routes fork PRs or public repos here (see reusable-ci.yml).

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

module "lambdas" {
  source = "github.com/github-aws-runners/terraform-aws-github-runner//modules/download-lambda?ref=v7.9.0"
  lambdas = [
    { name = "webhook", tag = var.module_version },
    { name = "runners", tag = var.module_version },
    { name = "runner-binaries-syncer", tag = var.module_version },
  ]
}

module "runners" {
  source = "github.com/github-aws-runners/terraform-aws-github-runner?ref=v7.9.0"

  aws_region = var.aws_region
  vpc_id     = data.aws_vpc.default.id
  subnet_ids = data.aws_subnets.default.ids
  prefix     = var.prefix

  github_app = var.github_app

  webhook_lambda_zip                = module.lambdas.files[0]
  runners_lambda_zip                = module.lambdas.files[1]
  runner_binaries_syncer_lambda_zip = module.lambdas.files[2]

  enable_organization_runners   = true
  enable_ephemeral_runners      = true
  enable_job_queued_check       = true
  runner_disable_default_labels = true
  runner_extra_labels           = [var.runner_label]

  instance_target_capacity_type = "spot"
  instance_allocation_strategy  = "price-capacity-optimized"
  instance_types                = var.instance_types
  runners_maximum_count         = var.max_runners

  associate_public_ipv4_address   = true
  create_service_linked_role_spot = true
  enable_ssm_on_runners           = false
  logging_retention_in_days       = 7

  tags = {
    Project = "buildproveship-ci"
  }
}
