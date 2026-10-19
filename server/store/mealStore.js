// Data access for the nutrition diary (MongoDB "mealentries" collection).
import mongoose from 'mongoose'
import { MealEntry } from '../models/MealEntry.js'
import { User } from '../models/User.js'
import { AppError } from '../utils/helpers.js'

export const createEntry = (data) => MealEntry.create(data)

export const entriesForDay = (userId, date) => MealEntry.find({ user: userId, date }).sort({ createdAt: 1 })

// Per-day totals for a run of dates: [{ date, calories, carbs, fat, protein }] (days with no entries are left out).
export function totalsForDates(userId, dates) {
  return MealEntry.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(String(userId)), date: { $in: dates } } },
    {
      $group: {
        _id: '$date',
        calories: { $sum: '$calories' },
        carbs: { $sum: '$carbs' },
        fat: { $sum: '$fat' },
        protein: { $sum: '$protein' },
      },
    },
    { $project: { _id: 0, date: '$_id', calories: 1, carbs: 1, fat: 1, protein: 1 } },
  ])
}

export async function deleteEntry(userId, entryId) {
  const result = mongoose.isValidObjectId(entryId)
    ? await MealEntry.deleteOne({ _id: entryId, user: userId }) // a person can only delete their own entries
    : { deletedCount: 0 }
  if (result.deletedCount === 0) throw new AppError(404, 'That entry was not found.')
}

export const deleteEntriesForUser = (userId) => MealEntry.deleteMany({ user: userId })

export async function setGoals(userId, goals) {
  const user = await User.findByIdAndUpdate(userId, { $set: { goals } }, { returnDocument: 'after', runValidators: true })
  return user.goals
}
