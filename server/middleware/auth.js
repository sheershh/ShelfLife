// Login cookies and the middleware that checks them.
import jwt from 'jsonwebtoken'
import { findUserById } from '../store/userStore.js'
import { AppError } from '../utils/helpers.js'

export const COOKIE_NAME = 'shelflife_token'
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

// After login we put a signed token (JWT) holding the user's id into a cookie.
export function setAuthCookie(res, userId) {
  const token = jwt.sign({ sub: String(userId) }, process.env.JWT_SECRET, { expiresIn: '7d' })
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, // JavaScript in the page cannot read this cookie
    sameSite: 'lax', // not sent on cross-site form posts, which blocks most CSRF attacks
    secure: process.env.NODE_ENV === 'production', // HTTPS only when deployed
    maxAge: SEVEN_DAYS_MS,
  })
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })
}

// Finds the logged-in user from the cookie. Returns null for missing or invalid tokens.
// The user is looked up in the database on every request, so a deleted account or a removed
// admin role takes effect immediately rather than when the token expires.
async function findUserFromCookie(req) {
  const token = req.cookies?.[COOKIE_NAME]
  if (!token) return null
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    return await findUserById(payload.sub)
  } catch {
    return null
  }
}

// Adds req.user when logged in, but lets anonymous visitors through.
export async function optionalAuth(req, res, next) {
  req.user = await findUserFromCookie(req)
  next()
}

// Blocks the request unless a valid user is logged in.
export async function requireAuth(req, res, next) {
  req.user = await findUserFromCookie(req)
  if (!req.user) throw new AppError(401, 'Please log in to continue.')
  next()
}

// Blocks the request unless the logged-in user is an admin. Use after requireAuth.
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') throw new AppError(403, 'Admins only.')
  next()
}
