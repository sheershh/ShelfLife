import { Router } from 'express'
import { addSaved, listSaved, removeSaved } from '../controllers/savedController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.use(requireAuth)
router.get('/', listSaved)
router.post('/:id', addSaved)
router.delete('/:id', removeSaved)

export default router
