import mongoose from 'mongoose'

export async function connectDB(uri) {
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Copy .env.example to .env and fill it in.')
  }
  // Give up after 8 seconds instead of hanging when the database is unreachable.
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 })
}

export async function disconnectDB() {
  await mongoose.disconnect()
}
