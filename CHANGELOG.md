# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/dmfenton/sketchpad/compare/v1.2.3...HEAD
[1.2.3]: https://github.com/dmfenton/sketchpad/compare/v1.2.2...v1.2.3
[1.2.2]: https://github.com/dmfenton/sketchpad/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/dmfenton/sketchpad/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/dmfenton/sketchpad/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/dmfenton/sketchpad/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/dmfenton/sketchpad/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/dmfenton/sketchpad/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/dmfenton/sketchpad/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/dmfenton/sketchpad/releases/tag/v1.0.0
