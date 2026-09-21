import { Router } from 'express'
import { login, logout, me, register } from '../controllers/authController.js'
import { getFood, listFoods } from '../controllers/foodController.js'
import { addSaved, listSaved, removeSaved } from '../controllers/savedController.js'
import { optionalAuth, requireAuth } from '../middleware/auth.js'

// All API routes in one place. app.js mounts this router at /api.
const router = Router()

// Accounts
router.post('/auth/register', register)
router.post('/auth/login', login)
router.post('/auth/logout', logout)
router.get('/auth/me', optionalAuth, me)

// Foods (open to everyone)
router.get('/foods', listFoods)
router.get('/foods/:id', getFood)

// Saved foods (login required)
router.get('/saved', requireAuth, listSaved)
router.post('/saved/:id', requireAuth, addSaved)
router.delete('/saved/:id', requireAuth, removeSaved)

export default router
