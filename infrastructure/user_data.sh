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

# Configure CloudWatch agent
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
      "InstanceId": "${aws:InstanceId}"
    }
  }
}
EOF

# Start CloudWatch agent
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -s

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
mkdir -p /home/ec2-user/certbot/conf
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
CONFIG_BUCKET="drawing-agent-config-${ACCOUNT_ID}"

echo "Downloading config files from s3://${CONFIG_BUCKET}/deploy/..."
aws s3 sync "s3://${CONFIG_BUCKET}/deploy/" /home/ec2-user/ --region us-east-1
chown -R ec2-user:ec2-user /home/ec2-user/*.yml /home/ec2-user/*.yaml /home/ec2-user/*.conf 2>/dev/null || true
chown -R ec2-user:ec2-user /home/ec2-user/web 2>/dev/null || true

# Create a script to sync web files from S3
cat > /home/ec2-user/sync-web.sh << 'SCRIPT'
#!/bin/bash
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
ACCOUNT_ID=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/dynamic/instance-identity/document | grep accountId | cut -d'"' -f4)
CONFIG_BUCKET="drawing-agent-config-${ACCOUNT_ID}"
aws s3 sync "s3://${CONFIG_BUCKET}/deploy/web/" /home/ec2-user/web/ --region us-east-1 --delete --exact-timestamps
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

# Signal completion
echo "User data script completed successfully" > /home/ec2-user/user_data_complete.txt
