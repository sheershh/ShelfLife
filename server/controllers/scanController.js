// The AI freshness scanner: analyse a photo, keep a history, and answer follow-up questions.
// The AI service is read from req.app.locals.ai (set in app.js), so tests can swap in a fake one.
import { findFood, foodCatalog, listFoods } from '../store/foodStore.js'
import { createScan, deleteScansForUser, findScanForUser, listScansForUser } from '../store/scanStore.js'
import { CONFIDENCE, RECOMMENDATIONS, RIPENESS } from '../models/Scan.js'
import { AppError, parseImageDataUrl } from '../utils/helpers.js'

const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024 // the browser shrinks photos first, so real uploads are ~150 KB
const MAX_THUMBNAIL_BYTES = 40 * 1024
const MAX_MESSAGE = 500
const MAX_HISTORY_TURNS = 10

const SOFT_CATEGORIES = ['Fruits', 'Vegetables', 'Dairy', 'Pantry & Grains']

const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback)
const cleanText = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

// Never trust AI output blindly: keep only known values, clamp numbers, cut long text,
// then apply our own safety rule on top of the model's opinion.
// Exported so scripts/evaluate-scanner.js measures exactly what users see.
export function normaliseVerdict(raw, catalog, matchedCategory) {
  const verdict = {
    item: cleanText(raw.item, 60) || 'Unknown',
    matchedFood: catalog.some((food) => food.slug === raw.matchedFoodId) ? raw.matchedFoodId : null,
    ripeness: pick(raw.ripeness, RIPENESS, 'unknown'),
    freshnessScore: Math.max(0, Math.min(100, Math.round(Number(raw.freshnessScore) || 0))),
    mould: { detected: raw.mould?.detected === true, where: cleanText(raw.mould?.where, 160) },
    visibleSigns: (Array.isArray(raw.visibleSigns) ? raw.visibleSigns : []).slice(0, 5).map((s) => cleanText(s, 140)).filter(Boolean),
    estimatedDaysLeft: cleanText(raw.estimatedDaysLeft, 80),
    recommendation: pick(raw.recommendation, RECOMMENDATIONS, 'unsure'),
    confidence: pick(raw.confidence, CONFIDENCE, 'low'),
    summary: cleanText(raw.summary, 400),
  }

  // Safety rule (ours, not the model's): visible mould on soft food means discard.
  const soft = !matchedCategory || SOFT_CATEGORIES.includes(matchedCategory)
  if (verdict.mould.detected && soft) {
    verdict.recommendation = 'discard'
    verdict.freshnessScore = Math.min(verdict.freshnessScore, 15)
  }
  if (verdict.ripeness === 'spoiled') verdict.recommendation = 'discard'
  return verdict
}

// POST /api/scans   body: { image: "data:image/jpeg;base64,...", thumbnail: "data:image/jpeg;base64,..." }
export async function createScanFromPhoto(req, res) {
  const image = parseImageDataUrl(req.body?.image, { maxBytes: MAX_IMAGE_BYTES })
  const thumbnail = req.body?.thumbnail
    ? parseImageDataUrl(req.body.thumbnail, { maxBytes: MAX_THUMBNAIL_BYTES, field: 'thumbnail' })
    : null

  const catalog = await foodCatalog()
  const raw = await req.app.locals.ai.analyseImage({ mimeType: image.mimeType, data: image.data }, catalog)

  if (raw.isFood !== true) {
    return res.json({
      scan: null,
      food: null,
      message: cleanText(raw.summary, 300) || "This photo doesn't seem to show food. Try a closer, well-lit photo of one item.",
    })
  }

  const matched = catalog.find((food) => food.slug === raw.matchedFoodId)
  const verdict = normaliseVerdict(raw, catalog, matched?.category)
  const scan = await createScan({
    ...verdict,
    user: req.user._id,
    thumbnail: thumbnail ? req.body.thumbnail : undefined,
  })

  // Grounding: the matching ShelfLife record supplies the storage advice shown with the verdict.
  const food = verdict.matchedFood ? await findFood(verdict.matchedFood) : null
  res.status(201).json({ scan, food })
}

// GET /api/scans   (the logged-in user's recent scans, newest first)
export async function listMyScans(req, res) {
  const scans = await listScansForUser(req.user._id)
  res.json({ count: scans.length, scans })
}

// DELETE /api/scans   (clears the user's scan history)
export async function clearMyScans(req, res) {
  await deleteScansForUser(req.user._id)
  res.json({ message: 'Scan history cleared.' })
}

// Builds the text block of facts the assistant must use (our records, not the model's memory).
async function buildContext(message, scan) {
  const parts = []
  if (scan) {
    const { thumbnail, ...facts } = scan
    parts.push(`The user's latest photo scan (from the ShelfLife scanner):\n${JSON.stringify(facts)}`)
  }

  // Simple retrieval: include the record of every food named in the question or the scan.
  const text = `${message} ${scan?.item || ''}`.toLowerCase()
  const foods = (await listFoods()).filter(
    (food) => food.id === scan?.matchedFood || text.includes(food.name.toLowerCase()),
  )
  for (const food of foods.slice(0, 3)) {
    const { image, ...record } = food
    parts.push(`ShelfLife record for ${food.name}:\n${JSON.stringify(record)}`)
  }

  if (parts.length === 0) parts.push('No specific ShelfLife record matches this question.')
  return parts.join('\n\n')
}

// POST /api/assistant   body: { message, history: [{ role, text }], scanId? }
export async function askAssistant(req, res) {
  const message = cleanText(req.body?.message, MAX_MESSAGE)
  if (!message) throw new AppError(400, 'Type a question first.', { message: 'Type a question first.' })

  const history = (Array.isArray(req.body?.history) ? req.body.history : [])
    .filter((turn) => turn && ['user', 'assistant'].includes(turn.role) && typeof turn.text === 'string')
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => ({ role: turn.role, text: turn.text.slice(0, 1500) }))

  const scan = req.body?.scanId ? await findScanForUser(String(req.body.scanId), req.user._id) : null
  const context = await buildContext(message, scan)

  const reply = await req.app.locals.ai.chat({ history, message, context })
  res.json({ reply })
}
