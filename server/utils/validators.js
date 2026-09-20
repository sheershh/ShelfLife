import { CATEGORIES } from '../store/foodStore.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SLUG_PATTERN = /^[a-z0-9-]{1,40}$/

export const isValidSlug = (value) => typeof value === 'string' && SLUG_PATTERN.test(value)

export function validateRegistration({ name, email, password } = {}) {
  const errors = {}

  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 50) {
    errors.name = 'Name must be between 2 and 50 characters.'
  }
  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim()) || email.length > 254) {
    errors.email = 'Enter a valid email address.'
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    errors.password = 'Password must be between 8 and 72 characters.'
  } else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    errors.password = 'Password must contain at least one letter and one number.'
  }

  return errors
}

export function validateLogin({ email, password } = {}) {
  const errors = {}
  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
    errors.email = 'Enter a valid email address.'
  }
  if (typeof password !== 'string' || password.length === 0) {
    errors.password = 'Enter your password.'
  }
  return errors
}

export function validateFoodQuery({ search, category } = {}) {
  const errors = {}
  if (search !== undefined && (typeof search !== 'string' || search.length > 50)) {
    errors.search = 'Search must be text of 50 characters or fewer.'
  }
  if (category !== undefined && !CATEGORIES.includes(category)) {
    errors.category = `Category must be one of: ${CATEGORIES.join(', ')}.`
  }
  return errors
}
