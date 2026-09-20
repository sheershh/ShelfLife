// An error that carries an HTTP status code and optional per-field messages.
export default class AppError extends Error {
  constructor(status, message, errors) {
    super(message)
    this.status = status
    this.errors = errors
  }
}
