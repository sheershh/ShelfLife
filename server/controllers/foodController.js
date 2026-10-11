import { readFileSync } from 'node:fs'
import { CATEGORIES, findFood, listFoods as searchFoods } from '../store/foodStore.js'
import { AppError, isValidSlug, validateFoodQuery } from '../utils/helpers.js'

const recipes = JSON.parse(readFileSync(new URL('../data/recipes.json', import.meta.url), 'utf8'))

// GET /api/foods?search=ban&category=Fruits
export async function listFoods(req, res) {
  const errors = validateFoodQuery(req.query)
  if (Object.keys(errors).length > 0) throw new AppError(400, 'Invalid query.', errors)

  const foods = await searchFoods({ search: req.query.search, category: req.query.category })
  res.json({ count: foods.length, foods })
}

// GET /api/foods/:id  (the id is the food's slug, e.g. "banana")
export async function getFood(req, res) {
  if (!isValidSlug(req.params.id)) throw new AppError(400, 'Invalid food id.')

  const food = await findFood(req.params.id)
  if (!food) throw new AppError(404, 'Food not found.')

  res.json({ food })
}

// GET /api/meta  (fixed lists the frontend needs: categories and "use it up" recipe ideas)
export function getMeta(req, res) {
  res.json({ categories: CATEGORIES, recipes })
}
