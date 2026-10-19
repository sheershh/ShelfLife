// MealEntry: one thing a person ate, for the nutrition diary.
// The nutrition numbers are copied onto the entry when it is logged, so an old diary day never changes
// if a food's figures are edited later or the food is deleted.
import mongoose from 'mongoose'

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack']

const mealEntrySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // The person's own calendar day as YYYY-MM-DD, so "today" is the same day they see on their clock.
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    meal: { type: String, enum: MEALS, required: true },
    foodId: { type: String, default: null }, // slug of a guide food, or null for a custom entry
    name: { type: String, required: true, trim: true, maxlength: 60 },
    image: { type: String, default: null },
    grams: { type: Number, min: 0, max: 5000, default: null }, // null for custom entries
    calories: { type: Number, required: true, min: 0, max: 10000 },
    carbs: { type: Number, required: true, min: 0, max: 2000 },
    fat: { type: Number, required: true, min: 0, max: 2000 },
    protein: { type: Number, required: true, min: 0, max: 2000 },
    fibre: { type: Number, min: 0, max: 2000, default: 0 },
  },
  { timestamps: true },
)

mealEntrySchema.index({ user: 1, date: 1 })

export const MealEntry = mongoose.model('MealEntry', mealEntrySchema)

export function toPublicEntry(doc) {
  const entry = doc.toObject ? doc.toObject() : doc
  return {
    id: String(entry._id),
    date: entry.date,
    meal: entry.meal,
    foodId: entry.foodId,
    name: entry.name,
    image: entry.image,
    grams: entry.grams,
    calories: entry.calories,
    carbs: entry.carbs,
    fat: entry.fat,
    protein: entry.protein,
    fibre: entry.fibre ?? 0,
  }
}
