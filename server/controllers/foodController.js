import { findFood, listFoods as searchFoods } from '../store/foodStore.js'
import { AppError, isValidSlug, validateFoodQuery } from '../utils/helpers.js'

// GET /api/foods?search=ban&category=Fruits
export function listFoods(req, res) {
  const errors = validateFoodQuery(req.query)
  if (Object.keys(errors).length > 0) throw new AppError(400, 'Invalid query.', errors)

  const foods = searchFoods({ search: req.query.search, category: req.query.category })
  res.json({ count: foods.length, foods })
}

// GET /api/foods/:id  (the id is the food's slug, e.g. "banana")
export function getFood(req, res) {
  if (!isValidSlug(req.params.id)) throw new AppError(400, 'Invalid food id.')

  const food = findFood(req.params.id)
  if (!food) throw new AppError(404, 'Food not found.')

  res.json({ food })
}
