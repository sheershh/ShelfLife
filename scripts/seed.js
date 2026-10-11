// npm run seed
// Loads server/data/foods.json into MongoDB. Existing foods with the same slug are updated,
// foods added through the admin console are left alone. Safe to run more than once.
import 'dotenv/config'
import { connectDb, disconnectDb, readSeedFoods } from '../server/db.js'
import { Food } from '../server/models/Food.js'

await connectDb(process.env.MONGODB_URI)
const foods = readSeedFoods()
const result = await Food.bulkWrite(
  foods.map((food) => ({ updateOne: { filter: { slug: food.slug }, update: { $set: food }, upsert: true } })),
)
console.log(`Foods: ${result.upsertedCount} added, ${result.modifiedCount} updated, ${await Food.countDocuments()} in total.`)
await disconnectDb()
