# S3 bucket for deploy config files
# These files are synced by CI and downloaded by EC2 on boot

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "config" {
  bucket = "drawing-agent-config-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name = "Deploy Config Files"
  }
}

resource "aws_s3_bucket_versioning" "config" {
  bucket = aws_s3_bucket.config.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "config" {
  bucket = aws_s3_bucket.config.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# IAM policy for EC2 to read config from S3
resource "aws_iam_role_policy" "ec2_config_read" {
  name = "config-s3-read"
  role = aws_iam_role.ec2_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.config.arn,
          "${aws_s3_bucket.config.arn}/*"
        ]
      }
    ]
  })
}

output "config_bucket_name" {
  description = "S3 bucket name for deploy configs"
  value       = aws_s3_bucket.config.id
}
