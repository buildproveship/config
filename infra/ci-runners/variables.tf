variable "aws_region" {
  description = "Region for the runners. ap-south-1 is the owner's region for every BuildProveShip resource."
  type        = string
  default     = "ap-south-1"
}

variable "prefix" {
  description = "Name prefix for every resource the module creates."
  type        = string
  default     = "ci-spot"
}

variable "module_version" {
  description = "Release of github-aws-runners/terraform-aws-github-runner; also selects the lambda zips it downloads."
  type        = string
  default     = "v7.9.0"
}

variable "runner_label" {
  description = "The single label jobs use to reach these runners (the `spot-runner` input of the shared CI)."
  type        = string
  default     = "ci-spot"
}

variable "max_runners" {
  description = "Hard ceiling on concurrent runner instances. AWS budget alerts do not stop spending, so this is the real cost cap (owner decision, 28 Nov 2026: 2)."
  type        = number
  default     = 2

  validation {
    condition     = var.max_runners >= 1 && var.max_runners <= 2
    error_message = "max_runners must stay between 1 and 2; raise the cap only with the owner's approval."
  }
}

variable "instance_types" {
  description = "Spot instance types, tried in price-capacity-optimized order."
  type        = list(string)
  default     = ["m7a.large", "m7i.large", "m6a.large", "m6i.large"]
}

variable "github_app" {
  description = "The runner-registration GitHub App (not the read-only router App): its numeric id, base64 private key and webhook secret. Pass through TF_VAR_github_app, never commit."
  type = object({
    id             = string
    key_base64     = string
    webhook_secret = string
  })
  sensitive = true
}
