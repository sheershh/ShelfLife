import Food from '../models/Food.js'
import AppError from '../utils/AppError.js'
import { isValidSlug, validateFoodQuery } from '../utils/validators.js'

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// GET /api/foods?search=ban&category=Fruits
export async function listFoods(req, res) {
  const errors = validateFoodQuery(req.query)
  if (Object.keys(errors).length > 0) throw new AppError(400, 'Invalid query.', errors)

  const { search, category } = req.query
  const filter = {}
  if (category) filter.category = category
  if (search && search.trim()) filter.name = { $regex: escapeRegex(search.trim()), $options: 'i' }

  const foods = await Food.find(filter).sort({ order: 1 })
  res.json({ count: foods.length, foods })
}

// GET /api/foods/:id  (the id is the food's slug, e.g. "banana")
export async function getFood(req, res) {
  if (!isValidSlug(req.params.id)) throw new AppError(400, 'Invalid food id.')

  const food = await Food.findOne({ slug: req.params.id })
  if (!food) throw new AppError(404, 'Food not found.')

  res.json({ food })
}
