// Entry point: check settings, connect to MongoDB, then start the web server.
import 'dotenv/config'
import { createApp } from './app.js'
import { connectDb } from './db.js'

const port = process.env.PORT || 3000

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET is missing or too short (use at least 32 characters). See .env.example.')
  process.exit(1)
}

try {
  await connectDb(process.env.MONGODB_URI)
} catch (error) {
  console.error(`Could not connect to MongoDB: ${error.message}`)
  process.exit(1)
}

if (!process.env.GEMINI_API_KEY) {
  console.warn('GEMINI_API_KEY is not set: the freshness scanner will show a "not set up" message.')
}

createApp().listen(port, () => {
  console.log(`ShelfLife running at http://localhost:${port}`)
})
