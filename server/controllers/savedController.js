import Food from '../models/Food.js'
import User from '../models/User.js'
import AppError from '../utils/AppError.js'
import { isValidSlug } from '../utils/validators.js'

// Every handler here runs after requireAuth, so req.user is always the logged-in user.

async function findFoodOr404(slug) {
  if (!isValidSlug(slug)) throw new AppError(400, 'Invalid food id.')
  const food = await Food.findOne({ slug })
  if (!food) throw new AppError(404, 'Food not found.')
  return food
}

// The user's saved food ids, e.g. ["banana", "milk"]
async function savedIds(userId) {
  const user = await User.findById(userId).populate('savedFoods', 'slug')
  return user.savedFoods.map((food) => food.slug)
}

// GET /api/saved
export async function listSaved(req, res) {
  const user = await User.findById(req.user.id).populate('savedFoods')
  res.json({ count: user.savedFoods.length, foods: user.savedFoods })
}

// POST /api/saved/:id  (saving the same food twice is harmless)
export async function addSaved(req, res) {
  const food = await findFoodOr404(req.params.id)
  await User.updateOne({ _id: req.user.id }, { $addToSet: { savedFoods: food._id } })
  res.json({ message: `${food.name} saved.`, savedIds: await savedIds(req.user.id) })
}

// DELETE /api/saved/:id
export async function removeSaved(req, res) {
  const food = await findFoodOr404(req.params.id)
  await User.updateOne({ _id: req.user.id }, { $pull: { savedFoods: food._id } })
  res.json({ message: `${food.name} removed.`, savedIds: await savedIds(req.user.id) })
}
