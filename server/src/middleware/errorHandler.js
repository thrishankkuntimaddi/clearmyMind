/**
 * errorHandler.js — Global Express error handler middleware.
 * Mirrors EveryDay's errorHandler.js exactly.
 */

export function errorHandler(err, req, res, _next) {
  console.error(`[Error] ${req.method} ${req.path}:`, err.message)

  const status = err.status || err.statusCode || 500
  res.status(status).json({
    error:     err.message || 'Internal Server Error',
    path:      req.path,
    timestamp: new Date().toISOString(),
  })
}

/**
 * notFound — 404 handler for unmatched routes.
 */
export function notFound(req, res) {
  res.status(404).json({
    error:     `Route not found: ${req.method} ${req.path}`,
    timestamp: new Date().toISOString(),
  })
}
