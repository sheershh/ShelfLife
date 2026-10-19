// The nutrition diary: log what was eaten, see a day's calories, carbs, fat and protein against goals,
// and the last seven days. Numbers for guide foods come from each food's own nutrition record and are
// copied onto the entry, so history never changes when a food is edited later.
import { findFood } from '../store/foodStore.js'
import { createEntry, deleteEntry, entriesForDay, setGoals, totalsForDates } from '../store/mealStore.js'
import { MEALS, toPublicEntry } from '../models/MealEntry.js'
import { DEFAULT_GOALS } from '../models/User.js'
import { AppError, isValidSlug } from '../utils/helpers.js'

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_GRAMS = 5000
const round1 = (value) => Math.round(value * 10) / 10

// A real calendar date written YYYY-MM-DD, from two years ago to tomorrow (tomorrow covers time zones ahead of the server).
function parseDate(value, field = 'date') {
  const valid = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  const time = valid ? Date.parse(`${value}T00:00:00Z`) : NaN
  if (!valid || Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value) {
    throw new AppError(400, 'Choose a valid date.', { [field]: 'Use the format YYYY-MM-DD.' })
  }
  if (time > Date.now() + DAY_MS || time < Date.now() - 2 * 365 * DAY_MS) {
    throw new AppError(400, 'That date is out of range.', { [field]: 'Choose a date from the last two years up to today.' })
  }
  return value
}

const goalsFor = (user) => {
  const own = user.goals?.toObject ? user.goals.toObject() : user.goals || {}
  return {
    calories: own.calories ?? DEFAULT_GOALS.calories,
    carbs: own.carbs ?? DEFAULT_GOALS.carbs,
    fat: own.fat ?? DEFAULT_GOALS.fat,
    protein: own.protein ?? DEFAULT_GOALS.protein,
  }
}

const sumOf = (entries) => {
  const total = entries.reduce(
    (sum, entry) => ({
      calories: sum.calories + entry.calories,
      carbs: sum.carbs + entry.carbs,
      fat: sum.fat + entry.fat,
      protein: sum.protein + entry.protein,
      fibre: sum.fibre + (entry.fibre || 0),
    }),
    { calories: 0, carbs: 0, fat: 0, protein: 0, fibre: 0 },
  )
  return { calories: Math.round(total.calories), carbs: round1(total.carbs), fat: round1(total.fat), protein: round1(total.protein), fibre: round1(total.fibre) }
}

// Numbers for `grams` of a food whose record gives values per 100 g.
export function scaleNutrition(per100g, grams) {
  const factor = grams / 100
  return {
    calories: Math.round((per100g.calories || 0) * factor),
    carbs: round1((per100g.carbs || 0) * factor),
    fat: round1((per100g.fat || 0) * factor),
    protein: round1((per100g.protein || 0) * factor),
    fibre: round1((per100g.fibre || 0) * factor),
  }
}

// A number the person typed: a plain number from 0 to `max`, or an error message for that field.
function amount(value, max, label, errors, key) {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  if (!Number.isFinite(number) || number < 0 || number > max) {
    errors[key] = `${label} must be a number from 0 to ${max}.`
    return 0
  }
  return number
}

// GET /api/nutrition/day?date=2026-10-19
export async function getDay(req, res) {
  const date = parseDate(req.query.date)
  const entries = (await entriesForDay(req.user._id, date)).map(toPublicEntry)
  res.json({
    date,
    goals: goalsFor(req.user),
    customGoals: Boolean(req.user.goals?.calories),
    entries,
    totals: sumOf(entries),
  })
}

// GET /api/nutrition/week?end=2026-10-19   the seven days ending on that date (days with nothing logged are zeros)
export async function getWeek(req, res) {
  const end = parseDate(req.query.end, 'end')
  const endTime = Date.parse(`${end}T00:00:00Z`)
  const dates = Array.from({ length: 7 }, (_, index) => new Date(endTime - (6 - index) * DAY_MS).toISOString().slice(0, 10))
  const logged = new Map((await totalsForDates(req.user._id, dates)).map((day) => [day.date, day]))

  const days = dates.map((date) => {
    const day = logged.get(date)
    return {
      date,
      logged: Boolean(day),
      calories: Math.round(day?.calories || 0),
      carbs: round1(day?.carbs || 0),
      fat: round1(day?.fat || 0),
      protein: round1(day?.protein || 0),
    }
  })
  const loggedDays = days.filter((day) => day.logged)
  const average = (key) => (loggedDays.length ? Math.round(loggedDays.reduce((sum, day) => sum + day[key], 0) / loggedDays.length) : 0)
  res.json({
    goals: goalsFor(req.user),
    days,
    averages: { loggedDays: loggedDays.length, calories: average('calories'), carbs: average('carbs'), fat: average('fat'), protein: average('protein') },
  })
}

// POST /api/nutrition/entries
//   guide food:   { date, meal, foodId, grams }
//   custom food:  { date, meal, name, calories, carbs, fat, protein }
export async function addEntry(req, res) {
  const body = req.body || {}
  const date = parseDate(body.date)
  if (!MEALS.includes(body.meal)) {
    throw new AppError(400, 'Choose a meal.', { meal: `Meal must be one of: ${MEALS.join(', ')}.` })
  }

  let data
  if (body.foodId !== undefined) {
    if (!isValidSlug(body.foodId)) throw new AppError(400, 'Invalid food id.')
    const food = await findFood(body.foodId)
    if (!food) throw new AppError(404, 'Food not found.')
    if (!food.nutrition?.per100g) throw new AppError(409, `${food.name} has no nutrition figures yet. Add it as a custom entry instead.`)

    const errors = {}
    const grams = amount(body.grams, MAX_GRAMS, 'Amount', errors, 'grams')
    if (!errors.grams && grams < 1) errors.grams = 'Enter an amount of at least 1 g.'
    if (Object.keys(errors).length > 0) throw new AppError(400, 'Please fix the highlighted fields.', errors)

    data = { foodId: food.id, name: food.name, image: food.image, grams: round1(grams), ...scaleNutrition(food.nutrition.per100g, grams) }
  } else {
    const errors = {}
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 60) errors.name = 'Give it a name (up to 60 characters).'
    const calories = amount(body.calories, 10000, 'Calories', errors, 'calories')
    const carbs = amount(body.carbs ?? 0, 2000, 'Carbs', errors, 'carbs')
    const fat = amount(body.fat ?? 0, 2000, 'Fat', errors, 'fat')
    const protein = amount(body.protein ?? 0, 2000, 'Protein', errors, 'protein')
    if (Object.keys(errors).length > 0) throw new AppError(400, 'Please fix the highlighted fields.', errors)

    data = { name, calories: Math.round(calories), carbs: round1(carbs), fat: round1(fat), protein: round1(protein), fibre: 0 }
  }

  const entry = await createEntry({ ...data, user: req.user._id, date, meal: body.meal })
  res.status(201).json({ entry: toPublicEntry(entry) })
}

// DELETE /api/nutrition/entries/:id
export async function removeEntry(req, res) {
  await deleteEntry(req.user._id, req.params.id)
  res.json({ message: 'Entry removed.' })
}

// PUT /api/nutrition/goals   body: { calories, carbs, fat, protein }
export async function updateGoals(req, res) {
  const body = req.body || {}
  const errors = {}
  const goals = {
    calories: Math.round(amount(body.calories, 10000, 'Calories', errors, 'calories')),
    carbs: Math.round(amount(body.carbs, 1500, 'Carbs', errors, 'carbs')),
    fat: Math.round(amount(body.fat, 600, 'Fat', errors, 'fat')),
    protein: Math.round(amount(body.protein, 600, 'Protein', errors, 'protein')),
  }
  if (!errors.calories && goals.calories < 500) errors.calories = 'Calories must be at least 500.'
  if (Object.keys(errors).length > 0) throw new AppError(400, 'Please fix the highlighted fields.', errors)

  res.json({ goals: await setGoals(req.user._id, goals) })
}
