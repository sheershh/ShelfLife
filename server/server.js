import 'dotenv/config'
import { createApp } from './app.js'
import { connectDB } from './config/db.js'

const port = process.env.PORT || 3000

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET is missing or too short (use at least 32 characters). See .env.example.')
  process.exit(1)
}

try {
  await connectDB(process.env.MONGODB_URI)
  console.log('Connected to MongoDB.')
} catch (error) {
  console.error('Could not connect to MongoDB:', error.message)
  process.exit(1)
}

createApp().listen(port, () => {
  console.log(`ShelfLife running at http://localhost:${port}`)
})
