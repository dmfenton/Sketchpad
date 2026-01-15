# SSM Parameter Store for application configuration
# Parameters follow hierarchy: /drawing-agent/{env}/{param-name}

locals {
  ssm_prefix = "/drawing-agent"

  # Secrets (SecureString) - placeholder values, update via CLI/Console
  secrets = {
    "anthropic-api-key" = "CHANGE_ME_IN_CONSOLE"
    "jwt-secret"        = "CHANGE_ME_IN_CONSOLE_MIN_32_CHARS"
  }

  # Config (String) - can have real defaults
  config = {
    "apple-team-id" = "PG5D259899"
    "database-url"  = "sqlite+aiosqlite:///data/drawing_agent.db"
  }

  # Dev config overrides
  dev_config = {
    "apple-team-id" = "NONE"  # SSM doesn't allow empty strings
    "database-url"  = "sqlite+aiosqlite:///./data/drawing_agent.db"
  }
}

# =============================================================================
# Production Parameters
# =============================================================================

resource "aws_ssm_parameter" "prod_secrets" {
  for_each = local.secrets

  name        = "${local.ssm_prefix}/prod/${each.key}"
  description = "Production ${each.key}"
  type        = "SecureString"
  value       = each.value

  lifecycle {
    ignore_changes = [value]
  }

  tags = {
    Environment = "prod"
    Type        = "secret"
  }
}

resource "aws_ssm_parameter" "prod_config" {
  for_each = local.config

  name        = "${local.ssm_prefix}/prod/${each.key}"
  description = "Production ${each.key}"
  type        = "String"
  value       = each.value

  tags = {
    Environment = "prod"
    Type        = "config"
  }
}

# =============================================================================
# Development Parameters
# =============================================================================

resource "aws_ssm_parameter" "dev_secrets" {
  for_each = local.secrets

  name        = "${local.ssm_prefix}/dev/${each.key}"
  description = "Development ${each.key}"
  type        = "SecureString"
  value       = each.value

  lifecycle {
    ignore_changes = [value]
  }

  tags = {
    Environment = "dev"
    Type        = "secret"
  }
}

resource "aws_ssm_parameter" "dev_config" {
  for_each = local.dev_config

  name        = "${local.ssm_prefix}/dev/${each.key}"
  description = "Development ${each.key}"
  type        = "String"
  value       = each.value

  tags = {
    Environment = "dev"
    Type        = "config"
  }
}

# =============================================================================
# IAM Policy for EC2 to read prod parameters
# =============================================================================

resource "aws_iam_role_policy" "ec2_ssm_parameters" {
  name = "ssm-parameters-read"
  role = aws_iam_role.ec2_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadProdParameters"
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath"
        ]
        Resource = "arn:aws:ssm:${var.aws_region}:*:parameter${local.ssm_prefix}/prod/*"
      },
      {
        Sid    = "DecryptSecrets"
        Effect = "Allow"
        Action = ["kms:Decrypt"]
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

# =============================================================================
# Outputs
# =============================================================================

output "ssm_parameter_prefix" {
  description = "SSM parameter prefix"
  value       = local.ssm_prefix
}

output "ssm_setup_instructions" {
  description = "Instructions for setting up SSM parameters"
  value       = <<-EOT
    SSM parameters created with placeholder values.

    UPDATE SECRETS via CLI:
      aws ssm put-parameter --name "${local.ssm_prefix}/prod/anthropic-api-key" \
        --value "sk-ant-..." --type SecureString --overwrite --region ${var.aws_region}

      aws ssm put-parameter --name "${local.ssm_prefix}/prod/jwt-secret" \
        --value "$(python -c 'import secrets; print(secrets.token_hex(32))')" \
        --type SecureString --overwrite --region ${var.aws_region}

      # For local dev:
      aws ssm put-parameter --name "${local.ssm_prefix}/dev/anthropic-api-key" \
        --value "sk-ant-..." --type SecureString --overwrite --region ${var.aws_region}
  EOT
}
