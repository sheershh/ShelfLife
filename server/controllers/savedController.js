import { findFood } from '../store/foodStore.js'
import { addSavedFood, removeSavedFood } from '../store/userStore.js'
import { AppError, isValidSlug } from '../utils/helpers.js'

// Every handler here runs after requireAuth, so req.user is always the logged-in user.

function findFoodOr404(slug) {
  if (!isValidSlug(slug)) throw new AppError(400, 'Invalid food id.')
  const food = findFood(slug)
  if (!food) throw new AppError(404, 'Food not found.')
  return food
}

// GET /api/saved
export function listSaved(req, res) {
  const foods = req.user.savedFoods.map(findFood).filter(Boolean)
  res.json({ count: foods.length, foods })
}

// POST /api/saved/:id  (saving the same food twice is harmless)
export async function addSaved(req, res) {
  const food = findFoodOr404(req.params.id)
  const savedIds = await addSavedFood(req.user.id, food.id)
  res.json({ message: `${food.name} saved.`, savedIds })
}

// DELETE /api/saved/:id
export async function removeSaved(req, res) {
  const food = findFoodOr404(req.params.id)
  const savedIds = await removeSavedFood(req.user.id, food.id)
  res.json({ message: `${food.name} removed.`, savedIds })
}
