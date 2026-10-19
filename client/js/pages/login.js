import { api, ApiError } from '../api.js'
import { EMAIL_PATTERN, safeNextUrl, showFieldErrors, showFormError } from '../auth-form.js'
import { initLayout } from '../layout.js'
import { session } from '../session.js'
import { applyDataStyles } from '../ui.js'

const form = document.getElementById('login-form')

// Why the visitor was sent here (e.g. they tried to save a food while logged out).
const reasons = {
  save: 'Log in to save foods to your shelf.',
  scan: 'Log in to use the freshness scanner. It keeps a history of your scans.',
  nutrition: 'Log in to keep your nutrition diary.',
  admin: 'Log in with an admin account to open the admin console.',
}

await initLayout()
applyDataStyles()
if (session.user) window.location.replace(safeNextUrl())

const params = new URLSearchParams(window.location.search)
const note = document.getElementById('login-note')
if (reasons[params.get('reason')]) {
  note.textContent = reasons[params.get('reason')]
  note.hidden = false
}
// Keep the "next" page when switching to sign up.
if (params.get('next')) document.getElementById('signup-link').href = `/signup?next=${encodeURIComponent(params.get('next'))}`

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  const email = form.elements.email.value.trim()
  const password = form.elements.password.value

  const errors = {}
  if (!EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address.'
  if (!password) errors.password = 'Enter your password.'
  showFieldErrors(form, errors)
  showFormError(form, '')
  if (Object.keys(errors).length > 0) return

  const button = form.querySelector('button[type="submit"]')
  button.disabled = true
  button.textContent = 'Logging in…'
  try {
    await api.post('/api/auth/login', { email, password })
    window.location.assign(safeNextUrl())
  } catch (error) {
    if (error instanceof ApiError && error.errors) showFieldErrors(form, error.errors)
    showFormError(form, error.message)
    button.disabled = false
    button.textContent = 'Log in'
  }
})
