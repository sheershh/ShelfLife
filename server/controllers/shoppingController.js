// The shopping list: free-text items or foods from the guide. Ticking one off as bought moves a
// guide food onto the user's shelves with today as the purchase date.
import mongoose from 'mongoose'
import { findFood } from '../store/foodStore.js'
import { addBoughtFoods, addShoppingItem, clearShopping, removeShoppingItem } from '../store/userStore.js'
import { AppError, isValidSlug } from '../utils/helpers.js'
import { defaultStorage } from '../utils/shelf.js'

const MAX_ITEMS = 100

const publicItem = (item) => ({ id: String(item._id), name: item.name, foodId: item.foodId })
const publicList = (items) => items.map(publicItem)

function findItemOr404(user, itemId) {
  const item = mongoose.isValidObjectId(itemId) ? user.shopping.find((entry) => String(entry._id) === itemId) : null
  if (!item) throw new AppError(404, 'That item is not on your list.')
  return item
}

// GET /api/shopping
export function listShopping(req, res) {
  res.json({ items: publicList(req.user.shopping) })
}

// POST /api/shopping   body: { foodId } for a guide food, or { name } for anything else
export async function addShopping(req, res) {
  if (req.user.shopping.length >= MAX_ITEMS) throw new AppError(400, `Your list is full (${MAX_ITEMS} items).`)

  let name
  let foodId = null
  if (req.body?.foodId !== undefined) {
    if (!isValidSlug(req.body.foodId)) throw new AppError(400, 'Invalid food id.')
    const food = await findFood(req.body.foodId)
    if (!food) throw new AppError(404, 'Food not found.')
    if (req.user.shopping.some((item) => item.foodId === food.id)) {
      return res.json({ items: publicList(req.user.shopping) }) // already on the list
    }
    ;({ name, id: foodId } = food)
  } else {
    name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    if (!name || name.length > 60) {
      throw new AppError(400, 'Type what you need (up to 60 characters).', { name: 'Type what you need (up to 60 characters).' })
    }
  }

  const items = await addShoppingItem(req.user._id, { name, foodId })
  res.status(201).json({ items: publicList(items) })
}

// POST /api/shopping/:itemId/bought   ticks the item off; a guide food lands on the shelves as bought today
export async function boughtShopping(req, res) {
  const item = findItemOr404(req.user, req.params.itemId)
  let savedIds = null
  if (item.foodId) {
    const food = await findFood(item.foodId)
    if (food) savedIds = await addBoughtFoods(req.user._id, [{ foodId: food.id, storage: defaultStorage(food) }])
  }
  const items = await removeShoppingItem(req.user._id, item._id)
  res.json({ items: publicList(items), savedIds })
}

// DELETE /api/shopping/:itemId
export async function removeShopping(req, res) {
  const item = findItemOr404(req.user, req.params.itemId)
  res.json({ items: publicList(await removeShoppingItem(req.user._id, item._id)) })
}

// DELETE /api/shopping
export async function clearShoppingList(req, res) {
  await clearShopping(req.user._id)
  res.json({ items: [] })
}
