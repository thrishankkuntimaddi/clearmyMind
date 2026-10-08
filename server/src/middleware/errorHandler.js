/**
 * errorHandler.js — Global Express error handler middleware.
 * Internal error details are logged, never sent to the client.
 */

export function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500
  console.error(`[Error] ${req.method} ${req.path}:`, err.message)
  res.status(status).json({
    // Client errors (e.g. malformed JSON, body too large) are safe to describe
    error: status < 500 ? (err.expose ? err.message : 'Bad request') : 'Internal Server Error',
    timestamp: new Date().toISOString(),
  })
}

/** notFound — 404 handler for unmatched routes. */
export function notFound(req, res) {
  res.status(404).json({ error: 'Route not found', timestamp: new Date().toISOString() })
}
