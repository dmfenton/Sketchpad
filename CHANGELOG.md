# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- S3-based config deployment: deploy/ files auto-sync on release, downloaded on EC2 boot
- Terraform-managed S3 bucket for config files with versioning and public access block

## [1.4.2] - 2026-01-05

### Added
- Shareable canvas URLs with Open Graph and Twitter Card meta tags for social media virality
- Public share endpoints at `/s/{token}` with SSR HTML preview page
- Preview image generation at `/s/{token}/preview.png` for social media cards
- Share management endpoints (`POST /s/create`, `GET /s/my-shares`, `DELETE /s/{token}`)
- Apple Smart App Banner on share pages for iOS install prompts
- Release workflow verifies deployment by checking `/version` endpoint

### Fixed
- Watchtower ECR auth: use `credsStore` (not `credHelpers`) with ECR credential helper for IAM-based auth (no tokens, no expiry)

## [1.4.1] - 2026-01-05

### Added
- `/version` endpoint returning app version, commit, and build time
- Docker image labels with OCI metadata (version, revision, created)
- ECR credential helper for automatic Docker auth (no more token expiry)

## [1.4.0] - 2026-01-05

### Added
- OpenTelemetry tracing with AWS X-Ray integration
- ADOT Collector sidecar in docker-compose for trace export
- `/diagnose` skill for querying X-Ray traces from Claude Code
- `scripts/diagnose.py` CLI for trace debugging (recent, errors, trace, path)
- Trace ID included in 500 error responses for debugging

### Changed
- Global exception handler now logs trace IDs for correlation

## [1.3.6] - 2026-01-04

### Fixed
- Add expo-router route for magic link Universal Links (fixes "unmatched route" error)
- Remove TestFlight group assignment (use manual distribution to avoid internal group error)

## [1.3.5] - 2026-01-04

### Fixed
- Add production URL fallback for TestFlight builds (fixes network errors)
- Add beta app feedback email for TestFlight external distribution

## [1.3.4] - 2026-01-04

### Fixed
- Add beta app description for TestFlight external distribution

## [1.3.3] - 2026-01-04

### Fixed
- Add changelog for TestFlight external distribution (required by App Store Connect)
- Correct Alpha group name capitalization

## [1.3.2] - 2026-01-04

### Fixed
- Add `EXPO_PUBLIC_API_URL` for production builds (was falling back to dev IP)
- Auto-distribute TestFlight builds to Alpha group
- Fixed IPA artifact path in CI workflow

## [1.3.1] - 2026-01-04

### Fixed
- Fastlane paths updated to match Expo prebuild output (`CodeMonet` not `DrawingAgent`)

## [1.3.0] - 2026-01-04

### Added
- Magic link 6-digit code verification for local development
- `POST /auth/magic-link/verify-code` endpoint for code-based auth
- Code displayed in email template alongside link
- Code logged in dev mode for easy local testing
- iOS autofill hints (`textContentType`) for email and one-time code fields
- Terraform IAM user for local SES access (minimal permissions)
- Fast Refresh on web via `@expo/metro-runtime`

### Changed
- Config now ignores extra environment variables (AWS credentials)

## [1.2.3] - 2026-01-04

### Added
- Web fallback for magic link verification at `/auth/verify`
- HTML page with app deep link redirect for desktop/web browsers
- `setTokensFromCallback` auth method for deep link token handling
- Support for `codemonet://auth/callback` custom URL scheme

### Fixed
- Magic link now works when clicked in desktop email clients

## [1.2.2] - 2026-01-04

### Added
- Rate limiting on magic link endpoint (3 req/15min per email, 10 req/min per IP)
- Automatic cleanup of expired magic link tokens
- `ses_configuration_set` to config.py for environment-specific SES settings

## [1.2.1] - 2026-01-04

### Fixed
- Magic link verification errors now displayed to users in AuthScreen

### Changed
- Updated CLAUDE.md with magic link authentication documentation

## [1.2.0] - 2026-01-04

### Added
- iOS Universal Links for magic link deep linking
- Apple App Site Association (AASA) endpoint at `/.well-known/apple-app-site-association`
- Deep link handler in React Native app for `/auth/verify` path
- `associatedDomains` configuration for iOS

### Changed
- Magic link is now the default sign-in method in the app
- AuthScreen supports magic link, password sign-in, and sign-up modes

## [1.1.1] - 2026-01-04

### Changed
- Rebranded from "Drawing Agent" to "Code Monet"
- Updated email templates, FastAPI title, and app name
- Fixed magic link base URL to use monet.dmfenton.net

## [1.1.0] - 2026-01-04

### Added
- Magic link (passwordless) authentication via email
- AWS SES integration for sending authentication emails
- SES infrastructure in Terraform (domain verification, DKIM, SPF, DMARC)
- `magic_link_tokens` database table for secure token storage
- `/auth/magic-link` endpoint to request magic links
- `/auth/magic-link/verify` endpoint to exchange tokens for JWT

### Security
- Magic link tokens use 256-bit cryptographic randomness
- Tokens expire after 15 minutes and are single-use
- User enumeration prevented (same response for existing/non-existing emails)

## [1.0.2] - 2026-01-04

### Added
- ECR vulnerability scanning on push
- EBS encryption at rest for data volume
- Secure file permissions (700/600) for database
- `db_utils.py` for local database operations
- `remote.py` for SSM-based server management
- Keep a Changelog format and `/release` command
- Code reviewer now requires changelog updates

### Changed
- SSH access restricted to specific IP (via tfvars)
- Password now required for create-user commands (no defaults)

### Security
- Removed default passwords from scripts
- Added encrypted EBS volume for database storage

## [1.0.1] - 2026-01-03

### Fixed
- Dockerfile health check and dependency installation
- JWT_SECRET environment variable configuration

### Added
- Graceful shutdown handling for containerized deployment
- Watchtower auto-deployment (30s polling)

## [1.0.0] - 2026-01-03

### Added
- JWT-based authentication with refresh tokens
- Invite code system for controlled registration
- Multi-user workspace isolation
- Filesystem-based workspace storage (gallery per user)
- AWS infrastructure (EC2, ECR, Route53, CloudWatch)
- Docker Compose production deployment with nginx + certbot
- GitHub Actions CI/CD pipeline
- Daily EBS snapshots with 7-day retention

### Changed
- Migrated from in-memory to SQLite database
- Migrated workspace storage from database to filesystem

### Features
- Autonomous AI artist powered by Claude Agent SDK
- Real-time canvas updates via WebSocket
- Python-based SVG generation
- Canvas rasterization for agent vision
- React Native mobile app with Expo

[Unreleased]: https://github.com/dmfenton/sketchpad/compare/v1.4.2...HEAD
[1.4.2]: https://github.com/dmfenton/sketchpad/compare/v1.4.1...v1.4.2
[1.4.1]: https://github.com/dmfenton/sketchpad/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/dmfenton/sketchpad/compare/v1.3.6...v1.4.0
[1.3.6]: https://github.com/dmfenton/sketchpad/compare/v1.3.5...v1.3.6
[1.3.5]: https://github.com/dmfenton/sketchpad/compare/v1.3.4...v1.3.5
[1.3.4]: https://github.com/dmfenton/sketchpad/compare/v1.3.3...v1.3.4
[1.3.3]: https://github.com/dmfenton/sketchpad/compare/v1.3.2...v1.3.3
[1.3.2]: https://github.com/dmfenton/sketchpad/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/dmfenton/sketchpad/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/dmfenton/sketchpad/compare/v1.2.3...v1.3.0
[1.2.3]: https://github.com/dmfenton/sketchpad/compare/v1.2.2...v1.2.3
[1.2.2]: https://github.com/dmfenton/sketchpad/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/dmfenton/sketchpad/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/dmfenton/sketchpad/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/dmfenton/sketchpad/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/dmfenton/sketchpad/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/dmfenton/sketchpad/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/dmfenton/sketchpad/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/dmfenton/sketchpad/releases/tag/v1.0.0
