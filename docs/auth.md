# Authentication

## Sign-in Methods

**Magic Link (default):**

1. User enters email in app
2. Server sends email with sign-in link via SES
3. User taps link -> iOS Universal Link opens app
4. App exchanges token for JWT -> user authenticated

**Password (legacy):**

1. Admin creates invite code via CLI
2. User signs up with invite code + password
3. User signs in with email/password

## JWT Tokens

- Access token (1 day) for API calls
- Refresh token (1 year) to get new access token
- WebSocket auth via `?token=<jwt>` query param

## Magic Link API

```bash
# Request magic link (sends email)
curl -X POST https://monet.dmfenton.net/auth/magic-link \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'

# Verify magic link token (returns JWT)
curl -X POST https://monet.dmfenton.net/auth/magic-link/verify \
  -H "Content-Type: application/json" \
  -d '{"token": "abc123..."}'
```

## iOS Universal Links

The app uses Universal Links so magic link emails open directly in the app:

- **AASA endpoint:** `https://monet.dmfenton.net/.well-known/apple-app-site-association`
- **Path handled:** `/auth/verify?token=...`
- **Bundle ID:** `net.dmfenton.sketchpad`
- **Team ID:** Set via `APPLE_TEAM_ID` env var on server

The AASA file is served dynamically by the FastAPI server (see `main.py`).

## Environment Variables

```bash
# Required for auth
JWT_SECRET=<generate with: python -c "import secrets; print(secrets.token_hex(32))">

# Required for iOS Universal Links
APPLE_TEAM_ID=PG5D259899
```
