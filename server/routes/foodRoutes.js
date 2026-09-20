import { Router } from 'express'
import { getFood, listFoods } from '../controllers/foodController.js'

const router = Router()

router.get('/', listFoods)
router.get('/:id', getFood)

export default router
