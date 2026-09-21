import { AppError } from '../utils/helpers.js'

// Unknown /api routes get a JSON 404 instead of an HTML page.
export function apiNotFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` })
}

// Every error ends up here so the client always receives the same JSON shape.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ message: err.message, ...(err.errors && { errors: err.errors }) })
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Request body is not valid JSON.' })
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Request body is too large.' })
  }

  console.error(err)
  res.status(500).json({ message: 'Something went wrong on the server.' })
}
