// Food: one entry in the ShelfLife library (e.g. "banana").
// The schema mirrors server/data/foods.json, which is used to seed the database.
import mongoose from 'mongoose'

export const CATEGORIES = ['Fruits', 'Vegetables', 'Dairy', 'Pantry & Grains']
export const STORAGE_LOCATIONS = ['Room Temperature', 'Refrigerator', 'Pantry']
export const FRESHNESS_STATUSES = ['Highly Perishable', 'Moderately Perishable', 'Longer Lasting']
export const SHELF_LIFE_CONDITIONS = ['roomTemperature', 'refrigerator', 'pantry', 'freezer']

const stageSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
  },
  { _id: false },
)

const foodSchema = new mongoose.Schema(
  {
    // The slug is the public id used in URLs (/food?id=banana). It never changes after creation.
    slug: { type: String, required: true, unique: true, immutable: true, match: /^[a-z0-9-]{1,40}$/ },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, enum: CATEGORIES },
    image: { type: String, required: true },
    shortDescription: { type: String, required: true, trim: true },
    storageLocation: { type: String, required: true, enum: STORAGE_LOCATIONS },
    storageMethod: { type: String, required: true, trim: true },
    shelfLifePreview: { type: String, required: true, trim: true },
    // Only the storage conditions that make sense for a food are filled in.
    shelfLife: {
      roomTemperature: String,
      refrigerator: String,
      pantry: String,
      freezer: String,
    },
    storageTips: [String],
    freshnessStatus: { type: String, required: true, enum: FRESHNESS_STATUSES },
    freshnessStages: [stageSchema],
    freshnessSigns: [String],
    spoilageSigns: [String],
    usageIdeas: [String],
  },
  { timestamps: true },
)

export const Food = mongoose.model('Food', foodSchema)

// The shape sent to the browser: the slug becomes `id`, database internals are dropped.
export function toPublicFood(doc) {
  if (!doc) return null
  const { _id, __v, slug, createdAt, updatedAt, ...rest } = doc.toObject ? doc.toObject() : doc
  return { id: slug, ...rest }
}
