// A small in-memory rate limiter (no extra package needed).
// Each limiter counts requests per visitor (IP address, or user id when logged in) in a fixed
// time window, and answers 429 Too Many Requests once the limit is reached.
// Note: counts live in this server's memory, so they reset on restart. That is fine for one server.
import { AppError } from '../utils/helpers.js'

export function rateLimit({ windowMs, max, message }) {
  const hits = new Map() // key -> { count, resetAt }

  // Forget old entries now and then so the map cannot grow forever.
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key)
  }, windowMs).unref()

  return function limiter(req, res, next) {
    const key = req.user ? `user:${req.user._id}` : `ip:${req.ip}`
    const now = Date.now()
    let entry = hits.get(key)
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs }
      hits.set(key, entry)
    }
    entry.count += 1

    res.set('RateLimit-Remaining', String(Math.max(0, max - entry.count)))
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)))
      throw new AppError(429, message || 'Too many requests. Please wait a moment and try again.')
    }
    next()
  }
}
