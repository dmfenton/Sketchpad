# Mobile-Responsive Auth-Protected Web App Plan

## Overview

Transform the web dev server into a production-ready mobile-responsive web app:
1. **Mobile responsive** - Works on phones/tablets via Tailwind CSS
2. **Auth-protected** - Uses existing magic link auth in production
3. **Python-served** - FastAPI serves built static files

## Tech Stack

- **Tailwind CSS 4** - CSS-first configuration with `@theme` directive
- **Vite + @tailwindcss/vite** - Build integration
- **Custom theme colors** - bg-primary, bg-secondary, accent, etc.

---

## Phase 1: Mobile Responsive Design ✅ COMPLETE

**Current state**: 3-column fixed grid (canvas + right panel 400px)

**Target**: Responsive layout with collapsible panels for mobile

### 1.0 Tailwind Setup ✅ DONE

- Installed `tailwindcss`, `@tailwindcss/vite`, `postcss`, `autoprefixer`
- Updated `vite.config.ts` with Tailwind plugin
- Converted `styles.css` to use Tailwind 4's `@theme` directive
- Added responsive breakpoints and mobile nav styles

### 1.1 Layout Strategy

| Viewport | Layout |
|----------|--------|
| Desktop (≥1024px) | Current 3-column: canvas + sidebars |
| Tablet (768-1023px) | 2-column: canvas + collapsible right panel |
| Mobile (<768px) | Single column with tab navigation |

### 1.2 Component Changes

**App.tsx**
- Add viewport-aware layout switching
- Mobile: Tab bar at bottom (Canvas / Messages / Debug)
- Add hamburger menu for panel toggle

**Canvas.tsx**
- Touch event handlers (touchstart, touchmove, touchend)
- Pinch-to-zoom for canvas navigation
- Full-width on mobile with aspect ratio preserved
- Drawing mode indicator repositioned for mobile

**MessageStream.tsx**
- Full-screen mode on mobile
- Larger touch targets for expandable sections
- Swipe gestures for navigation

**ActionBar.tsx**
- Stack buttons vertically on mobile
- Larger touch targets (min 44px)
- Bottom-fixed on mobile

**DebugPanel.tsx**
- Full-screen modal on mobile
- Accessible via tab or hamburger menu

### 1.3 CSS Changes ✅ DONE

**Tailwind 4 Theme** (`styles.css`):
```css
@import 'tailwindcss';

@theme {
  --color-bg-primary: #1a1a2e;
  --color-bg-secondary: #16213e;
  --color-bg-tertiary: #0f3460;
  --color-accent: #e94560;
  --color-accent-dim: #a83248;
  --color-text-primary: #eee;
  --color-text-secondary: #aaa;
  --color-text-muted: #666;
  --color-border: #333;
  --color-success: #4ade80;
  --color-warning: #fbbf24;
  --color-error: #ef4444;
}

/* Responsive breakpoints already added */
@media (max-width: 767px) { /* Mobile */ }
@media (max-width: 1023px) { /* Tablet */ }

/* Touch-friendly sizing via @utility */
@utility touch-target {
  min-height: 44px;
  min-width: 44px;
}
```

**Tailwind classes available**:
- `bg-bg-primary`, `bg-bg-secondary`, `bg-accent`
- `text-text-primary`, `text-text-secondary`
- `border-border`, `border-accent`
- All standard Tailwind utilities (flex, grid, p-*, etc.)

### 1.4 New Files

- `web/src/components/MobileNav.tsx` - Bottom tab bar for mobile
- `web/src/hooks/useViewport.ts` - Viewport size detection hook

---

## Phase 2: Authentication Integration ✅ COMPLETE

**Current state**: Dev token auto-fetched from `/auth/dev-token` (dev mode only)

**Target**: Full auth flow in production, dev token preserved for development

### 2.1 Auth Context for Web

Create `web/src/context/AuthContext.tsx` (adapted from mobile app):

```typescript
interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: User | null;
  accessToken: string | null;
}

interface AuthContextType extends AuthState {
  requestMagicLink: (email: string) => Promise<void>;
  verifyMagicLinkCode: (email: string, code: string) => Promise<void>;
  refreshToken: () => Promise<void>;
  signOut: () => void;
}
```

### 2.2 Auth Screen

Create `web/src/components/AuthScreen.tsx`:
- Email input for magic link request
- 6-digit code input after email sent
- Loading states and error messages
- Styled to match dark theme

### 2.3 Token Management

**useWebSocket.ts changes**:
- Use auth context instead of direct dev token fetch
- Handle 4001 WebSocket auth errors → trigger refresh
- Queue messages during reconnection

**useDebug.ts changes**:
- Use auth context for Bearer token
- Handle 401 responses → trigger refresh or logout

### 2.4 Protected Routes

**App.tsx changes**:
```typescript
function App() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <AuthScreen />;
  return <MainApp />;
}
```

### 2.5 Dev Mode Bypass

Keep dev token flow for local development:
```typescript
const isDev = import.meta.env.DEV;
if (isDev) {
  // Fetch dev token automatically
} else {
  // Require real authentication
}
```

---

## Phase 3: Python Server Static Hosting ✅ COMPLETE

**Current state**: Vite dev server on :5173, proxies to FastAPI :8000

**Target**: FastAPI serves built web app in production

### 3.1 Server Changes

**main.py additions**:
```python
from fastapi.staticfiles import StaticFiles
from pathlib import Path

# After all API routers...
web_dist = Path(__file__).parent.parent.parent / "web" / "dist"
if web_dist.exists():
    # Mount with SPA fallback (html=True)
    app.mount("/", StaticFiles(directory=web_dist, html=True), name="web")
```

**Route priority** (order matters):
1. `/auth/*` - Auth endpoints
2. `/api/*` - API endpoints (if prefixed)
3. `/ws` - WebSocket
4. `/.well-known/*` - AASA
5. `/debug/*` - Debug endpoints
6. `/share/*` - Share routes
7. `/*` - Static files (last, catches all)

### 3.2 Build Integration

**Makefile additions**:
```makefile
web-build:
	cd web && npm run build

server-with-web: web-build
	cd server && uv run uvicorn drawing_agent.main:app
```

### 3.3 Docker Changes

**Dockerfile** (multi-stage build):
```dockerfile
# Stage 1: Build web
FROM node:20-slim AS web-builder
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Stage 2: Python server
FROM python:3.11-slim
...
COPY --from=web-builder /web/dist ./web/dist
```

### 3.4 Environment-Aware Config

**web/src/config.ts** changes:
```typescript
// Production: same origin (served by FastAPI)
// Development: proxy via Vite
export const API_BASE = import.meta.env.PROD ? '' : '';
export const WS_URL = import.meta.env.PROD
  ? `wss://${window.location.host}/ws`
  : 'ws://localhost:8000/ws';
```

---

## Phase 4: Testing & Polish

### 4.1 Testing Checklist

- [ ] Mobile Safari (iOS 15+)
- [ ] Chrome Mobile (Android)
- [ ] Tablet landscape/portrait
- [ ] Desktop browsers (Chrome, Firefox, Safari)
- [ ] Auth flow: magic link request → code entry → authenticated
- [ ] Token refresh on expiry
- [ ] WebSocket reconnection after auth refresh
- [ ] Canvas touch drawing
- [ ] All action bar buttons accessible on mobile

### 4.2 Performance

- Lazy load DebugPanel (not needed on mobile)
- Optimize bundle size (code splitting)
- Add service worker for offline capability (future)

---

## Implementation Order

| Step | Description | Files |
|------|-------------|-------|
| 1 | Add viewport hook | `useViewport.ts` |
| 2 | Mobile CSS breakpoints | `styles.css` |
| 3 | Mobile navigation component | `MobileNav.tsx` |
| 4 | Responsive App layout | `App.tsx` |
| 5 | Touch events for Canvas | `Canvas.tsx` |
| 6 | Web AuthContext | `AuthContext.tsx` |
| 7 | Auth screen UI | `AuthScreen.tsx` |
| 8 | Update hooks to use auth | `useWebSocket.ts`, `useDebug.ts` |
| 9 | Static file mount | `main.py` |
| 10 | Docker multi-stage build | `Dockerfile` |
| 11 | Makefile commands | `Makefile` |
| 12 | Test & iterate | All |

---

## File Summary

### New Files
- `web/src/hooks/useViewport.ts`
- `web/src/components/MobileNav.tsx`
- `web/src/context/AuthContext.tsx`
- `web/src/components/AuthScreen.tsx`

### Modified Files
- `web/src/styles.css` - Add responsive breakpoints
- `web/src/App.tsx` - Responsive layout, auth guard
- `web/src/components/Canvas.tsx` - Touch events
- `web/src/components/ActionBar.tsx` - Mobile layout
- `web/src/components/MessageStream.tsx` - Mobile layout
- `web/src/components/DebugPanel.tsx` - Modal on mobile
- `web/src/hooks/useWebSocket.ts` - Auth context integration
- `web/src/hooks/useDebug.ts` - Auth context integration
- `web/src/config.ts` - Environment-aware URLs
- `server/drawing_agent/main.py` - Static file mount
- `server/Dockerfile` - Multi-stage build
- `Makefile` - Web build commands
