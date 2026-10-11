// Connects Mongoose to MongoDB and makes sure the food library is seeded.
import { readFileSync } from 'node:fs'
import mongoose from 'mongoose'
import { Food } from './models/Food.js'

// Security: strip keys that start with "$" from query filters, so a request body such as
// { "email": { "$gt": "" } } can never turn into a MongoDB operator (NoSQL injection).
mongoose.set('sanitizeFilter', true)
mongoose.set('strictQuery', true)

let memoryServer = null

export async function connectDb(uri) {
  if (!uri) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MONGODB_URI is missing. Add your MongoDB Atlas connection string to .env.')
    }
    // Development fallback: a temporary MongoDB in memory (dev dependency). Data is lost on restart.
    const { MongoMemoryServer } = await import('mongodb-memory-server')
    memoryServer = await MongoMemoryServer.create()
    uri = memoryServer.getUri('shelflife')
    console.warn('MONGODB_URI is not set: using a temporary in-memory database. Accounts will not be kept.')
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 })
  await mongoose.connection.syncIndexes()
  await seedFoodsIfEmpty()
}

export async function disconnectDb() {
  await mongoose.disconnect()
  if (memoryServer) await memoryServer.stop()
  memoryServer = null
}

export function readSeedFoods() {
  return JSON.parse(readFileSync(new URL('./data/foods.json', import.meta.url), 'utf8'))
}

// On a brand-new database, load the 12 starter foods from foods.json.
async function seedFoodsIfEmpty() {
  if ((await Food.estimatedDocumentCount()) > 0) return
  await Food.insertMany(readSeedFoods())
  console.log('Seeded the food library from server/data/foods.json')
}
