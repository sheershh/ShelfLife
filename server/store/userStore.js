// Users live in memory and are saved to a JSON file after every change.
// Each user: { id, name, email, passwordHash, savedFoods: ["banana", ...] }.
// This is simple and fine for a small project; a real database would suit many users better.
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { AppError } from '../utils/helpers.js'

let users = []
let filePath = null
let lastWrite = Promise.resolve()

// Reads the users file (if it exists). Call once before the server starts.
export async function loadUsers(file) {
  filePath = file
  users = []
  await mkdir(path.dirname(file), { recursive: true })

  let text
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return // first run: no users yet
    throw error
  }

  try {
    users = JSON.parse(text)
    if (!Array.isArray(users)) throw new Error('expected a list of users')
  } catch (error) {
    // Refuse to start rather than overwrite a damaged file and lose accounts.
    throw new Error(`Could not read ${file} (${error.message}). Fix or delete the file.`)
  }
}

// Writes the whole list to disk. Writes run one after another, and the file is replaced
// in one step so a crash cannot leave it half-written.
function save() {
  const json = JSON.stringify(users, null, 2)
  const write = lastWrite.catch(() => {}).then(async () => {
    const temp = `${filePath}.tmp`
    await writeFile(temp, json, { mode: 0o600 })
    await rename(temp, filePath)
  })
  lastWrite = write
  return write
}

// The safe shape to send to the browser (never includes the password hash).
export const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email })

export const findUserByEmail = (email) => users.find((user) => user.email === email) || null
export const findUserById = (id) => users.find((user) => user.id === id) || null

export async function createUser({ name, email, passwordHash }) {
  if (findUserByEmail(email)) {
    throw new AppError(409, 'An account with this email already exists.', {
      email: 'An account with this email already exists.',
    })
  }
  const user = { id: randomUUID(), name, email, passwordHash, savedFoods: [], createdAt: new Date().toISOString() }
  users.push(user)
  await save()
  return user
}

export async function addSavedFood(userId, slug) {
  const user = findUserById(userId)
  if (!user.savedFoods.includes(slug)) {
    user.savedFoods.push(slug)
    await save()
  }
  return [...user.savedFoods]
}

export async function removeSavedFood(userId, slug) {
  const user = findUserById(userId)
  if (user.savedFoods.includes(slug)) {
    user.savedFoods = user.savedFoods.filter((saved) => saved !== slug)
    await save()
  }
  return [...user.savedFoods]
}
