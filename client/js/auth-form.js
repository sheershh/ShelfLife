// Shared helpers for the login and signup forms.

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Shows or clears the error text under each field (matched by id: "<field>-error").
export function showFieldErrors(form, errors) {
  for (const field of form.querySelectorAll('.field')) {
    const input = field.querySelector('input')
    const message = field.querySelector('.field-error')
    const text = errors[input.name]
    message.textContent = text || ''
    message.hidden = !text
    input.setAttribute('aria-invalid', String(Boolean(text)))
  }
}

export function showFormError(form, text) {
  const box = form.querySelector('.form-error')
  box.textContent = text || ''
  box.hidden = !text
}

// Only allow redirects to pages on this site.
export function safeNextUrl() {
  const next = new URLSearchParams(window.location.search).get('next')
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}
