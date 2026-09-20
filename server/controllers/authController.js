import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import AppError from '../utils/AppError.js'
import { validateLogin, validateRegistration } from '../utils/validators.js'
import { clearAuthCookie, setAuthCookie } from '../middleware/auth.js'

const SALT_ROUNDS = 12

// Compared against when the email is unknown, so the response time does not reveal
// whether an account exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', SALT_ROUNDS)

// POST /api/auth/register
export async function register(req, res) {
  const errors = validateRegistration(req.body)
  if (Object.keys(errors).length > 0) throw new AppError(400, 'Please fix the highlighted fields.', errors)

  const email = req.body.email.trim().toLowerCase()
  if (await User.exists({ email })) {
    throw new AppError(409, 'An account with this email already exists.', {
      email: 'An account with this email already exists.',
    })
  }

  const passwordHash = await bcrypt.hash(req.body.password, SALT_ROUNDS)
  const user = await User.create({ name: req.body.name.trim(), email, passwordHash })

  setAuthCookie(res, user.id)
  res.status(201).json({ user: user.toPublic() })
}

// POST /api/auth/login
export async function login(req, res) {
  const errors = validateLogin(req.body)
  if (Object.keys(errors).length > 0) throw new AppError(400, 'Please fix the highlighted fields.', errors)

  const email = req.body.email.trim().toLowerCase()
  const user = await User.findOne({ email }).select('+passwordHash')
  const passwordMatches = await bcrypt.compare(req.body.password, user ? user.passwordHash : DUMMY_HASH)

  // Same message for a wrong email and a wrong password.
  if (!user || !passwordMatches) throw new AppError(401, 'Invalid email or password.')

  setAuthCookie(res, user.id)
  res.json({ user: user.toPublic() })
}

// POST /api/auth/logout
export function logout(req, res) {
  clearAuthCookie(res)
  res.json({ message: 'Logged out.' })
}

// GET /api/auth/me  (returns { user: null } for visitors who are not logged in)
export function me(req, res) {
  res.json({ user: req.user ? req.user.toPublic() : null })
}
