output "webhook_endpoint" {
  description = "Set as the webhook URL of the runner-registration GitHub App."
  value       = module.runners.webhook.endpoint
}
