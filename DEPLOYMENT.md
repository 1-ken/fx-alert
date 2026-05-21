# DEPLOYMENT.md

## FX Alert - Frontend & Backend Deployment Guide

This document covers environment configuration, deployment setup, and alert provider integration for FX Alert.

## Table of Contents

1. [Frontend Environment Variables](#frontend-environment-variables)
2. [Backend API Configuration](#backend-api-configuration)
3. [Alert Providers Setup](#alert-providers-setup)
4. [WebSocket Configuration](#websocket-configuration)
5. [Deployment Platforms](#deployment-platforms)

---

## Frontend Environment Variables

Create a `.env.local` file in the frontend root directory with the following variables:

### Authentication & Session
```env
# NextAuth Configuration
NEXTAUTH_SECRET=<generate-with: openssl rand -base64 32>
NEXTAUTH_URL=http://localhost:3000
# For production, set to your deployed URL: https://your-app.com

# Node.js settings
NODE_OPTIONS="--max-http-header-size=80000 --dns-result-order=ipv4first"
```

### External APIs
```env
# Backend API Base URL
NEXT_PUBLIC_API_URL=http://localhost:8000
# For production: https://api.your-domain.com

# Observer WebSocket URL
NEXT_PUBLIC_OBSERVER_WS_URL=wss://localhost:8000/ws/observe
# For production: wss://api.your-domain.com/ws/observe
```

### Google OAuth
```env
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
```

Get these from [Google Cloud Console](https://console.cloud.google.com/):
1. Create a project
2. Enable Google+ API
3. Create OAuth 2.0 credentials (Web application)
4. Add authorized redirect URIs:
   - Development: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://your-app.com/api/auth/callback/google`

### Firebase Web Config
```env
NEXT_PUBLIC_FIREBASE_API_KEY=<firebase-api-key>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<firebase-project>.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<firebase-project-id>
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=<firebase-project>.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<sender-id>
NEXT_PUBLIC_FIREBASE_APP_ID=<app-id>
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=<measurement-id>
```

Get these from Firebase Console → Project Settings → Your Apps → Web app credentials.

### Firebase Admin SDK
```env
FIREBASE_PROJECT_ID=<firebase-project-id>
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@<project>.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Generate from Firebase Console → Project Settings → Service Accounts → Generate new private key.

---

## Backend API Configuration

The backend requires the following configuration (see backend `config.json`):

### Core Settings
```json
{
  "url": "https://www.trading-economics.com/currencies",
  "waitSelector": "body",
  "tableSelector": "table[class*='currency']",
  "pairCellSelector": "tbody tr td:first-child",
  "streamIntervalSeconds": 2,
  "snapshotTimeoutSeconds": 30,
  "maxSnapshotFailures": 5,
  "wsSendTimeoutSeconds": 10,
  "alertActionTimeoutSeconds": 30,
  "majors": ["USD", "EUR", "JPY", "GBP", "AUD", "CAD", "CHF", "NZD"],
  "injectMutationObserver": true
}
```

### Multiple Data Sources
```json
{
  "sources": [
    {
      "name": "currencies",
      "url": "https://www.trading-economics.com/currencies",
      "enabled": true,
      "tableSelector": "table[class*='currency']"
    },
    {
      "name": "commodities",
      "url": "https://www.trading-economics.com/commodities",
      "enabled": true,
      "tableSelector": "table[class*='commodity']"
    }
  ]
}
```

---

## Alert Providers Setup

FX Alert supports multiple alert delivery channels. Configure the provider credentials in backend environment variables:

### Email Alerts (SendGrid)
```env
SENDGRID_API_KEY=<your-sendgrid-api-key>
SENDGRID_FROM_EMAIL=noreply@fx-alert.com
```

1. Sign up at [SendGrid](https://sendgrid.com)
2. Create an API key in Settings → API Keys
3. Verify sender email or domain

### SMS Alerts (Twilio)
```env
TWILIO_ACCOUNT_SID=<your-twilio-account-sid>
TWILIO_AUTH_TOKEN=<your-twilio-auth-token>
TWILIO_PHONE_NUMBER=+1234567890
```

1. Sign up at [Twilio](https://www.twilio.com)
2. Get Account SID and Auth Token from Console
3. Buy or verify a phone number

### SMS Alerts (Africa's Talking)
```env
AFRICAS_TALKING_API_KEY=<your-africas-talking-api-key>
AFRICAS_TALKING_USERNAME=<your-username>
```

1. Sign up at [Africa's Talking](https://africastalking.com)
2. Get API key from dashboard
3. Set your username

---

## WebSocket Configuration

### Frontend Connection

The WebSocket URL is provided by the backend via the `/me` endpoint:
```typescript
const bootstrap = await getMe(session);
const wsUrl = bootstrap.wsUrl; // e.g., "wss://api.your-domain.com/ws/observe"
```

### Authentication

Bearer token must be attached via query parameter:
```typescript
const token = session.accessToken;
const wsUrl = `${bootstrap.wsUrl}?access_token=${token}`;
const ws = new WebSocket(wsUrl);
```

### Production HTTPS/WSS

Both HTTP and WebSocket connections must use secure protocols in production:
- Frontend API calls: `https://` (not `http://`)
- WebSocket connections: `wss://` (not `ws://`)
- Ensure backend is served over HTTPS/WSS
- Configure proper SSL/TLS certificates

---

## Deployment Platforms

### Local Development

```bash
# Terminal 1: Backend
cd finance-observer
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate.ps1
pip install -r requirements.txt
python -m playwright install
uvicorn main:app --reload --port 8000

# Terminal 2: Frontend
cd fx-alerfrontend
bun install
bun run dev
# Runs on http://localhost:3000
```

### Docker Deployment

**Frontend Dockerfile:**
```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json bun.lockb ./
RUN npm install -g bun && bun install
COPY . .
RUN bun run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
RUN npm install -g bun
EXPOSE 3000
CMD ["bun", "start"]
```

**Backend Dockerfile:**
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN python -m playwright install
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Vercel (Frontend)

1. Push code to GitHub
2. Connect repository to Vercel
3. Set environment variables in project settings
4. Deploy automatically on push

```bash
# Or deploy from CLI
vercel --env-file .env.local
```

### AWS/GCP/Azure (Backend)

Deploy FastAPI backend as containerized service:

**AWS EC2/ECS:**
- Push Docker image to ECR
- Create ECS task definition
- Configure ALB with HTTPS
- Set environment variables in task definition

**Google Cloud Run:**
```bash
gcloud run deploy fx-alert-backend \
  --source . \
  --platform managed \
  --region us-central1 \
  --set-env-vars "SENDGRID_API_KEY=xxx"
```

**Azure Container Instances:**
```bash
az container create \
  --resource-group myResourceGroup \
  --name fx-alert-backend \
  --image myregistry.azurecr.io/fx-alert:latest \
  --environment-variables SENDGRID_API_KEY=xxx
```

---

## Environment Variables Checklist

### Frontend (.env.local)
- [ ] NEXTAUTH_SECRET
- [ ] NEXTAUTH_URL
- [ ] NEXT_PUBLIC_API_URL
- [ ] NEXT_PUBLIC_OBSERVER_WS_URL
- [ ] GOOGLE_CLIENT_ID
- [ ] GOOGLE_CLIENT_SECRET
- [ ] NEXT_PUBLIC_FIREBASE_* (6 variables)
- [ ] FIREBASE_PROJECT_ID
- [ ] FIREBASE_CLIENT_EMAIL
- [ ] FIREBASE_PRIVATE_KEY

### Backend (.env)
- [ ] SENDGRID_API_KEY (if email alerts enabled)
- [ ] TWILIO_* (if SMS via Twilio)
- [ ] AFRICAS_TALKING_* (if SMS via Africa's Talking)
- [ ] Database credentials (if applicable)
- [ ] OAuth/JWT secrets

---

## Troubleshooting

### WebSocket Connection Fails
- Check `wss://` is used in production (not `ws://`)
- Verify bearer token is attached: `?access_token=<token>`
- Ensure backend is running and listening on correct port
- Check CORS and firewall rules

### API Calls Return 401 Unauthorized
- Verify bearer token is being sent in `Authorization: Bearer <token>` header
- Ensure `accessToken` is available in session (check JWT callback in `lib/auth.ts`)
- Check token hasn't expired

### Market Data Not Updating
- Verify backend is scraping correctly: `GET /snapshot` returns data
- Check market hours: data only streams during forex market open (24/5)
- Inspect WebSocket connection in browser DevTools

### Email/SMS Not Sending
- Verify provider API keys are set correctly in backend environment
- Check alert action timeout is sufficient: `alertActionTimeoutSeconds`
- Review backend logs for provider errors
- Ensure user has provided valid phone number/email

---

## Security Best Practices

1. **Never commit `.env` files** — Use `.env.local` (gitignored) for development
2. **Rotate secrets regularly** — Regenerate API keys every 90 days
3. **Use HTTPS/WSS in production** — Self-signed certs not recommended
4. **Validate bearer tokens** — Backend should verify token signature
5. **Rate limit API endpoints** — Prevent abuse
6. **Encrypt stored credentials** — Phone numbers, email addresses
7. **Keep dependencies updated** — Run `npm audit` and `pip check` regularly

---

## Support

For issues:
- Check logs: `docker logs <container-id>`
- Review environment variables: `echo $NEXT_PUBLIC_API_URL`
- Test API manually: `curl -H "Authorization: Bearer <token>" https://api.your-domain.com/snapshot`
- Inspect WebSocket traffic in browser DevTools → Network → WS
