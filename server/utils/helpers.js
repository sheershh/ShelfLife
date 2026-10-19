import { CATEGORIES, FRESHNESS_STATUSES, SHELF_LIFE_CONDITIONS, STORAGE_LOCATIONS } from '../models/Food.js'
import { ROLES } from '../models/User.js'

// An error that carries an HTTP status code and optional per-field messages.
export class AppError extends Error {
  constructor(status, message, errors) {
    super(message)
    this.status = status
    this.errors = errors
  }
}

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

export const FOOD_SORTS = ['name', 'shortest', 'longest']

export function validateFoodQuery({ search, category, storage, lasting, sort } = {}) {
  const errors = {}
  if (search !== undefined && (typeof search !== 'string' || search.length > 50)) {
    errors.search = 'Search must be text of 50 characters or fewer.'
  }
  if (category !== undefined && !CATEGORIES.includes(category)) {
    errors.category = `Category must be one of: ${CATEGORIES.join(', ')}.`
  }
  if (storage !== undefined && !STORAGE_LOCATIONS.includes(storage)) {
    errors.storage = `Storage must be one of: ${STORAGE_LOCATIONS.join(', ')}.`
  }
  if (lasting !== undefined && !FRESHNESS_STATUSES.includes(lasting)) {
    errors.lasting = `Keeps-for must be one of: ${FRESHNESS_STATUSES.join(', ')}.`
  }
  if (sort !== undefined && !FOOD_SORTS.includes(sort)) {
    errors.sort = `Sort must be one of: ${FOOD_SORTS.join(', ')}.`
  }
  return errors
}

// ----- Admin: food form -----

const isText = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max
const isTextList = (list, maxItems, maxLength) =>
  Array.isArray(list) && list.length <= maxItems && list.every((item) => isText(item, 1, maxLength))

// Checks a food sent by the admin form. `isNew` is true when creating (the slug is required then).
// Returns { errors, food } where `food` holds only the known fields, trimmed.
export function validateFood(body = {}, { isNew = false } = {}) {
  const errors = {}

  if (isNew && !isValidSlug(body.slug)) errors.slug = 'Use lowercase letters, numbers and hyphens (max 40).'
  if (!isText(body.name, 2, 60)) errors.name = 'Name must be between 2 and 60 characters.'
  if (!CATEGORIES.includes(body.category)) errors.category = 'Choose a category.'
  if (!STORAGE_LOCATIONS.includes(body.storageLocation)) errors.storageLocation = 'Choose a storage location.'
  if (!FRESHNESS_STATUSES.includes(body.freshnessStatus)) errors.freshnessStatus = 'Choose a freshness status.'
  if (typeof body.image !== 'string' || !/^\/images\/[a-z0-9/_-]+\.(jpe?g|png|webp|svg)$/i.test(body.image)) {
    errors.image = 'Image must be a path inside /images/, e.g. /images/banana.jpg.'
  }
  if (!isText(body.shortDescription, 10, 200)) errors.shortDescription = 'Write 10 to 200 characters.'
  if (!isText(body.storageMethod, 10, 600)) errors.storageMethod = 'Write 10 to 600 characters.'
  if (!isText(body.shelfLifePreview, 3, 60)) errors.shelfLifePreview = 'Write 3 to 60 characters.'

  const shelfLife = {}
  if (body.shelfLife && typeof body.shelfLife === 'object' && !Array.isArray(body.shelfLife)) {
    for (const condition of SHELF_LIFE_CONDITIONS) {
      const value = body.shelfLife[condition]
      if (value === undefined || value === null || value === '') continue
      if (!isText(value, 2, 200)) errors.shelfLife = 'Each shelf-life estimate must be 2 to 200 characters.'
      else shelfLife[condition] = value.trim()
    }
  }
  if (Object.keys(shelfLife).length === 0 && !errors.shelfLife) {
    errors.shelfLife = 'Give at least one shelf-life estimate.'
  }

  for (const field of ['storageTips', 'freshnessSigns', 'spoilageSigns', 'usageIdeas']) {
    if (!isTextList(body[field], 12, 300) || body[field].length === 0) {
      errors[field] = 'Add 1 to 12 lines, each up to 300 characters.'
    }
  }

  const stages = body.freshnessStages
  if (!Array.isArray(stages) || stages.length === 0 || stages.length > 8 ||
      !stages.every((stage) => stage && isText(stage.label, 2, 40) && isText(stage.description, 5, 300))) {
    errors.freshnessStages = 'Add 1 to 8 stages, each with a label and a description.'
  }

  if (Object.keys(errors).length > 0) return { errors }

  const trimList = (list) => list.map((item) => item.trim())
  const food = {
    name: body.name.trim(),
    category: body.category,
    image: body.image,
    shortDescription: body.shortDescription.trim(),
    storageLocation: body.storageLocation,
    storageMethod: body.storageMethod.trim(),
    shelfLifePreview: body.shelfLifePreview.trim(),
    shelfLife,
    storageTips: trimList(body.storageTips),
    freshnessStatus: body.freshnessStatus,
    freshnessStages: stages.map(({ label, description }) => ({ label: label.trim(), description: description.trim() })),
    freshnessSigns: trimList(body.freshnessSigns),
    spoilageSigns: trimList(body.spoilageSigns),
    usageIdeas: trimList(body.usageIdeas),
  }
  if (isNew) food.slug = body.slug
  return { errors, food }
}

export const isValidRole = (role) => ROLES.includes(role)

// ----- Images sent as data URLs ("data:image/jpeg;base64,....") -----

// The first bytes of each file type ("magic numbers"). We check them so a file that only
// *claims* to be an image in its data URL is rejected.
const IMAGE_SIGNATURES = {
  'image/jpeg': (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  'image/png': (bytes) => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (bytes) => bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
}

// Returns { mimeType, data (base64 text), bytes (Buffer) } or throws a 400 error.
export function parseImageDataUrl(dataUrl, { maxBytes, field = 'image' }) {
  const match = typeof dataUrl === 'string' && /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!match) throw new AppError(400, 'Please send a JPEG, PNG or WebP image.', { [field]: 'Unsupported image.' })

  const [, mimeType, data] = match
  const bytes = Buffer.from(data, 'base64')
  if (bytes.length > maxBytes) {
    throw new AppError(413, 'That image is too large.', { [field]: `Images must be under ${Math.round(maxBytes / 1024)} KB.` })
  }
  if (!IMAGE_SIGNATURES[mimeType](bytes)) {
    throw new AppError(400, 'That file is not a valid image.', { [field]: 'The file contents are not an image.' })
  }
  return { mimeType, data, bytes }
}
