// Data access for freshness scans (MongoDB "scans" collection).
import mongoose from 'mongoose'
import { Scan, toPublicScan } from '../models/Scan.js'
import { AppError } from '../utils/helpers.js'

export async function createScan(data) {
  return toPublicScan(await Scan.create(data))
}

export async function listScansForUser(userId, limit = 30) {
  const scans = await Scan.find({ user: userId }).sort({ createdAt: -1 }).limit(limit).lean()
  return scans.map(toPublicScan)
}

// A scan can only be read by the user who made it.
export async function findScanForUser(scanId, userId) {
  const scan = mongoose.isValidObjectId(scanId) ? await Scan.findOne({ _id: scanId, user: userId }).lean() : null
  if (!scan) throw new AppError(404, 'Scan not found.')
  return toPublicScan(scan)
}

export async function deleteScansForUser(userId) {
  await Scan.deleteMany({ user: userId })
}

// ----- Admin -----

export async function listRecentScans(limit = 50) {
  const scans = await Scan.find().sort({ createdAt: -1 }).limit(limit).populate('user', 'name email').lean()
  return scans.map((scan) => ({
    ...toPublicScan(scan),
    user: scan.user ? { name: scan.user.name, email: scan.user.email } : null,
  }))
}

export const countScans = () => Scan.countDocuments()

// Number of scans per recommendation, e.g. { eat: 4, discard: 1 }.
export async function scanTotalsByRecommendation() {
  const rows = await Scan.aggregate([{ $group: { _id: '$recommendation', count: { $sum: 1 } } }])
  return Object.fromEntries(rows.map((row) => [row._id, row.count]))
}

// Scans per day for the last `days` days: [{ day: '2026-10-11', count: 3 }].
export async function scansPerDay(days = 14) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return Scan.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, day: '$_id', count: 1 } },
  ])
}
