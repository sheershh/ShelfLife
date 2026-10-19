// Server for browser tests: the real app with an in-memory MongoDB, a fake AI (no quota used)
// and two ready-made accounts: admin@test.com and user@test.com (password: password123).
import bcrypt from 'bcryptjs'
import { createApp } from '../../server/app.js'
import { connectDb } from '../../server/db.js'
import { User } from '../../server/models/User.js'

process.env.JWT_SECRET = 'e2e-secret-that-is-long-enough-for-the-checks-12345'
delete process.env.MONGODB_URI

await connectDb()
const passwordHash = await bcrypt.hash('password123', 4)
await User.create({ name: 'Asha Admin', email: 'admin@test.com', passwordHash, role: 'admin' })
await User.create({ name: 'Ravi User', email: 'user@test.com', passwordHash })

const fakeAi = {
  isConfigured: () => true,
  async analyseImage() {
    return {
      isFood: true, item: 'Banana', matchedFoodId: 'banana', ripeness: 'overripe', freshnessScore: 46,
      mould: { detected: false, where: '' }, visibleSigns: ['Brown spots on the peel'],
      estimatedDaysLeft: 'About 1 day', recommendation: 'cook-today', confidence: 'high',
      summary: 'Very ripe. Best for banana bread today.',
    }
  },
  async suggestRecipes() {
    return { recipes: [{ title: 'Quick saag', minutes: 20, uses: ['Spinach'], steps: ['Wash the leaves.', 'Cook with garlic.'] }] }
  },
  async readReceipt() {
    return { items: [{ text: 'BANANAS', matchedFoodId: 'banana' }, { text: 'BIN BAGS', matchedFoodId: 'none' }] }
  },
  async chat({ message }) {
    return `Fake answer to: ${message}`
  },
}

const port = Number(process.env.E2E_PORT || 4200)
createApp({ ai: fakeAi, limits: { auth: 1000, ai: 1000 } }).listen(port, () => console.log(`e2e server on ${port}`))
