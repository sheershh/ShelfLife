import jwt from 'jsonwebtoken'
import { findUserById } from '../store/userStore.js'
import { AppError } from '../utils/helpers.js'

export const COOKIE_NAME = 'shelflife_token'
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export function setAuthCookie(res, userId) {
  const token = jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: '7d' })
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, // JavaScript in the page cannot read this cookie
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SEVEN_DAYS_MS,
  })
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })
}

// Finds the logged-in user from the cookie. Returns null for missing or invalid tokens.
async function findUserFromCookie(req) {
  const token = req.cookies?.[COOKIE_NAME]
  if (!token) return null
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    return findUserById(payload.sub)
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
