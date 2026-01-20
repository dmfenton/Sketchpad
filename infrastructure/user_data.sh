#!/bin/bash
set -e

# Update system
yum update -y

# Install Docker
yum install -y docker
systemctl start docker
systemctl enable docker
usermod -aG docker ec2-user

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Install ECR credential helper (uses IAM role for automatic ECR auth)
yum install -y amazon-ecr-credential-helper

# Configure Docker to use ECR credential helper for all registries
# Using credsStore (not credHelpers) so Watchtower can pull from ECR via IAM role
mkdir -p /home/ec2-user/.docker
cat > /home/ec2-user/.docker/config.json << 'EOF'
{
  "credsStore": "ecr-login"
}
EOF
chown -R ec2-user:ec2-user /home/ec2-user/.docker

# Install CloudWatch agent
yum install -y amazon-cloudwatch-agent

# Configure CloudWatch agent (metrics + logs)
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << 'EOF'
{
  "metrics": {
    "namespace": "CWAgent",
    "metrics_collected": {
      "disk": {
        "measurement": ["used_percent"],
        "resources": ["/"],
        "metrics_collection_interval": 300
      },
      "mem": {
        "measurement": ["mem_used_percent"],
        "metrics_collection_interval": 300
      }
    },
    "append_dimensions": {
      "InstanceId": "$${aws:InstanceId}"
    }
  },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/home/ec2-user/data/logs/app.log",
            "log_group_name": "/drawing-agent/app",
            "log_stream_name": "{instance_id}",
            "timezone": "UTC",
            "multi_line_start_pattern": "^\\{",
            "retention_in_days": 30
          },
          {
            "file_path": "/home/ec2-user/data/logs/error.log",
            "log_group_name": "/drawing-agent/errors",
            "log_stream_name": "{instance_id}",
            "timezone": "UTC",
            "multi_line_start_pattern": "^\\{",
            "retention_in_days": 90
          }
        ]
      }
    },
    "log_stream_name": "default"
  }
}
EOF

# Configure logrotate for application logs
cat > /etc/logrotate.d/drawing-agent << 'LOGROTATE'
/home/ec2-user/data/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
    maxsize 100M
}
LOGROTATE

# Wait for EBS data volume to be attached
DATA_DEVICE="/dev/xvdf"
echo "Waiting for data volume to be attached..."
while [ ! -e "$DATA_DEVICE" ]; do
  sleep 5
done
echo "Data volume attached"

# Format the volume if it's new (no filesystem)
if ! blkid "$DATA_DEVICE" > /dev/null 2>&1; then
  echo "Formatting new data volume..."
  mkfs.xfs "$DATA_DEVICE"
fi

# Create mount point and mount
mkdir -p /home/ec2-user/data
mount "$DATA_DEVICE" /home/ec2-user/data

# Add to fstab for persistence across reboots
if ! grep -q "$DATA_DEVICE" /etc/fstab; then
  echo "$DATA_DEVICE /home/ec2-user/data xfs defaults,nofail 0 2" >> /etc/fstab
fi

# Install sqlite3 for DB management
yum install -y sqlite

# Create app directories with secure permissions
mkdir -p /home/ec2-user/data/db
mkdir -p /home/ec2-user/data/gallery
mkdir -p /home/ec2-user/data/logs
mkdir -p /home/ec2-user/certbot/conf/live/${domain}
mkdir -p /home/ec2-user/certbot/conf/archive/${domain}
mkdir -p /home/ec2-user/certbot/www

# Set ownership
chown -R ec2-user:ec2-user /home/ec2-user/data
chown -R ec2-user:ec2-user /home/ec2-user/certbot

# Secure data directory (owner only)
chmod 700 /home/ec2-user/data

# If DB exists, secure it
if [ -f /home/ec2-user/data/drawing_agent.db ]; then
  chmod 600 /home/ec2-user/data/drawing_agent.db
fi

# Download deploy config files from S3
# Get account ID from instance metadata
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
ACCOUNT_ID=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/dynamic/instance-identity/document | grep accountId | cut -d'"' -f4)
CONFIG_BUCKET="drawing-agent-config-$${ACCOUNT_ID}"

echo "Downloading config files from s3://$${CONFIG_BUCKET}/deploy/..."
aws s3 sync "s3://$${CONFIG_BUCKET}/deploy/" /home/ec2-user/ --region us-east-1
chown -R ec2-user:ec2-user /home/ec2-user/*.yml /home/ec2-user/*.yaml /home/ec2-user/*.conf 2>/dev/null || true
chown -R ec2-user:ec2-user /home/ec2-user/web 2>/dev/null || true

# Create a script to sync web files from S3
cat > /home/ec2-user/sync-web.sh << 'SCRIPT'
#!/bin/bash
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
ACCOUNT_ID=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/dynamic/instance-identity/document | grep accountId | cut -d'"' -f4)
CONFIG_BUCKET="drawing-agent-config-$${ACCOUNT_ID}"
aws s3 sync "s3://$${CONFIG_BUCKET}/deploy/web/" /home/ec2-user/web/ --region us-east-1 --delete --exact-timestamps
SCRIPT
chmod +x /home/ec2-user/sync-web.sh
chown ec2-user:ec2-user /home/ec2-user/sync-web.sh

# Create systemd service to sync web files
cat > /etc/systemd/system/sync-web.service << 'EOF'
[Unit]
Description=Sync web files from S3
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/home/ec2-user/sync-web.sh
User=ec2-user
EOF

# Create systemd timer to run every minute
cat > /etc/systemd/system/sync-web.timer << 'EOF'
[Unit]
Description=Sync web files from S3 every minute

[Timer]
OnBootSec=30
OnUnitActiveSec=60

[Install]
WantedBy=timers.target
EOF

# Enable and start the timer
systemctl daemon-reload
systemctl enable sync-web.timer
systemctl start sync-web.timer

# Docker cleanup script (prevents disk filling with old images)
cat > /usr/local/bin/docker-cleanup.sh << 'CLEANUP'
#!/bin/bash
set -e
echo "[$(date)] Starting Docker cleanup..."

# Remove dangling images, stopped containers, unused networks
docker system prune -af --filter "until=24h"

# Log disk usage after cleanup
df -h / | tail -1

echo "[$(date)] Docker cleanup complete"
CLEANUP
chmod +x /usr/local/bin/docker-cleanup.sh

# Systemd service for docker cleanup
cat > /etc/systemd/system/docker-cleanup.service << 'SERVICE'
[Unit]
Description=Docker cleanup service
After=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/docker-cleanup.sh
SERVICE

# Systemd timer (runs daily at 3am UTC)
cat > /etc/systemd/system/docker-cleanup.timer << 'TIMER'
[Unit]
Description=Daily Docker cleanup

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
TIMER

systemctl daemon-reload
systemctl enable docker-cleanup.timer
systemctl start docker-cleanup.timer

# Start CloudWatch agent (after EBS mount and directories exist)
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -s

# Fetch secrets from SSM and create .env file
echo "Fetching secrets from SSM..."
UMAMI_DB_PASSWORD=$(aws ssm get-parameter --name "/code-monet/umami-db-password" --with-decryption --query 'Parameter.Value' --output text --region us-east-1)
UMAMI_APP_SECRET=$(aws ssm get-parameter --name "/code-monet/umami-app-secret" --with-decryption --query 'Parameter.Value' --output text --region us-east-1)

# Get latest image tag from ECR (or default to latest)
ECR_REGISTRY="$${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com"
IMAGE_TAG=$(aws ecr describe-images --repository-name drawing-agent --query 'sort_by(imageDetails,&imagePushedAt)[-1].imageTags[0]' --output text --region us-east-1 2>/dev/null || echo "latest")

cat > /home/ec2-user/.env << ENVEOF
IMAGE_TAG=$${IMAGE_TAG}
ECR_REGISTRY=$${ECR_REGISTRY}
UMAMI_DB_PASSWORD=$${UMAMI_DB_PASSWORD}
UMAMI_APP_SECRET=$${UMAMI_APP_SECRET}
AWS_REGION=us-east-1
ENVEOF
chown ec2-user:ec2-user /home/ec2-user/.env
chmod 600 /home/ec2-user/.env

# Pull images (but don't start yet - need SSL first)
echo "Pulling container images..."
cd /home/ec2-user
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $${ECR_REGISTRY}
docker-compose -f docker-compose.prod.yml pull

# =============================================================================
# SSL Certificate Bootstrap
# =============================================================================
echo "Setting up SSL certificates..."

# Try to restore certs from SSM first
FULLCHAIN=$(aws ssm get-parameter --name "/code-monet/ssl/fullchain" --with-decryption --query 'Parameter.Value' --output text --region us-east-1 2>/dev/null || echo "")
PRIVKEY=$(aws ssm get-parameter --name "/code-monet/ssl/privkey" --with-decryption --query 'Parameter.Value' --output text --region us-east-1 2>/dev/null || echo "")

if [ -n "$FULLCHAIN" ] && [ "$FULLCHAIN" != "PLACEHOLDER" ] && [ -n "$PRIVKEY" ] && [ "$PRIVKEY" != "PLACEHOLDER" ]; then
  echo "Restoring SSL certs from SSM..."

  # Write to archive directory (certbot's canonical location)
  echo "$FULLCHAIN" > /home/ec2-user/certbot/conf/archive/${domain}/fullchain1.pem
  echo "$PRIVKEY" > /home/ec2-user/certbot/conf/archive/${domain}/privkey1.pem

  # Extract cert and chain from fullchain (cert is first, chain is the rest)
  # For simplicity, we copy fullchain to both (works for most configs)
  cp /home/ec2-user/certbot/conf/archive/${domain}/fullchain1.pem \
     /home/ec2-user/certbot/conf/archive/${domain}/cert1.pem
  cp /home/ec2-user/certbot/conf/archive/${domain}/fullchain1.pem \
     /home/ec2-user/certbot/conf/archive/${domain}/chain1.pem

  # Create symlinks (certbot's live directory structure)
  ln -sf ../../archive/${domain}/fullchain1.pem \
     /home/ec2-user/certbot/conf/live/${domain}/fullchain.pem
  ln -sf ../../archive/${domain}/privkey1.pem \
     /home/ec2-user/certbot/conf/live/${domain}/privkey.pem
  ln -sf ../../archive/${domain}/cert1.pem \
     /home/ec2-user/certbot/conf/live/${domain}/cert.pem
  ln -sf ../../archive/${domain}/chain1.pem \
     /home/ec2-user/certbot/conf/live/${domain}/chain.pem

  # Secure permissions
  chmod 600 /home/ec2-user/certbot/conf/archive/${domain}/*.pem
  chown -R ec2-user:ec2-user /home/ec2-user/certbot/

  echo "SSL certs restored from SSM"
else
  echo "No valid certs in SSM, requesting new ones from Let's Encrypt..."

  # Start services WITHOUT nginx first (to free port 80 for certbot)
  echo "Starting services without nginx..."
  docker-compose -f docker-compose.prod.yml up -d --scale nginx=0

  # Wait a moment for services to start
  sleep 5

  # Request fresh cert via standalone mode (port 80 must be free)
  docker run --rm \
    -v /home/ec2-user/certbot/conf:/etc/letsencrypt \
    -v /home/ec2-user/certbot/www:/var/www/certbot \
    -p 80:80 \
    certbot/certbot certonly \
      --standalone \
      -d ${domain} \
      -d analytics.${domain} \
      --non-interactive \
      --agree-tos \
      --email ${alert_email} \
      --no-eff-email

  # Set ownership after certbot run
  chown -R ec2-user:ec2-user /home/ec2-user/certbot/

  # Backup new certs to SSM
  if [ -f /home/ec2-user/certbot/conf/live/${domain}/fullchain.pem ]; then
    echo "Backing up certs to SSM..."
    aws ssm put-parameter --name "/code-monet/ssl/fullchain" \
      --value "$(cat /home/ec2-user/certbot/conf/live/${domain}/fullchain.pem)" \
      --type SecureString --overwrite --region us-east-1
    aws ssm put-parameter --name "/code-monet/ssl/privkey" \
      --value "$(cat /home/ec2-user/certbot/conf/live/${domain}/privkey.pem)" \
      --type SecureString --overwrite --region us-east-1
    aws ssm put-parameter --name "/code-monet/ssl/cert-timestamp" \
      --value "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      --type String --overwrite --region us-east-1
    echo "Certs backed up to SSM"
  else
    echo "WARNING: Certbot failed to obtain certificate"
  fi
fi

# =============================================================================
# Start All Services (including nginx now that SSL is ready)
# =============================================================================
echo "Starting all services..."
docker-compose -f docker-compose.prod.yml up -d

# =============================================================================
# SSL Certificate Renewal Backup Script
# =============================================================================
cat > /usr/local/bin/backup-ssl-certs.sh << 'BACKUP_SCRIPT'
#!/bin/bash
# Backup renewed certs to SSM after certbot renewal
CERT_DIR="/home/ec2-user/certbot/conf/live/${domain}"
LOG_FILE="/home/ec2-user/data/logs/ssl-backup.log"

if [ -f "$CERT_DIR/fullchain.pem" ]; then
  aws ssm put-parameter --name "/code-monet/ssl/fullchain" \
    --value "$(cat $CERT_DIR/fullchain.pem)" \
    --type SecureString --overwrite --region us-east-1
  aws ssm put-parameter --name "/code-monet/ssl/privkey" \
    --value "$(cat $CERT_DIR/privkey.pem)" \
    --type SecureString --overwrite --region us-east-1
  aws ssm put-parameter --name "/code-monet/ssl/cert-timestamp" \
    --value "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --type String --overwrite --region us-east-1
  echo "[$(date)] SSL certs backed up to SSM" >> "$LOG_FILE"
else
  echo "[$(date)] ERROR: No certs found at $CERT_DIR" >> "$LOG_FILE"
fi
BACKUP_SCRIPT
chmod +x /usr/local/bin/backup-ssl-certs.sh

# Systemd service for cert backup
cat > /etc/systemd/system/ssl-backup.service << 'SERVICE'
[Unit]
Description=Backup SSL certificates to SSM
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/backup-ssl-certs.sh
SERVICE

# Systemd timer (runs weekly - certs renew at 60 days, valid 90)
cat > /etc/systemd/system/ssl-backup.timer << 'TIMER'
[Unit]
Description=Weekly SSL certificate backup to SSM

[Timer]
OnCalendar=weekly
Persistent=true

[Install]
WantedBy=timers.target
TIMER

systemctl daemon-reload
systemctl enable ssl-backup.timer
systemctl start ssl-backup.timer

# =============================================================================
# Health Check - Wait for services to be ready
# =============================================================================
echo "Waiting for services to become healthy..."
for i in {1..30}; do
  BACKEND=$(curl -sf http://localhost:8000/health 2>/dev/null && echo "ok" || echo "")
  NGINX=$(curl -sf -o /dev/null -w "%%{http_code}" --insecure https://localhost 2>/dev/null || echo "000")

  if [ "$BACKEND" = "ok" ] && [ "$NGINX" = "200" -o "$NGINX" = "301" -o "$NGINX" = "302" ]; then
    echo "All services healthy (backend=ok, nginx=$NGINX)"
    break
  fi

  echo "Waiting... attempt $i/30 (backend=$BACKEND, nginx=$NGINX)"
  sleep 10
done

# Final status check
if [ "$BACKEND" = "ok" ]; then
  echo "Backend: HEALTHY"
else
  echo "Backend: NOT READY (may need more time)"
fi

if [ "$NGINX" = "200" -o "$NGINX" = "301" -o "$NGINX" = "302" ]; then
  echo "Nginx: HEALTHY"
else
  echo "Nginx: NOT READY (may need more time)"
fi

# Signal completion
echo "User data script completed successfully" > /home/ec2-user/user_data_complete.txt
echo "Bootstrap completed at $(date)" >> /home/ec2-user/user_data_complete.txt
