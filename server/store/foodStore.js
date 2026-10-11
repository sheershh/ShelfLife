// Data access for foods. Controllers call these functions and never touch Mongoose directly,
// so the rest of the app does not care where foods are stored.
import mongoose from 'mongoose'
import { Food, toPublicFood } from '../models/Food.js'
import { User } from '../models/User.js'
import { AppError } from '../utils/helpers.js'

export { CATEGORIES } from '../models/Food.js'

// Turns user text into a safe regular expression (so "a.b" or "(" match literally).
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Foods come back in the order they were added (MongoDB ObjectIds increase over time).
export async function listFoods({ search, category } = {}) {
  const filter = {}
  if (category) filter.category = category
  const text = search ? search.trim() : ''
  if (text) filter.name = new RegExp(escapeRegex(text), 'i') // case-insensitive "contains"

  const foods = await Food.find(filter).sort({ _id: 1 }).lean()
  return foods.map(toPublicFood)
}

export async function findFood(slug) {
  return toPublicFood(await Food.findOne({ slug }).lean())
}

export async function findFoods(slugs) {
  // mongoose.trusted() marks this $in as written by us, so sanitizeFilter (see db.js) keeps it.
  const foods = await Food.find({ slug: mongoose.trusted({ $in: slugs }) }).lean()
  // Keep the order of the given slugs (e.g. the order the user saved them in).
  return slugs.map((slug) => foods.find((food) => food.slug === slug)).filter(Boolean).map(toPublicFood)
}

// A compact list for the AI prompt, so the model can match a photo to one of our foods.
export async function foodCatalog() {
  return Food.find({}, { slug: 1, name: 1, category: 1, _id: 0 }).sort({ _id: 1 }).lean()
}

// ----- Admin -----

export async function createFood(data) {
  if (await Food.exists({ slug: data.slug })) {
    throw new AppError(409, 'A food with this id already exists.', { slug: 'This id is already used.' })
  }
  return toPublicFood(await Food.create(data))
}

export async function updateFood(slug, data) {
  const { slug: _ignored, ...changes } = data // the slug is permanent
  const food = await Food.findOneAndUpdate({ slug }, changes, { returnDocument: 'after', runValidators: true }).lean()
  if (!food) throw new AppError(404, 'Food not found.')
  return toPublicFood(food)
}

// Deleting a food also removes it from every user's saved list.
export async function deleteFood(slug) {
  const result = await Food.deleteOne({ slug })
  if (result.deletedCount === 0) throw new AppError(404, 'Food not found.')
  await User.updateMany({ savedFoods: slug }, { $pull: { savedFoods: slug } })
}

export const countFoods = () => Food.countDocuments()
