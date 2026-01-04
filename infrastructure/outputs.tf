output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.main.id
}

output "public_ip" {
  description = "Elastic IP address"
  value       = aws_eip.main.public_ip
}

output "app_url" {
  description = "Application URL"
  value       = "https://${aws_route53_record.app.fqdn}"
}

output "websocket_url" {
  description = "WebSocket URL"
  value       = "wss://${aws_route53_record.app.fqdn}/ws"
}

output "ecr_repository_url" {
  description = "ECR repository URL"
  value       = aws_ecr_repository.main.repository_url
}

output "ssh_command" {
  description = "SSH command to connect"
  value       = "ssh -i ~/.ssh/${var.ssh_key_name}.pem ec2-user@${aws_eip.main.public_ip}"
}

output "ecr_login_command" {
  description = "Command to login to ECR"
  value       = "aws ecr get-login-password --region ${var.aws_region} | docker login --username AWS --password-stdin ${aws_ecr_repository.main.repository_url}"
}

# SES outputs
output "ses_domain_identity_arn" {
  description = "ARN of the SES domain identity"
  value       = aws_ses_domain_identity.main.arn
}

output "ses_sender_email" {
  description = "Email address configured for sending"
  value       = var.ses_sender_email
}

output "ses_smtp_endpoint" {
  description = "SES SMTP endpoint for the region"
  value       = "email-smtp.${var.aws_region}.amazonaws.com"
}

output "ses_verification_status" {
  description = "SES domain verification status (run terraform refresh to update)"
  value       = "Check AWS Console: https://console.aws.amazon.com/ses/home?region=${var.aws_region}#/verified-identities"
}
