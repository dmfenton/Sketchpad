terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Optional: Use S3 backend for state (uncomment and configure)
  # backend "s3" {
  #   bucket = "your-terraform-state-bucket"
  #   key    = "drawing-agent/terraform.tfstate"
  #   region = "us-east-1"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "drawing-agent"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
