// npm run migrate-users
// One-time import of accounts from the old JSON file (server/data/users.json) into MongoDB.
// Password hashes are copied as they are, so people keep their passwords. Existing emails are skipped.
import 'dotenv/config'
import { existsSync, readFileSync } from 'node:fs'
import { connectDb, disconnectDb } from '../server/db.js'
import { User } from '../server/models/User.js'

const file = new URL('../server/data/users.json', import.meta.url)
if (!existsSync(file)) {
  console.log('No server/data/users.json found, nothing to migrate.')
  process.exit(0)
}

await connectDb(process.env.MONGODB_URI)
let added = 0
for (const old of JSON.parse(readFileSync(file, 'utf8'))) {
  if (await User.exists({ email: old.email })) continue
  await User.create({
    name: old.name,
    email: old.email,
    passwordHash: old.passwordHash,
    savedFoods: old.savedFoods || [],
    createdAt: old.createdAt,
  })
  added += 1
}
console.log(`Migrated ${added} account(s).`)
await disconnectDb()
