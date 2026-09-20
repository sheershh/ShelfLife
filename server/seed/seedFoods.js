import 'dotenv/config'
import { readFileSync } from 'node:fs'
import Food from '../models/Food.js'
import { connectDB, disconnectDB } from '../config/db.js'

const foods = JSON.parse(readFileSync(new URL('./foods.json', import.meta.url), 'utf8'))

// Inserts or updates each food by slug, so running the seed twice is safe.
export async function seedFoods() {
  const operations = foods.map((food, index) => ({
    updateOne: {
      filter: { slug: food.slug },
      update: { $set: { ...food, order: index } },
      upsert: true,
    },
  }))
  await Food.bulkWrite(operations)
  return foods.length
}

// Runs only when started with `npm run seed`, not when imported by tests.
if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    await connectDB(process.env.MONGODB_URI)
    const count = await seedFoods()
    console.log(`Seeded ${count} foods.`)
  } catch (error) {
    console.error('Seeding failed:', error.message)
    process.exitCode = 1
  } finally {
    await disconnectDB()
  }
}
