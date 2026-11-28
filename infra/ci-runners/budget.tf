# Hard monthly ceiling (owner decision, 28 Nov 2026: US$20 at most). AWS budget alerts alone do not stop spending, so at
# the ceiling an AWS Budgets action attaches a deny-launch policy to the scale-up lambda's role: no new runner instance can
# start until the policy is detached (or the month rolls over and it is removed by hand). Running jobs finish; CI then
# routes to the next runner in the shared workflow (hosted). Budget data refreshes a few times a day, so the real
# overshoot is bounded by about half a day of the two capped instances.

variable "monthly_ceiling_usd" {
  description = "Hard monthly spend ceiling in USD; at 100% the scale-up role is denied ec2:RunInstances and ec2:CreateFleet."
  type        = number
  default     = 20

  validation {
    condition     = var.monthly_ceiling_usd > 0 && var.monthly_ceiling_usd <= 20
    error_message = "monthly_ceiling_usd must stay at or below 20; raise it only with the owner's approval."
  }
}

variable "alert_emails" {
  description = "Where budget alerts go (US$5, 10 and 15 of actual spend, and the ceiling), one or more addresses. Pass as JSON through TF_VAR_alert_emails, never commit."
  type        = list(string)
  validation {
    condition     = length(var.alert_emails) >= 1 && length(var.alert_emails) <= 10
    error_message = "Give between 1 and 10 alert addresses."
  }
}

variable "budget_tag_active" {
  description = "false: the budget covers the whole account (strictest). true: only resources tagged Project=buildproveship-ci; set it after that cost allocation tag is active in Billing (takes about a day after the first apply)."
  type        = bool
  default     = false
}

resource "aws_iam_policy" "stop_launches" {
  name = "${var.prefix}-budget-stop-launches"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Deny"
      Action   = ["ec2:RunInstances", "ec2:CreateFleet"]
      Resource = "*"
    }]
  })
}

resource "aws_iam_role" "budget_action" {
  name = "${var.prefix}-budget-action"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "budgets.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "budget_action" {
  name = "attach-stop-launches"
  role = aws_iam_role.budget_action.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      # nosemgrep: terraform.lang.security.iam.no-iam-priv-esc-funcs.no-iam-priv-esc-funcs, terraform.lang.security.iam.no-iam-resource-exposure.no-iam-resource-exposure -- the budget action must attach one deny-launch policy to the scale-up role; it is limited to that role and that policy ARN
      Action   = ["iam:AttachRolePolicy", "iam:DetachRolePolicy"]
      Resource = module.runners.runners.role_scale_up.arn
      Condition = {
        ArnEquals = { "iam:PolicyARN" = aws_iam_policy.stop_launches.arn }
      }
    }]
  })
}

resource "aws_budgets_budget" "ci_spot" {
  name         = "${var.prefix}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_ceiling_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  dynamic "cost_filter" {
    for_each = var.budget_tag_active ? [1] : []
    content {
      name   = "TagKeyValue"
      values = ["user:Project$buildproveship-ci"]
    }
  }

  dynamic "notification" {
    for_each = [5, 10, 15]
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "ABSOLUTE_VALUE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = var.alert_emails
    }
  }
}

resource "aws_budgets_budget_action" "stop_launches" {
  budget_name        = aws_budgets_budget.ci_spot.name
  action_type        = "APPLY_IAM_POLICY"
  approval_model     = "AUTOMATIC"
  notification_type  = "ACTUAL"
  execution_role_arn = aws_iam_role.budget_action.arn

  action_threshold {
    action_threshold_type  = "PERCENTAGE"
    action_threshold_value = 100
  }

  definition {
    iam_action_definition {
      policy_arn = aws_iam_policy.stop_launches.arn
      roles      = [module.runners.runners.role_scale_up.name]
    }
  }

  dynamic "subscriber" {
    for_each = var.alert_emails
    content {
      subscription_type = "EMAIL"
      address           = subscriber.value
    }
  }
}

# Monthly reset: the budget restarts on the 1st (UTC), so the deny-launch policy is detached then. If it is not attached,
# the call fails harmlessly (no retries); the schedule costs nothing.
resource "aws_iam_role" "budget_reset" {
  name = "${var.prefix}-budget-reset"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "budget_reset" {
  name = "detach-stop-launches"
  role = aws_iam_role.budget_reset.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      # nosemgrep: terraform.lang.security.iam.no-iam-resource-exposure.no-iam-resource-exposure -- the monthly reset only detaches the deny-launch policy; it is limited to the scale-up role and that policy ARN
      Action   = "iam:DetachRolePolicy"
      Resource = module.runners.runners.role_scale_up.arn
      Condition = {
        ArnEquals = { "iam:PolicyARN" = aws_iam_policy.stop_launches.arn }
      }
    }]
  })
}

resource "aws_scheduler_schedule" "budget_reset" {
  name                         = "${var.prefix}-budget-reset"
  schedule_expression          = "cron(5 0 1 * ? *)"
  schedule_expression_timezone = "UTC"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:iam:detachRolePolicy"
    role_arn = aws_iam_role.budget_reset.arn
    input = jsonencode({
      RoleName  = module.runners.runners.role_scale_up.name
      PolicyArn = aws_iam_policy.stop_launches.arn
    })
    retry_policy {
      maximum_retry_attempts = 0
    }
  }
}
