// Turns the shelf-life text in the food records ("About 3–5 days once ripe") into a number of days,
// so the app can count down to a use-by date. It always takes the low end of a range: better to
// say "use it soon" a day early than a day late.

const UNIT_DAYS = { day: 1, week: 7, month: 30, year: 365 }
const STORAGE_FOR_LOCATION = { 'Room Temperature': 'roomTemperature', Refrigerator: 'refrigerator', Pantry: 'pantry' }
const DAY_MS = 24 * 60 * 60 * 1000

// "Dry: about 1 year · Cooked: 3–4 days in fridge" -> 365 (the first figure is the one for the food itself)
export function parseShelfDays(text) {
  const match = /(\d+(?:\.\d+)?)(?:\s*[–-]\s*\d+(?:\.\d+)?)?\s*(day|week|month|year)s?/i.exec(text || '')
  if (!match) return null
  return Math.max(1, Math.round(Number(match[1]) * UNIT_DAYS[match[2].toLowerCase()]))
}

// The storage conditions a food has a shelf-life figure for, e.g. ['roomTemperature', 'refrigerator', 'freezer'].
export const storageOptions = (food) =>
  Object.entries(food.shelfLife || {}).filter(([, text]) => text && parseShelfDays(text)).map(([key]) => key)

// Where the food is normally kept, as a shelf-life key.
export function defaultStorage(food) {
  const options = storageOptions(food)
  const preferred = STORAGE_FOR_LOCATION[food.storageLocation]
  return options.includes(preferred) ? preferred : options[0] || null
}

export const shelfDays = (food, storage) => parseShelfDays(food.shelfLife?.[storage])

// Midnight UTC of a date, so "days left" does not change with the time of day.
const startOfDay = (date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())

// The state the UI shows: fresh, soon (2 days or fewer), today (last day) or expired.
export function trackingFor(food, detail, now = new Date()) {
  const storage = detail?.storage || defaultStorage(food)
  const days = storage ? shelfDays(food, storage) : null
  if (!detail?.boughtOn || !days) return null

  const useBy = new Date(startOfDay(new Date(detail.boughtOn)) + days * DAY_MS)
  const daysLeft = Math.round((useBy.getTime() - startOfDay(now)) / DAY_MS)
  const state = daysLeft < 0 ? 'expired' : daysLeft === 0 ? 'today' : daysLeft <= 2 ? 'soon' : 'fresh'
  return {
    boughtOn: new Date(detail.boughtOn).toISOString().slice(0, 10),
    storage,
    shelfLifeDays: days,
    useBy: useBy.toISOString().slice(0, 10),
    daysLeft,
    state,
  }
}
