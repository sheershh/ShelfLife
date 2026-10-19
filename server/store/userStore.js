// Data access for user accounts and their saved foods (MongoDB "users" collection).
import mongoose from 'mongoose'
import { FOOD_LOG_LIMIT, User } from '../models/User.js'
import { AppError } from '../utils/helpers.js'

export { publicUser } from '../models/User.js'

const DUPLICATE_KEY = 11000 // MongoDB error code for a unique index violation

// Login is the only place that needs the password hash, so only it passes withPassword.
export function findUserByEmail(email, { withPassword = false } = {}) {
  const query = User.findOne({ email })
  return withPassword ? query.select('+passwordHash') : query
}

export async function findUserById(id) {
  if (!mongoose.isValidObjectId(id)) return null
  return User.findById(id)
}

export async function createUser({ name, email, passwordHash }) {
  try {
    return await User.create({ name, email, passwordHash })
  } catch (error) {
    // Two sign-ups with the same email at the same moment: the unique index catches the second.
    if (error.code === DUPLICATE_KEY) {
      throw new AppError(409, 'An account with this email already exists.', {
        email: 'An account with this email already exists.',
      })
    }
    throw error
  }
}

// $addToSet only adds the slug if it is not already there; $pull removes it.
// Both are single atomic updates, so two quick clicks cannot corrupt the list.
export async function addSavedFood(userId, slug) {
  const user = await User.findByIdAndUpdate(userId, { $addToSet: { savedFoods: slug } }, { returnDocument: 'after' })
  return user.savedFoods
}

export async function removeSavedFood(userId, slug) {
  const user = await User.findByIdAndUpdate(
    userId,
    { $pull: { savedFoods: slug, savedDetails: { foodId: slug } } },
    { returnDocument: 'after' },
  )
  return user.savedFoods
}

// Saves several foods at once (receipt or barcode), each with today as the purchase date.
// A food that is already tracked keeps its existing date.
export async function addBoughtFoods(userId, entries) {
  const user = await User.findById(userId)
  for (const { foodId, storage } of entries) {
    if (!user.savedFoods.includes(foodId)) user.savedFoods.push(foodId)
    if (storage && !user.savedDetails.some((detail) => detail.foodId === foodId)) {
      user.savedDetails.push({ foodId, boughtOn: new Date(), storage })
    }
  }
  await user.save()
  return user.savedFoods
}

// Records when a saved food was bought and where it is kept (one entry per food).
export async function setSavedDetail(userId, detail) {
  await User.updateOne({ _id: userId }, { $pull: { savedDetails: { foodId: detail.foodId } } })
  await User.updateOne({ _id: userId }, { $push: { savedDetails: detail } })
}

// "I used it" / "I threw it away": takes the food off the shelf and keeps a note for the stats.
// $slice keeps only the newest entries so the log cannot grow without limit.
export async function finishSavedFood(userId, food, outcome) {
  const entry = { foodId: food.id, name: food.name, outcome, at: new Date() }
  const user = await User.findByIdAndUpdate(
    userId,
    {
      $pull: { savedFoods: food.id, savedDetails: { foodId: food.id } },
      $push: { foodLog: { $each: [entry], $slice: -FOOD_LOG_LIMIT } },
    },
    { returnDocument: 'after' },
  )
  return user.savedFoods
}

// ----- Shopping list -----

export async function addShoppingItem(userId, item) {
  const user = await User.findByIdAndUpdate(userId, { $push: { shopping: item } }, { returnDocument: 'after', runValidators: true })
  return user.shopping
}

export async function removeShoppingItem(userId, itemId) {
  const user = await User.findByIdAndUpdate(userId, { $pull: { shopping: { _id: itemId } } }, { returnDocument: 'after' })
  return user.shopping
}

export async function clearShopping(userId) {
  await User.updateOne({ _id: userId }, { $set: { shopping: [] } })
}

// ----- Admin -----

export function listUsers() {
  return User.find().sort({ createdAt: -1 }).lean()
}

export async function setUserRole(id, role) {
  const user = mongoose.isValidObjectId(id)
    ? await User.findByIdAndUpdate(id, { role }, { returnDocument: 'after', runValidators: true })
    : null
  if (!user) throw new AppError(404, 'User not found.')
  return user
}

export async function deleteUser(id) {
  const result = mongoose.isValidObjectId(id) ? await User.deleteOne({ _id: id }) : { deletedCount: 0 }
  if (result.deletedCount === 0) throw new AppError(404, 'User not found.')
}

export const countUsers = () => User.countDocuments()
export const countAdmins = () => User.countDocuments({ role: 'admin' })

// How many users saved each food, most popular first: [{ slug, saves }].
export function savedFoodTotals() {
  return User.aggregate([
    { $unwind: '$savedFoods' },
    { $group: { _id: '$savedFoods', saves: { $sum: 1 } } },
    { $sort: { saves: -1, _id: 1 } },
    { $project: { _id: 0, slug: '$_id', saves: 1 } },
  ])
}
