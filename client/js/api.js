// Small wrapper around fetch for talking to the Express API.
// The login cookie is httpOnly, so this code never sees or handles a token.

export class ApiError extends Error {
  constructor(status, message, errors) {
    super(message)
    this.status = status
    this.errors = errors || {}
  }
}

async function request(method, url, body) {
  const options = { method, headers: {}, credentials: 'same-origin' }
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body)
  }

  let response
  try {
    response = await fetch(url, options)
  } catch {
    throw new ApiError(0, 'Could not reach the server. Please check your connection and try again.')
  }

  let data = null
  try {
    data = await response.json()
  } catch {
    // Response had no JSON body.
  }

  if (!response.ok) {
    throw new ApiError(response.status, (data && data.message) || 'Something went wrong.', data && data.errors)
  }
  return data
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  patch: (url, body) => request('PATCH', url, body),
  delete: (url) => request('DELETE', url),
}
