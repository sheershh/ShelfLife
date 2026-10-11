// Scan: one photo checked by the AI freshness scanner, kept as the user's scan history.
import mongoose from 'mongoose'

export const RIPENESS = ['unripe', 'ripe', 'overripe', 'spoiled', 'unknown']
export const RECOMMENDATIONS = ['eat', 'use-soon', 'cook-today', 'discard', 'unsure']
export const CONFIDENCE = ['low', 'medium', 'high']

const scanSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    item: { type: String, required: true, trim: true }, // what the model saw, e.g. "Banana"
    matchedFood: { type: String, default: null }, // slug of the matching library food, if any
    ripeness: { type: String, enum: RIPENESS, default: 'unknown' },
    freshnessScore: { type: Number, min: 0, max: 100 },
    mould: {
      detected: { type: Boolean, default: false },
      where: { type: String, default: '' },
    },
    visibleSigns: [String],
    estimatedDaysLeft: String,
    recommendation: { type: String, enum: RECOMMENDATIONS, default: 'unsure' },
    confidence: { type: String, enum: CONFIDENCE, default: 'low' },
    summary: String,
    // A small JPEG preview (data URL, about 160px wide) so the history list can show the photo.
    thumbnail: { type: String, maxlength: 60_000 },
  },
  { timestamps: true },
)

scanSchema.index({ createdAt: -1 })

export const Scan = mongoose.model('Scan', scanSchema)

export function toPublicScan(doc) {
  const scan = doc.toObject ? doc.toObject() : doc
  return {
    id: String(scan._id),
    item: scan.item,
    matchedFood: scan.matchedFood,
    ripeness: scan.ripeness,
    freshnessScore: scan.freshnessScore,
    mould: scan.mould,
    visibleSigns: scan.visibleSigns,
    estimatedDaysLeft: scan.estimatedDaysLeft,
    recommendation: scan.recommendation,
    confidence: scan.confidence,
    summary: scan.summary,
    thumbnail: scan.thumbnail,
    createdAt: scan.createdAt,
  }
}
