# ClearMyMind — Server

Express API for transactional work (verification email, per-user server
settings). The React client talks to Firestore directly; this server is **not**
in the critical data path, and GitHub Pages only hosts the client.

## Security model

| Layer | What it does |
|---|---|
| **Firebase ID-token auth** | Every route except `GET /api/health` needs `Authorization: Bearer <idToken>` (from `auth.currentUser.getIdToken()`). Tokens are verified with `firebase-admin`, and revoked tokens are refused. |
| **Per-user scope** | Handlers only read or write `req.user.uid`'s data. Settings were previously one global object shared by every caller. |
| **Own-address email only** | Verification mail always goes to the token's email, never to an address from the request body, and is limited to 3 per user per hour. |
| **Rate limiting** | 120 requests per minute per IP across the board, plus the email limit above. |
| **Hardening** | Security headers, `x-powered-by` off, 10 kB body limit, CORS allow-list (localhost only outside production), generic 5xx errors, no PII in logs, HTML-escaped email templates. |
| **Store** | `src/db/data.json` is git-ignored, written atomically with mode `0600`, and keyed by uid in a prototype-free map. |

## Routes

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | public |
| POST | `/api/auth/send-verification` | body `{ token: <uuid> }` |
| POST | `/api/auth/resend-verification` | alias |
| GET | `/api/data/export` | caller's server data |
| DELETE | `/api/data/reset` | header `X-Confirm-Reset: yes` |
| GET / PATCH | `/api/settings` | `{ name?: string ≤ 80, noclear?: boolean }` |

## Run

```bash
cd server
npm install
cp .env.example .env     # set FIREBASE_PROJECT_ID + Brevo SMTP credentials
npm run dev              # http://localhost:3001/api/health
```

Behind a reverse proxy, set `TRUST_PROXY=1` so rate limits see real client IPs.
