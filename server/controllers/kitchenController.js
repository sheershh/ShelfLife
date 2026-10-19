// Tools around the user's food: recipe ideas for what they have, reading a receipt, and looking up a barcode.
// The AI service is read from req.app.locals.ai, so tests can swap in a fake one.
import { findFood, findFoods, foodCatalog } from '../store/foodStore.js'
import { addBoughtFoods } from '../store/userStore.js'
import { AppError, isValidSlug, parseImageDataUrl } from '../utils/helpers.js'
import { defaultStorage } from '../utils/shelf.js'
import { withTracking } from './savedController.js'

const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024
const MAX_RECIPE_FOODS = 8
const MAX_BULK = 30
const BARCODE_TIMEOUT_MS = 8000

const cleanText = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

// POST /api/recipes   body: { foodIds?: ["spinach", ...] }  (default: the user's saved foods, soonest to expire first)
export async function suggestRecipes(req, res) {
  const requested = Array.isArray(req.body?.foodIds) ? req.body.foodIds : req.user.savedFoods
  if (!requested.every(isValidSlug)) throw new AppError(400, 'Invalid food id.')

  const foods = (await findFoods(requested.slice(0, 40)))
    .map((food) => withTracking(food, req.user))
    .sort((a, b) => (a.tracking?.daysLeft ?? Infinity) - (b.tracking?.daysLeft ?? Infinity))
    .slice(0, MAX_RECIPE_FOODS)
  if (foods.length === 0) throw new AppError(400, 'Pick at least one food to cook with.', { foodIds: 'Pick at least one food.' })

  const ai = req.app.locals.ai
  // Without an AI key we still help: the guide has usage ideas for every food.
  if (!ai.isConfigured()) {
    return res.json({
      source: 'guide',
      recipes: foods.map((food) => ({ title: food.name, minutes: null, uses: [food.name], steps: food.usageIdeas })),
    })
  }

  const { recipes } = await ai.suggestRecipes(foods.map((food) => ({ name: food.name, daysLeft: food.tracking?.daysLeft ?? null })))
  const clean = (Array.isArray(recipes) ? recipes : []).slice(0, 4).map((recipe) => ({
    title: cleanText(recipe.title, 80),
    minutes: Number.isFinite(recipe.minutes) ? Math.max(1, Math.min(240, Math.round(recipe.minutes))) : null,
    uses: (Array.isArray(recipe.uses) ? recipe.uses : []).slice(0, 8).map((name) => cleanText(name, 40)).filter(Boolean),
    steps: (Array.isArray(recipe.steps) ? recipe.steps : []).slice(0, 8).map((step) => cleanText(step, 240)).filter(Boolean),
  })).filter((recipe) => recipe.title && recipe.steps.length > 0)
  res.json({ source: 'ai', recipes: clean })
}

// POST /api/receipts   body: { image: "data:image/jpeg;base64,..." }  -> foods found on the receipt (nothing is saved yet)
export async function readReceipt(req, res) {
  const { mimeType, data } = parseImageDataUrl(req.body?.image, { maxBytes: MAX_IMAGE_BYTES })
  const catalog = await foodCatalog()
  const { items } = await req.app.locals.ai.readReceipt({ mimeType, data }, catalog)

  // Keep only lines that match a guide food, once each. Anything else is shown as "not in the guide".
  const seen = new Set()
  const found = []
  const unmatched = []
  for (const item of (Array.isArray(items) ? items : []).slice(0, 60)) {
    const food = catalog.find((entry) => entry.slug === item.matchedFoodId)
    if (food && !seen.has(food.slug)) {
      seen.add(food.slug)
      found.push({ foodId: food.slug, name: food.name, text: cleanText(item.text, 80) })
    } else if (!food) {
      unmatched.push(cleanText(item.text, 80))
    }
  }
  res.json({ found, unmatched: unmatched.filter(Boolean).slice(0, 20) })
}

// POST /api/saved/bulk   body: { foodIds: [...] }   saves foods as bought today (receipt, barcode)
export async function addBought(req, res) {
  const ids = req.body?.foodIds
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_BULK || !ids.every(isValidSlug)) {
    throw new AppError(400, `Send between 1 and ${MAX_BULK} food ids.`, { foodIds: `Send between 1 and ${MAX_BULK} food ids.` })
  }
  const foods = await findFoods([...new Set(ids)])
  if (foods.length === 0) throw new AppError(404, 'None of those foods are in the guide.')

  const savedIds = await addBoughtFoods(req.user._id, foods.map((food) => ({ foodId: food.id, storage: defaultStorage(food) })))
  res.json({ message: `${foods.length} ${foods.length === 1 ? 'food' : 'foods'} added to your fridge.`, savedIds })
}

// Open Food Facts is a free, open product database. Its product name is matched against our food names.
const PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product'

export async function lookupProduct(code) {
  let response
  try {
    response = await fetch(`${PRODUCT_URL}/${code}.json?fields=product_name,generic_name,brands,categories_tags`, {
      headers: { 'User-Agent': 'ShelfLife/1.0 (student project)' },
      signal: AbortSignal.timeout(BARCODE_TIMEOUT_MS),
    })
  } catch {
    throw new AppError(502, 'Could not reach the product database. Please try again.')
  }
  if (response.status === 404) return null
  if (!response.ok) throw new AppError(502, 'The product database had a problem. Please try again.')
  const body = await response.json().catch(() => null)
  return body?.status === 1 ? body.product : null
}

// The guide food whose name appears as a whole word in the product text (longest name wins, so "sweet potato" beats "potato").
export function matchProduct(product, catalog) {
  const words = (value) => ` ${String(value || '').toLowerCase().replace(/[^a-z]+/g, ' ').trim()} `
  const text = words([product.product_name, product.generic_name, ...(product.categories_tags || [])].join(' '))
  const hit = [...catalog]
    .sort((a, b) => b.name.length - a.name.length)
    .find((food) => text.includes(words(food.name)) || text.includes(words(`${food.name}s`)))
  return hit || null
}

// GET /api/barcode/:code
export async function barcode(req, res) {
  const code = req.params.code
  if (!/^\d{6,14}$/.test(code)) throw new AppError(400, 'A barcode is 6 to 14 digits.')

  const product = await (req.app.locals.lookupProduct || lookupProduct)(code)
  if (!product) return res.json({ found: false, product: null, food: null })

  const hit = matchProduct(product, await foodCatalog())
  res.json({
    found: true,
    product: { name: cleanText(product.product_name || product.generic_name, 100) || 'Unnamed product', brand: cleanText(product.brands, 60) },
    food: hit ? await findFood(hit.slug) : null,
  })
}
