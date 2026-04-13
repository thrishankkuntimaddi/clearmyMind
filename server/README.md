# ClearMyMind — Server

This directory is reserved for future server-side code.

## Current Architecture

ClearMyMind is currently a **100% client-side application**:

- The React/Vite frontend (in `../client/`) communicates directly with Firebase using the Browser SDK.
- Authentication is handled via Firebase Auth.
- Persistent data lives in **Firestore** under `users/{uid}/data/clearmind`.
- No custom API server is needed today.

## Potential Future Uses

| Use Case | Tool |
|---|---|
| Admin operations (bulk delete, reporting) | Firebase Admin SDK (Node.js) |
| Scheduled jobs (daily digest emails) | Express + Cloud Functions |
| Webhook receivers (Stripe, Slack, etc.) | Express router |
| Server-side rendering (SSR) | Vite SSR + Express |

## Getting Started (when ready)

```bash
cd server
npm init -y
npm install express firebase-admin dotenv
```

Then create `src/index.js` as your entry point.
