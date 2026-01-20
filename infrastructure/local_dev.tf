# IAM user for local development - SES send only
resource "aws_iam_user" "local_dev" {
  name = "drawing-agent-local-dev"
  path = "/dev/"

  tags = {
    Name    = "Local Development SES"
    Purpose = "Local development email sending via SES"
  }
}

# Policy for SES send access only
resource "aws_iam_user_policy" "local_dev_ses" {
  name = "ses-send-only"
  user = aws_iam_user.local_dev.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowSESSend"
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "ses:FromAddress" = var.ses_sender_email
          }
        }
      }
    ]
  })
}

# Policy for SSM Parameter Store access (dev environment only)
resource "aws_iam_user_policy" "local_dev_ssm" {
  name = "ssm-read-dev"
  user = aws_iam_user.local_dev.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadDevParameters"
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath"
        ]
        Resource = "arn:aws:ssm:${var.aws_region}:*:parameter${local.ssm_prefix}/dev/*"
      },
      {
        Sid      = "DecryptDevSecrets"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = "*"
        Condition = {
          StringEquals = {
            "kms:ViaService" = "ssm.${var.aws_region}.amazonaws.com"
          }
        }
      }
    ]
  })
}

# Access key for local development
resource "aws_iam_access_key" "local_dev" {
  user = aws_iam_user.local_dev.name
}

# Outputs for local .env
output "local_dev_access_key_id" {
  description = "Access key ID for local development SES"
  value       = aws_iam_access_key.local_dev.id
}

output "local_dev_secret_access_key" {
  description = "Secret access key for local development SES (sensitive)"
  value       = aws_iam_access_key.local_dev.secret
  sensitive   = true
}

output "local_dev_env_snippet" {
  description = "Copy this to your .env file"
  value       = <<-EOT
    # AWS credentials for local dev (SES only)
    AWS_ACCESS_KEY_ID=${aws_iam_access_key.local_dev.id}
    AWS_SECRET_ACCESS_KEY=<run: terraform output -raw local_dev_secret_access_key>
    AWS_REGION=${var.aws_region}
  EOT
}
