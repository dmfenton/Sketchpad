# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/dmfenton/sketchpad/compare/v1.0.2...HEAD
[1.0.2]: https://github.com/dmfenton/sketchpad/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/dmfenton/sketchpad/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/dmfenton/sketchpad/releases/tag/v1.0.0
