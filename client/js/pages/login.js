import { api, ApiError } from '../api.js'
import { EMAIL_PATTERN, safeNextUrl, showFieldErrors, showFormError } from '../auth-form.js'
import { initLayout } from '../layout.js'
import { session } from '../session.js'

const form = document.getElementById('login-form')

await initLayout()
if (session.user) window.location.replace('/')

if (new URLSearchParams(window.location.search).get('reason') === 'save') {
  document.getElementById('login-note').hidden = false
}

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
  try {
    await api.post('/api/auth/login', { email, password })
    window.location.assign(safeNextUrl())
  } catch (error) {
    if (error instanceof ApiError && error.errors) showFieldErrors(form, error.errors)
    showFormError(form, error.message)
    button.disabled = false
  }
})
