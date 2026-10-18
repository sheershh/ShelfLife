// npm run seed
// Loads server/data/foods.json into MongoDB. Existing foods with the same slug are updated,
// foods added through the admin console are left alone. Safe to run more than once.
import 'dotenv/config'
import { connectDb, disconnectDb, readSeedFoods } from '../server/db.js'
import { Food } from '../server/models/Food.js'
import { deleteFood } from '../server/store/foodStore.js'

// Foods that were taken out of the catalogue. They are deleted from the database (and from any
// user's saved list, exactly like an admin delete) so the guide matches foods.json.
// Scan history is never touched.
const RETIRED_FOODS = ['oats', 'chapati', 'poha']

await connectDb(process.env.MONGODB_URI)

for (const slug of RETIRED_FOODS) {
  if (await Food.exists({ slug })) {
    await deleteFood(slug)
    console.log(`Removed retired food: ${slug}`)
  }
}

const foods = readSeedFoods()
const result = await Food.bulkWrite(
  foods.map((food) => ({ updateOne: { filter: { slug: food.slug }, update: { $set: food }, upsert: true } })),
)
console.log(`Foods: ${result.upsertedCount} added, ${result.modifiedCount} updated, ${await Food.countDocuments()} in total.`)
await disconnectDb()
