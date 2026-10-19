import { findFood, findFoods } from '../store/foodStore.js'
import {
  addSavedFood, finishSavedFood, removeSavedFood, setSavedDetail,
} from '../store/userStore.js'
import { OUTCOMES } from '../models/User.js'
import { AppError, isValidSlug } from '../utils/helpers.js'
import { defaultStorage, storageOptions, trackingFor } from '../utils/shelf.js'

// Every handler here runs after requireAuth, so req.user is always the logged-in user.

const DAY_MS = 24 * 60 * 60 * 1000
const INSIGHT_DAYS = 30

async function findFoodOr404(slug) {
  if (!isValidSlug(slug)) throw new AppError(400, 'Invalid food id.')
  const food = await findFood(slug)
  if (!food) throw new AppError(404, 'Food not found.')
  return food
}

// A saved food plus its use-by countdown (null until the user says when they bought it).
// `storageOptions` are the conditions the guide has a figure for, so the page can offer them.
export function withTracking(food, user) {
  const detail = user.savedDetails.find((item) => item.foodId === food.id)
  return {
    ...food,
    tracking: trackingFor(food, detail),
    storageOptions: storageOptions(food),
    defaultStorage: defaultStorage(food),
  }
}

// GET /api/saved
export async function listSaved(req, res) {
  const foods = (await findFoods(req.user.savedFoods)).map((food) => withTracking(food, req.user))
  res.json({ count: foods.length, foods })
}

// POST /api/saved/:id  (saving the same food twice is harmless)
export async function addSaved(req, res) {
  const food = await findFoodOr404(req.params.id)
  const savedIds = await addSavedFood(req.user._id, food.id)
  res.json({ message: `${food.name} saved.`, savedIds })
}

// DELETE /api/saved/:id
export async function removeSaved(req, res) {
  const food = await findFoodOr404(req.params.id)
  const savedIds = await removeSavedFood(req.user._id, food.id)
  res.json({ message: `${food.name} removed.`, savedIds })
}

// PATCH /api/saved/:id   body: { boughtOn: "2026-10-14", storage: "refrigerator" }
// Starts (or restarts) the use-by countdown for a saved food.
export async function updateSaved(req, res) {
  const food = await findFoodOr404(req.params.id)
  if (!req.user.savedFoods.includes(food.id)) throw new AppError(409, 'Save this food first.')

  const { boughtOn, storage = defaultStorage(food) } = req.body || {}
  const errors = {}
  const date = typeof boughtOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(boughtOn) ? new Date(`${boughtOn}T00:00:00Z`) : null
  if (!date || Number.isNaN(date.getTime())) errors.boughtOn = 'Choose the date you bought it.'
  else if (date.getTime() > Date.now() + DAY_MS) errors.boughtOn = 'The purchase date cannot be in the future.'
  else if (date.getTime() < Date.now() - 2 * 365 * DAY_MS) errors.boughtOn = 'That date is too long ago.'
  if (!storageOptions(food).includes(storage)) errors.storage = `${food.name} has no shelf-life figure for that storage.`
  if (Object.keys(errors).length > 0) throw new AppError(400, 'Please fix the highlighted fields.', errors)

  await setSavedDetail(req.user._id, { foodId: food.id, boughtOn: date, storage })
  req.user.savedDetails = [...req.user.savedDetails.filter((item) => item.foodId !== food.id), { foodId: food.id, boughtOn: date, storage }]
  res.json({ food: withTracking(food, req.user) })
}

// POST /api/saved/:id/finish   body: { outcome: "used" | "wasted" }
export async function finishSaved(req, res) {
  const food = await findFoodOr404(req.params.id)
  const outcome = req.body?.outcome
  if (!OUTCOMES.includes(outcome)) {
    throw new AppError(400, 'Say whether you used it or threw it away.', { outcome: `Must be one of: ${OUTCOMES.join(', ')}.` })
  }
  if (!req.user.savedFoods.includes(food.id)) throw new AppError(409, 'This food is not in your saved foods.')

  const savedIds = await finishSavedFood(req.user._id, food, outcome)
  res.json({ message: outcome === 'used' ? `Nice, ${food.name} used.` : `${food.name} thrown away.`, savedIds })
}

// GET /api/insights   the last 30 days of used / wasted foods, plus what needs using up now
export async function getInsights(req, res) {
  const since = Date.now() - INSIGHT_DAYS * DAY_MS
  const recent = req.user.foodLog.filter((entry) => entry.at.getTime() >= since)
  const count = (outcome) => recent.filter((entry) => entry.outcome === outcome).length

  const wastedByFood = new Map()
  for (const entry of recent.filter((item) => item.outcome === 'wasted')) {
    wastedByFood.set(entry.foodId, { foodId: entry.foodId, name: entry.name, times: (wastedByFood.get(entry.foodId)?.times || 0) + 1 })
  }

  const used = count('used')
  const wasted = count('wasted')
  const foods = (await findFoods(req.user.savedFoods)).map((food) => withTracking(food, req.user))
  res.json({
    days: INSIGHT_DAYS,
    used,
    wasted,
    usedShare: used + wasted === 0 ? null : Math.round((used / (used + wasted)) * 100),
    mostWasted: [...wastedByFood.values()].sort((a, b) => b.times - a.times).slice(0, 3),
    useSoon: foods
      .filter((food) => food.tracking && food.tracking.state !== 'fresh')
      .sort((a, b) => a.tracking.daysLeft - b.tracking.daysLeft)
      .map((food) => ({ id: food.id, name: food.name, image: food.image, ...food.tracking })),
    tracked: foods.filter((food) => food.tracking).length,
  })
}
