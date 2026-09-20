// Foods are read once from server/data/foods.json and kept in memory.
import { readFileSync } from 'node:fs'

export const CATEGORIES = ['Fruits', 'Vegetables', 'Dairy', 'Pantry & Grains']

const foods = JSON.parse(readFileSync(new URL('../data/foods.json', import.meta.url), 'utf8'))

// The API exposes each food's slug as `id`, e.g. "banana".
function toPublic({ slug, ...rest }) {
  return { id: slug, ...rest }
}

export function listFoods({ search, category } = {}) {
  const text = search ? search.trim().toLowerCase() : ''
  return foods
    .filter((food) => !category || food.category === category)
    .filter((food) => !text || food.name.toLowerCase().includes(text))
    .map(toPublic)
}

export function findFood(slug) {
  const food = foods.find((item) => item.slug === slug)
  return food ? toPublic(food) : null
}
