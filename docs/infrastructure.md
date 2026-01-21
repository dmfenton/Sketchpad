# Infrastructure (AWS)

## Changelog

**Location:** `CHANGELOG.md` at project root

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Update the `[Unreleased]` section when making changes:

- **Added** - New features
- **Changed** - Changes in existing functionality
- **Fixed** - Bug fixes
- **Security** - Vulnerability fixes

Before cutting a release, move `[Unreleased]` items to a new version heading with the release date.

## Cutting a Release

Deploy to production by tagging `main`:

```bash
git checkout main
git pull origin main
git tag v1.0.0
git push origin v1.0.0
```

This triggers `.github/workflows/release.yml` which:

1. Runs E2E SDK tests to verify Claude SDK compatibility
2. Builds web frontend and syncs to S3
3. Builds backend Docker image with version tag
4. Builds SSR Docker image with version tag
5. Pushes both images to AWS ECR
6. Runs database migrations via SSM
7. Creates GitHub Release with changelog
8. Deploys to EC2 via SSM (updates IMAGE_TAG, restarts containers)
9. Verifies deployment via `/api/version` endpoint

## SSR Architecture

The web frontend uses Server-Side Rendering (SSR) for SEO and social sharing:

```
Browser Request
      |
    nginx (443)
      |
  /assets/*     -> static files (cached)
  /api/*        -> drawing-agent:8000
  /ws           -> drawing-agent:8000
  /*            -> web-ssr:3000 (SSR)
    on error    -> static index.html
```

**Components:**

- **web-ssr**: Node.js SSR server running Express + tsx
- **nginx**: Reverse proxy with smart routing and graceful fallback
- **drawing-agent**: Python backend API

**Graceful Degradation:**

1. SSR server down -> nginx serves static SPA via `@fallback`
2. SSR render error -> server.ts catches, serves static fallback
3. Backend down -> SSR returns empty initial data, client fetches on hydrate

**Health Endpoints:**

- `/ssr-health` - SSR server health check
- `/api/version` - Backend API version

**Building SSR Locally:**

```bash
# Build the SSR Docker image
docker build -f web/Dockerfile -t web-ssr:dev .

# Run locally
docker run -p 3000:3000 -e API_URL=http://host.docker.internal:8000 web-ssr:dev
```

## Terraform

All infrastructure is managed via Terraform in `infrastructure/`:

```
infrastructure/
├── main.tf            # Provider config
├── variables.tf       # Input variables
├── outputs.tf         # Output values (URLs, IPs, commands)
├── vpc.tf             # VPC, subnet, internet gateway
├── ec2.tf             # EC2 instance, security group, IAM role, EBS data volume
├── ecr.tf             # ECR repository + lifecycle policy
├── route53.tf         # DNS records
├── ses.tf             # SES email sending (domain verification, DKIM, SPF, DMARC)
├── monitoring.tf      # CloudWatch alarms
├── backup.tf          # DLM backup policies (snapshots EBS volumes tagged Backup=true)
├── github_actions.tf  # IAM user for GitHub Actions ECR push
└── user_data.sh       # EC2 bootstrap script (Docker, CloudWatch agent, EBS mount)
```

**Key resources:**

- **EC2** (t3.small, 2GB RAM) running Docker Compose
- **EBS** 10GB data volume at `/home/ec2-user/data` (persists across instance replacement)
- **ECR** repositories with 5-image retention:
  - `drawing-agent` - Backend API container
  - `web-ssr` - SSR frontend container
- **Elastic IP** for stable addressing
- **Route 53** DNS (monet.dmfenton.net)
- **SES** email sending with domain verification, DKIM, SPF, DMARC
- **CloudWatch** alerts to email

**Terraform commands:**

```bash
cd infrastructure

# Initialize
terraform init

# Plan changes
terraform plan -var="ssh_key_name=your-key" -var="alert_email=you@example.com"

# Apply
terraform apply -var="ssh_key_name=your-key" -var="alert_email=you@example.com"

# Get outputs (IP, URLs, SSH command)
terraform output
```

## SES Email Sending

SES is configured for sending magic link emails from `noreply@dmfenton.net`.

**What Terraform creates:**

- Domain identity verification (TXT record)
- DKIM signing (3 CNAME records)
- SPF record for domain authentication
- DMARC record for email policy
- Custom MAIL FROM domain (`mail.dmfenton.net`)
- IAM policy for EC2 to send emails

**After applying Terraform:**

1. Wait ~5 minutes for DNS propagation
2. Check verification status in AWS Console
3. If in SES sandbox, request production access

**SES Sandbox Limitations:**

- New SES accounts start in "sandbox" mode
- Can only send to verified email addresses
- Request production access via AWS Console -> SES -> Account Dashboard -> Request Production Access

**Environment variables for the app:**

```bash
# Add to .env
SES_SENDER_EMAIL=noreply@dmfenton.net
AWS_REGION=us-east-1
```

**Testing email sending:**

```bash
# From EC2 instance (uses instance role)
aws ses send-email \
  --from noreply@dmfenton.net \
  --to your@email.com \
  --subject "Test" \
  --text "Hello from SES"
```

## Remote Server Management (SSM)

Use `scripts/remote.py` to manage the server via AWS SSM (no SSH needed):

```bash
# View container logs
uv run python scripts/remote.py logs

# Restart container
uv run python scripts/remote.py restart

# Run migrations
uv run python scripts/remote.py migrate

# Create invite code
uv run python scripts/remote.py create-invite

# Create user directly
uv run python scripts/remote.py create-user EMAIL [PASSWORD]

# Run command in container
uv run python scripts/remote.py exec "command"

# Run command on host
uv run python scripts/remote.py shell "command"
```

**Note:** Commands that start Python inside the container can be slow (~30s) due to `uv run` overhead. For direct database access, use sqlite3 on the host:

```bash
uv run python scripts/remote.py shell "sqlite3 /home/ec2-user/data/code_monet.db '.tables'"
```

## SSH Access (if needed)

```bash
ssh -i ~/.ssh/drawing-agent.pem ec2-user@$(terraform -chdir=infrastructure output -raw public_ip)
```

## GitHub Actions IAM User

Managed by Terraform in `infrastructure/github_actions.tf`:

```bash
cd infrastructure

# Create/update IAM user
terraform apply

# Get credentials and set GitHub secrets
gh secret set AWS_ACCESS_KEY_ID --body "$(terraform output -raw github_actions_access_key_id)"
gh secret set AWS_SECRET_ACCESS_KEY --body "$(terraform output -raw github_actions_secret_access_key)"
```

## Required GitHub Secrets (Server)

| Secret                  | Description                      |
| ----------------------- | -------------------------------- |
| `AWS_ACCESS_KEY_ID`     | IAM user access key for ECR push |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key for ECR push |

Add at: https://github.com/dmfenton/CodeMonet/settings/secrets/actions
