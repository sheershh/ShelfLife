import { Router } from 'express'
import * as admin from '../controllers/adminController.js'
import { login, logout, me, register } from '../controllers/authController.js'
import { getFood, getMeta, listFoods } from '../controllers/foodController.js'
import { addSaved, listSaved, removeSaved } from '../controllers/savedController.js'
import { askAssistant, clearMyScans, createScanFromPhoto, listMyScans } from '../controllers/scanController.js'
import { optionalAuth, requireAdmin, requireAuth } from '../middleware/auth.js'
import { rateLimit } from '../middleware/rateLimit.js'

const MINUTE = 60 * 1000

// All API routes in one place. app.js mounts this router at /api.
// `limits` lets tests raise the rate limits; normal runs use the defaults below.
export function createRouter(limits = {}) {
  const router = Router()

  // Rate limits protect against password guessing and against using up the free AI quota.
  const authLimit = rateLimit({ windowMs: 15 * MINUTE, max: limits.auth ?? 20,
    message: 'Too many attempts. Please wait 15 minutes and try again.' })
  const aiLimit = rateLimit({ windowMs: MINUTE, max: limits.ai ?? 6,
    message: 'You are going a bit fast. Please wait a minute before the next scan or question.' })

  // Accounts
  router.post('/auth/register', authLimit, register)
  router.post('/auth/login', authLimit, login)
  router.post('/auth/logout', logout)
  router.get('/auth/me', optionalAuth, me)

  // Foods and fixed lists (open to everyone)
  router.get('/foods', listFoods)
  router.get('/foods/:id', getFood)
  router.get('/meta', getMeta)

  // Saved foods (login required)
  router.get('/saved', requireAuth, listSaved)
  router.post('/saved/:id', requireAuth, addSaved)
  router.delete('/saved/:id', requireAuth, removeSaved)

  // AI freshness scanner and assistant (login required, rate limited per user)
  router.post('/scans', requireAuth, aiLimit, createScanFromPhoto)
  router.get('/scans', requireAuth, listMyScans)
  router.delete('/scans', requireAuth, clearMyScans)
  router.post('/assistant', requireAuth, aiLimit, askAssistant)

  // Admin console (login + admin role required for everything below)
  router.use('/admin', requireAuth, requireAdmin)
  router.get('/admin/stats', admin.getStats)
  router.post('/admin/foods', admin.addFood)
  router.put('/admin/foods/:id', admin.editFood)
  router.delete('/admin/foods/:id', admin.removeFood)
  router.post('/admin/images', admin.uploadImage)
  router.get('/admin/users', admin.getUsers)
  router.patch('/admin/users/:id', admin.changeRole)
  router.delete('/admin/users/:id', admin.removeUser)
  router.get('/admin/scans', admin.getScans)

  return router
}
