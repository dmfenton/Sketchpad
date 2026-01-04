# Release

Cut a new release with changelog update, git tag, and GitHub release.

## Arguments

`$ARGUMENTS` can be:
- `major` - Breaking changes (1.0.0 → 2.0.0)
- `minor` - New features (1.0.0 → 1.1.0)
- `patch` - Bug fixes (1.0.0 → 1.0.1)
- A specific version like `1.2.3`

## Process

### 1. Pre-flight Checks

```bash
# Ensure clean working directory
git status --porcelain

# Ensure on Main branch
git branch --show-current

# Get current version
git describe --tags --abbrev=0
```

Abort if:
- Working directory is dirty
- Not on Main branch
- No previous tags exist (use `1.0.0` for first release)

### 2. Calculate New Version

Based on `$ARGUMENTS`:
- If semver keyword: bump from latest tag
- If specific version: use that version
- Default to `patch` if no argument

### 3. Validate Changelog

Read `CHANGELOG.md` and verify:
- `[Unreleased]` section exists
- `[Unreleased]` section has content (not empty)

If empty, ask user what changes to document before proceeding.

### 4. Update Changelog

Edit `CHANGELOG.md`:
1. Replace `## [Unreleased]` with `## [X.Y.Z] - YYYY-MM-DD`
2. Add new empty `## [Unreleased]` section at top
3. Update comparison links at bottom:
   - Add new version link
   - Update `[Unreleased]` link to compare from new version

Example transformation:
```markdown
## [Unreleased]
### Added
- New feature

## [1.0.1] - 2026-01-03
```
Becomes:
```markdown
## [Unreleased]

## [1.1.0] - 2026-01-04
### Added
- New feature

## [1.0.1] - 2026-01-03
```

### 5. Commit and Tag

```bash
git add CHANGELOG.md
git commit -m "chore: Release vX.Y.Z"
git tag vX.Y.Z
git push origin Main
git push origin vX.Y.Z
```

### 6. Verify Deployments

After pushing the tag, GitHub Actions will:
1. **Server**: Build Docker image → Push to ECR → Watchtower auto-deploys (30s)
2. **iOS App**: Build IPA → Upload to TestFlight

Provide links:
- GitHub Actions: `https://github.com/dmfenton/sketchpad/actions`
- GitHub Release: `https://github.com/dmfenton/sketchpad/releases/tag/vX.Y.Z`

### 7. Summary

Output:
```
Release vX.Y.Z complete!

Deployments triggered:
- Server: ECR push → Watchtower auto-deploy
- iOS: TestFlight build

Monitor: https://github.com/dmfenton/sketchpad/actions
```
