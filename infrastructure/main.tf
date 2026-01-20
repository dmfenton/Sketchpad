terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "drawing-agent-terraform-state-573988763875"
    key            = "drawing-agent/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "drawing-agent-terraform-locks"
    encrypt        = true
  }
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
