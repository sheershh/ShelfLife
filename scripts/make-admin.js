// npm run make-admin -- someone@example.com
// Gives an existing account the admin role (sign up on the website first).
import 'dotenv/config'
import { connectDb, disconnectDb } from '../server/db.js'
import { User } from '../server/models/User.js'

const email = (process.argv[2] || '').trim().toLowerCase()
if (!email) {
  console.error('Usage: npm run make-admin -- someone@example.com')
  process.exit(1)
}

await connectDb(process.env.MONGODB_URI)
const user = await User.findOneAndUpdate({ email }, { role: 'admin' }, { returnDocument: 'after' })
console.log(user ? `${user.name} <${user.email}> is now an admin.` : `No account found for ${email}. Sign up first.`)
await disconnectDb()
process.exit(user ? 0 : 1)
