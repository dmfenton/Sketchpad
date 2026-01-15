#!/bin/bash
# Start all services with secrets from SSM Parameter Store
# This script is synced from S3 and can be re-run to restart services with fresh secrets
set -e

REGION="${AWS_REGION:-us-east-1}"

echo "Fetching secrets from SSM Parameter Store..."

# Fetch Umami secrets
export UMAMI_DB_PASSWORD=$(aws ssm get-parameter \
  --name "/drawing-agent/umami-db-password" \
  --with-decryption \
  --query "Parameter.Value" \
  --output text \
  --region "$REGION")

export UMAMI_APP_SECRET=$(aws ssm get-parameter \
  --name "/drawing-agent/umami-app-secret" \
  --with-decryption \
  --query "Parameter.Value" \
  --output text \
  --region "$REGION")

# Get ECR registry URL
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --region "$REGION")
export ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/drawing-agent"

echo "ECR_REGISTRY: $ECR_REGISTRY"
echo "Starting services..."

cd /home/ec2-user

# Pull latest images and start services
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d

echo "Services started. Checking status..."
docker-compose -f docker-compose.prod.yml ps
