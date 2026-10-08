/**
 * ClearMyMind — API Server
 * =========================
 * Express REST API for ClearMyMind transactional operations.
 *
 *   server/index.js          — Entry point, app bootstrap
 *   src/routes/              — Route definitions per domain
 *   src/controllers/         — Business logic per domain
 *   src/db/store.js          — Local JSON persistence (per-user, keyed by uid)
 *   src/middleware/          — Auth, security headers, rate limits, errors
 *   src/services/            — External integrations (Brevo email)
 *
 * API Base: http://localhost:3001/api
 *
 * Every route except /api/health requires `Authorization: Bearer <Firebase ID token>`
 * and only ever touches the caller's own data.
 *
 *   POST   /api/auth/send-verification    — Email the caller a verification link
 *   POST   /api/auth/resend-verification  — Alias
 *   GET    /api/data/export               — Caller's server-side data (JSON)
 *   DELETE /api/data/reset                — Wipe caller's data (X-Confirm-Reset: yes)
 *   GET    /api/settings                  — Caller's preferences
 *   PATCH  /api/settings                  — Update caller's preferences
 *   GET    /api/health                    — Health check (public)
 *
 * NOTE: ClearMyMind talks directly to Firestore from the client (PASSI arch).
 * This server is NOT in the critical data path.
 */

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { initStore } from './src/db/store.js'
import { errorHandler, notFound } from './src/middleware/errorHandler.js'
import { requireAuth } from './src/middleware/auth.js'
import { securityHeaders, rateLimit } from './src/middleware/security.js'

import authRoutes     from './src/routes/auth.routes.js'
import dataRoutes     from './src/routes/data.routes.js'
import settingsRoutes from './src/routes/settings.routes.js'

const PORT = process.env.PORT || 3001

const ALLOWED_ORIGINS = [
  'https://thrishankkuntimaddi.github.io',  // production client
  ...(process.env.NODE_ENV === 'production'
    ? []
    : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173']),
]

initStore()

const app = express()

// Behind a proxy (Render, Fly, nginx…) set TRUST_PROXY=1 so req.ip is the
// real client address for rate limiting.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1)
app.disable('x-powered-by')

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(securityHeaders)
app.use(cors({
  origin: ALLOWED_ORIGINS,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Confirm-Reset'],
  maxAge: 600,
}))
app.use(express.json({ limit: '10kb' }))              // nothing here needs big bodies
app.use(rateLimit({ windowMs: 60_000, max: 120 }))    // global per-IP backstop

// Log method + path only — never bodies, tokens or emails
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  next()
})

// ── Public ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'ClearMyMind API', time: new Date().toISOString() })
})

// ── Authenticated API ─────────────────────────────────────────────────────────
app.use('/api', requireAuth)
app.use('/api/auth',     authRoutes)
app.use('/api/data',     dataRoutes)
app.use('/api/settings', settingsRoutes)

// ── 404 + Error handlers ──────────────────────────────────────────────────────
app.use(notFound)
app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`\n🧠 ClearMyMind API Server running at http://localhost:${PORT}`)
  console.log(`   Health: http://localhost:${PORT}/api/health\n`)
})
