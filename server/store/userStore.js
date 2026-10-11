// Data access for user accounts and their saved foods (MongoDB "users" collection).
import mongoose from 'mongoose'
import { User } from '../models/User.js'
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
  const user = await User.findByIdAndUpdate(userId, { $pull: { savedFoods: slug } }, { returnDocument: 'after' })
  return user.savedFoods
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
