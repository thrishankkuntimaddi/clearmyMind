/**
 * security.js — Security headers + in-memory rate limiting
 * ==========================================================
 * Dependency-free equivalents of helmet's core headers and a fixed-window
 * rate limiter. The limiter is per process — fine for a single instance;
 * use a shared store (e.g. Redis) if this server is ever scaled out.
 */

export function securityHeaders(_req, res, next) {
  res.set({
    'X-Content-Type-Options':  'nosniff',
    'X-Frame-Options':         'DENY',
    'Referrer-Policy':         'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-site',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Cache-Control':           'no-store',
  })
  next()
}

/**
 * rateLimit({ windowMs, max, key })
 * key(req) picks the bucket — defaults to client IP. Use the uid for
 * authenticated routes so one account can't hide behind many IPs.
 */
export function rateLimit({ windowMs, max, key = (req) => req.ip, message = 'Too many requests — slow down.' }) {
  const hits = new Map()   // bucket → { count, resetAt }

  // Periodically forget expired buckets so memory can't grow without bound
  setInterval(() => {
    const now = Date.now()
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k)
  }, windowMs).unref()

  return (req, res, next) => {
    const now    = Date.now()
    const bucket = key(req) ?? 'unknown'
    let entry    = hits.get(bucket)
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs }
      hits.set(bucket, entry)
    }
    entry.count++
    res.set('RateLimit-Remaining', String(Math.max(0, max - entry.count)))
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)))
      return res.status(429).json({ error: message })
    }
    next()
  }
}
