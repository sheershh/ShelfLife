import mongoose from 'mongoose'

export const CATEGORIES = ['Fruits', 'Vegetables', 'Dairy', 'Pantry & Grains']
export const STORAGE_LOCATIONS = ['Refrigerator', 'Pantry', 'Room Temperature', 'Freezer']
export const FRESHNESS_STATUSES = ['Highly Perishable', 'Moderately Perishable', 'Longer Lasting']

const foodSchema = new mongoose.Schema(
  {
    // Short readable id used in URLs, e.g. "banana"
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    order: { type: Number, default: 0 },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, enum: CATEGORIES },
    image: { type: String, required: true },
    shortDescription: { type: String, required: true },
    storageLocation: { type: String, required: true, enum: STORAGE_LOCATIONS },
    storageMethod: { type: String, required: true },
    shelfLifePreview: { type: String, required: true },
    // Only the conditions that make sense for a food are filled in.
    shelfLife: {
      roomTemperature: String,
      refrigerator: String,
      pantry: String,
      freezer: String,
    },
    storageTips: [String],
    freshnessStatus: { type: String, required: true, enum: FRESHNESS_STATUSES },
    freshnessStages: [{ _id: false, label: String, description: String }],
    freshnessSigns: [String],
    spoilageSigns: [String],
    usageIdeas: [String],
  },
  {
    toJSON: {
      // The API exposes the slug as `id` and hides database internals.
      transform(doc, ret) {
        ret.id = ret.slug
        delete ret._id
        delete ret.__v
        delete ret.slug
        delete ret.order
        return ret
      },
    },
  },
)

export default mongoose.model('Food', foodSchema)
