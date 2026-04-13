/**
 * ClearMyMind — API Server
 * =========================
 * Express REST API for ClearMyMind transactional operations.
 *
 * Architecture (mirrors EveryDay):
 *   server/index.js          — Entry point, app bootstrap
 *   src/routes/              — Route definitions per domain
 *   src/controllers/         — Business logic per domain
 *   src/db/store.js          — Local JSON persistence (dev cache)
 *   src/middleware/          — Global middleware (error, 404)
 *   src/services/            — External integrations (Brevo email)
 *   src/utils/               — Shared utilities
 *
 * API Base: http://localhost:3001/api
 *
 * Routes:
 *   POST   /api/auth/send-verification    — Send Brevo verification email
 *   POST   /api/auth/resend-verification  — Resend verification email
 *
 *   GET    /api/data/export    — Full user data export (JSON)
 *   DELETE /api/data/reset     — Wipe all data (X-Confirm-Reset: yes)
 *
 *   GET    /api/settings       — User profile/preferences
 *   PATCH  /api/settings       — Update settings (partial)
 *
 *   GET    /api/health         — Health check
 *
 * NOTE: ClearMyMind talks directly to Firestore from the client (PASSI arch).
 * This server handles transactional operations only (email, admin tasks).
 * It is NOT in the critical data path.
 */

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { initStore } from './src/db/store.js'
import { errorHandler, notFound } from './src/middleware/errorHandler.js'

import authRoutes     from './src/routes/auth.routes.js'
import dataRoutes     from './src/routes/data.routes.js'
import settingsRoutes from './src/routes/settings.routes.js'

const PORT = process.env.PORT || 3001

// ── Initialize persistence store ────────────────────────────────────────────
initStore()

// ── Create Express app ────────────────────────────────────────────────────────
const app = express()

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'https://thrishankkuntimaddi.github.io',  // production client
  ],
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-Confirm-Reset'],
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ── Request logger ────────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  next()
})

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',     authRoutes)
app.use('/api/data',     dataRoutes)
app.use('/api/settings', settingsRoutes)

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'ClearMyMind API',
    uptime: process.uptime(),
    time: new Date().toISOString(),
  })
})

// ── 404 + Error handlers ──────────────────────────────────────────────────────
app.use(notFound)
app.use(errorHandler)

// ── Boot ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🧠 ClearMyMind API Server running at http://localhost:${PORT}`)
  console.log(`   Health:   http://localhost:${PORT}/api/health`)
  console.log(`   Auth:     http://localhost:${PORT}/api/auth`)
  console.log(`   Data:     http://localhost:${PORT}/api/data`)
  console.log(`   Settings: http://localhost:${PORT}/api/settings\n`)
})
