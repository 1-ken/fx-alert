# Onboarding Integration Status

## Current Status ✅ Ready for Testing

The onboarding system is **fully implemented and ready to test** once the backend is running. The frontend has been configured with:

- ✅ Onboarding component (2-step flow: Welcome → Features → Success)
- ✅ Onboarding route (`/onboarding`)
- ✅ Bootstrap API client (`getMe()` & `completeOnboarding()`)
- ✅ Bootstrap React Context for global state
- ✅ Onboarding guard in main layout (automatic redirect for first-time users)
- ✅ Debug logging in all onboarding-related code

## How It Works

### Onboarding Flow

```
Login → Firebase Auth → BootstrapProvider.fetchBootstrap() 
  ↓
GET /me (from backend)
  ↓
isFirstTimeUser === true?
  ├─ YES → Redirect to /onboarding
  │         User completes onboarding
  │         POST /onboarding/complete
  │         Redirect to /dashboard
  │
  └─ NO → Show dashboard (user has already onboarded)
```

## Testing When Backend is Ready

### Step 1: Start Backend
```bash
cd finance-observer/
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install
uvicorn main:app --reload --port 8000
```

### Step 2: Verify Backend Endpoints
```bash
# Test /me endpoint (requires bearer token)
curl -X GET http://localhost:8000/me \
  -H "Authorization: Bearer <valid-jwt-token>"

# Expected response:
# {
#   "userId": "110227220787630856816",
#   "isFirstTimeUser": true,
#   "onboardingCompletedAt": null,
#   "wsUrl": "ws://localhost:8000/ws/observe",
#   "apiBaseUrl": "http://localhost:8000"
# }
```

### Step 3: Test Frontend Onboarding
1. **Hard refresh** browser (Ctrl+Shift+R or Cmd+Shift+R)
2. **Clear cookies** or use **incognito window**
3. **Login with new account**
4. Watch for debug logs in browser console:

```
[Bootstrap] Fetching bootstrap data for user: 110227220787630856816
[getMe] Fetching from: http://localhost:8000/me
[getMe] Authorization token present: true
[getMe] Response status: 200
[getMe] Successfully fetched bootstrap data
[Bootstrap] User onboarding status: {
  isFirstTimeUser: true,
  onboardingCompletedAt: null
}
[OnboardingGuard] First-time user detected, redirecting to onboarding
```

5. **Onboarding page should appear** (if logs show redirection)
6. **Complete 2-step onboarding**
7. **Redirect to dashboard** automatically

### Step 4: Test Returning User
1. **Login again with same account**
2. **Should skip onboarding and go straight to dashboard**
3. Debug logs should show:

```
[Bootstrap] User onboarding status: {
  isFirstTimeUser: false,
  onboardingCompletedAt: "2026-05-19T..."
}
[OnboardingGuard] User is returning user or onboarding already completed
```

## Fallback Behavior (Current State)

**Since backend isn't ready yet**, the onboarding guard allows access to the dashboard even if bootstrap data is unavailable:

```
[OnboardingGuard] Bootstrap data unavailable (backend may not be ready), allowing access
```

This means:
- ✅ Dashboard will load even without `/me` endpoint
- ✅ No blocking errors
- ⚠️ Onboarding won't trigger (needs backend)

## Debug Logging

All onboarding-related code has detailed console logging:

| File | Logs |
|------|------|
| `lib/api/bootstrap.ts` | `[getMe]`, `[completeOnboarding]` |
| `components/bootstrap-provider.tsx` | `[Bootstrap]` |
| `app/(main)/layout.tsx` | `[OnboardingGuard]` |

**To see logs:** Open DevTools → Console tab → Search for `[Bootstrap]` or `[OnboardingGuard]`

## Next Steps

1. **Start backend** with `/me`, `/onboarding/complete` endpoints implemented
2. **Test with new user account** → onboarding should trigger
3. **Test with returning user** → onboarding should be skipped
4. **Monitor console logs** to debug any issues
5. Once working, **clean up debug logging** or make it configurable

## Environment Config

Current `.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_OBSERVER_WS_URL=ws://localhost:8000/ws/observe
```

For production, update these to your deployed backend URLs:
```env
NEXT_PUBLIC_API_URL=https://api.your-domain.com
NEXT_PUBLIC_OBSERVER_WS_URL=wss://api.your-domain.com/ws/observe
```

## Backend Requirements

The backend must implement these endpoints:

### `GET /me`
- **Authentication:** Bearer token in `Authorization` header
- **Response:**
  ```json
  {
    "userId": "string",
    "isFirstTimeUser": boolean,
    "onboardingCompletedAt": "ISO-8601 datetime or null",
    "wsUrl": "string (WebSocket URL)",
    "apiBaseUrl": "string (optional)"
  }
  ```

### `POST /onboarding/complete`
- **Authentication:** Bearer token in `Authorization` header
- **Response:** `200 OK` on success

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Onboarding doesn't trigger | `/me` endpoint not implemented or failing | Implement `/me` endpoint in backend |
| 401 Unauthorized on `/me` | Bearer token not validated | Check backend JWT/token validation |
| Blank screen on login | Bootstrap provider stuck loading | Check browser console for `[Bootstrap]` logs |
| Onboarding page shows but doesn't submit | `/onboarding/complete` endpoint missing | Implement endpoint in backend |
| Can't test onboarding | Using same account (already onboarded) | Create new account or clear onboarding status in DB |

## Files Involved

**New Files:**
- `lib/api/bootstrap.ts` — Bootstrap API client
- `lib/api/snapshot.ts` — Snapshot API client
- `components/bootstrap-provider.tsx` — Bootstrap Context Provider
- `components/onboarding/onboarding-page.tsx` — Onboarding UI
- `app/(main)/onboarding/page.tsx` — Onboarding route
- `DEPLOYMENT.md` — Deployment guide
- `FOREX_MARKET_HOURS.md` — Market hours guide

**Modified Files:**
- `app/(main)/layout.tsx` — OnboardingGuard component
- `components/providers.tsx` — BootstrapProvider wrapper
- `hooks/observer/use-ws-token.ts` — Uses bootstrap provider
- `hooks/snapshot/use-stream.ts` — Attaches bearer token to WebSocket
