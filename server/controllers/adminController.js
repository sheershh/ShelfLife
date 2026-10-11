// Admin console API. Every route here runs after requireAuth + requireAdmin.
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  countFoods, createFood, deleteFood, findFood, listFoods, updateFood,
} from '../store/foodStore.js'
import {
  countScans, listRecentScans, scansPerDay, scanTotalsByRecommendation,
} from '../store/scanStore.js'
import {
  countAdmins, countUsers, deleteUser, listUsers, publicUser, savedFoodTotals, setUserRole,
} from '../store/userStore.js'
import { deleteScansForUser } from '../store/scanStore.js'
import { AppError, isValidRole, isValidSlug, parseImageDataUrl, validateFood } from '../utils/helpers.js'

const uploadDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'images', 'uploads')
const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

// GET /api/admin/stats
export async function getStats(req, res) {
  const [users, admins, foods, scans, byRecommendation, perDay, saved, allFoods] = await Promise.all([
    countUsers(), countAdmins(), countFoods(), countScans(), scanTotalsByRecommendation(), scansPerDay(14),
    savedFoodTotals(), listFoods(),
  ])
  const names = Object.fromEntries(allFoods.map((food) => [food.id, food.name]))
  res.json({
    totals: { users, admins, foods, scans, saves: saved.reduce((sum, row) => sum + row.saves, 0) },
    scansByRecommendation: byRecommendation,
    scansPerDay: perDay,
    mostSaved: saved.slice(0, 6).map((row) => ({ id: row.slug, name: names[row.slug] || row.slug, saves: row.saves })),
  })
}

// ----- Foods -----

function slugOr400(slug) {
  if (!isValidSlug(slug)) throw new AppError(400, 'Invalid food id.')
  return slug
}

// POST /api/admin/foods
export async function addFood(req, res) {
  const { errors, food } = validateFood(req.body, { isNew: true })
  if (!food) throw new AppError(400, 'Please fix the highlighted fields.', errors)
  res.status(201).json({ food: await createFood(food) })
}

// PUT /api/admin/foods/:id
export async function editFood(req, res) {
  const slug = slugOr400(req.params.id)
  const { errors, food } = validateFood(req.body)
  if (!food) throw new AppError(400, 'Please fix the highlighted fields.', errors)
  res.json({ food: await updateFood(slug, food) })
}

// DELETE /api/admin/foods/:id
export async function removeFood(req, res) {
  const slug = slugOr400(req.params.id)
  const food = await findFood(slug)
  if (!food) throw new AppError(404, 'Food not found.')
  await deleteFood(slug)
  res.json({ message: `${food.name} deleted.` })
}

// POST /api/admin/images   body: { image: "data:image/jpeg;base64,..." }  -> { path: "/images/uploads/....jpg" }
// The file name is made by the server (random), never taken from the user, so no path tricks are possible.
export async function uploadImage(req, res) {
  const image = parseImageDataUrl(req.body?.image, { maxBytes: 1.5 * 1024 * 1024 })
  const fileName = `${randomUUID()}.${EXTENSIONS[image.mimeType]}`
  await writeFile(path.join(uploadDir, fileName), image.bytes)
  res.status(201).json({ path: `/images/uploads/${fileName}` })
}

// ----- Users -----

// GET /api/admin/users
export async function getUsers(req, res) {
  const users = await listUsers()
  res.json({
    count: users.length,
    users: users.map((user) => ({ ...publicUser(user), savedCount: user.savedFoods.length, createdAt: user.createdAt })),
  })
}

// PATCH /api/admin/users/:id   body: { role: "admin" | "user" }
export async function changeRole(req, res) {
  if (!isValidRole(req.body?.role)) throw new AppError(400, 'Role must be "user" or "admin".')
  if (String(req.user._id) === req.params.id && req.body.role !== 'admin') {
    throw new AppError(400, 'You cannot remove your own admin role.')
  }
  const user = await setUserRole(req.params.id, req.body.role)
  res.json({ user: publicUser(user) })
}

// DELETE /api/admin/users/:id   (also deletes that user's scans)
export async function removeUser(req, res) {
  if (String(req.user._id) === req.params.id) throw new AppError(400, 'You cannot delete your own account here.')
  await deleteUser(req.params.id)
  await deleteScansForUser(req.params.id)
  res.json({ message: 'User deleted.' })
}

// ----- Scans -----

// GET /api/admin/scans
export async function getScans(req, res) {
  const scans = await listRecentScans(50)
  res.json({ count: scans.length, scans })
}
