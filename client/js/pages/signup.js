import { api, ApiError } from '../api.js'
import { EMAIL_PATTERN, safeNextUrl, showFieldErrors, showFormError } from '../auth-form.js'
import { initLayout } from '../layout.js'
import { session } from '../session.js'
import { applyDataStyles } from '../ui.js'

const form = document.getElementById('signup-form')

await initLayout()
applyDataStyles()
if (session.user) window.location.replace(safeNextUrl())

const next = new URLSearchParams(window.location.search).get('next')
if (next) document.getElementById('login-link').href = `/login?next=${encodeURIComponent(next)}`

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  const name = form.elements.name.value.trim()
  const email = form.elements.email.value.trim()
  const password = form.elements.password.value
  const confirm = form.elements.confirm.value

  // Quick checks in the browser; the server checks everything again.
  const errors = {}
  if (name.length < 2) errors.name = 'Enter your name (at least 2 characters).'
  if (!EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address.'
  if (password.length < 8) errors.password = 'Use at least 8 characters.'
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) errors.password = 'Include at least one letter and one number.'
  if (confirm !== password) errors.confirm = 'The passwords do not match.'
  showFieldErrors(form, errors)
  showFormError(form, '')
  if (Object.keys(errors).length > 0) return

  const button = form.querySelector('button[type="submit"]')
  button.disabled = true
  button.textContent = 'Creating account…'
  try {
    await api.post('/api/auth/register', { name, email, password })
    window.location.assign(safeNextUrl())
  } catch (error) {
    if (error instanceof ApiError && error.errors) showFieldErrors(form, error.errors)
    showFormError(form, error.status === 400 || error.status === 409 ? '' : error.message)
    button.disabled = false
    button.textContent = 'Create account'
  }
})
