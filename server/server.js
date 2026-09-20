import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { loadUsers } from './store/userStore.js'

const port = process.env.PORT || 3000
const usersFile = process.env.USERS_FILE || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'users.json')

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET is missing or too short (use at least 32 characters). See .env.example.')
  process.exit(1)
}

try {
  await loadUsers(usersFile)
} catch (error) {
  console.error(error.message)
  process.exit(1)
}

createApp().listen(port, () => {
  console.log(`ShelfLife running at http://localhost:${port}`)
})
