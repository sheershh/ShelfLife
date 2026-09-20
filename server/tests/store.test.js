import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { addSavedFood, createUser, findUserByEmail, loadUsers } from '../store/userStore.js'

let dir, file
before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'shelflife-store-'))
  file = path.join(dir, 'nested', 'users.json')
})
after(async () => { await rm(dir, { recursive: true, force: true }) })

describe('user store (JSON file)', () => {
  it('creates the file and folder on first save, readable only by the owner', async () => {
    await loadUsers(file)
    await createUser({ name: 'Sam', email: 'sam@example.com', passwordHash: 'hash-1' })
    const saved = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(saved.length, 1)
    assert.equal(saved[0].email, 'sam@example.com')
    assert.equal((await stat(file)).mode & 0o077, 0)
  })

  it('keeps users and saved foods after a restart', async () => {
    const sam = findUserByEmail('sam@example.com')
    await addSavedFood(sam.id, 'banana')
    await loadUsers(file) // simulates restarting the server
    assert.deepEqual(findUserByEmail('sam@example.com').savedFoods, ['banana'])
  })

  it('rejects a duplicate email even for concurrent sign-ups', async () => {
    const results = await Promise.allSettled([
      createUser({ name: 'Ann', email: 'ann@example.com', passwordHash: 'h' }),
      createUser({ name: 'Ann', email: 'ann@example.com', passwordHash: 'h' }),
    ])
    assert.deepEqual(results.map((r) => r.status).sort(), ['fulfilled', 'rejected'])
    assert.equal(results.find((r) => r.status === 'rejected').reason.status, 409)
  })

  it('refuses to start on a damaged file instead of overwriting it', async () => {
    await writeFile(file, '{ not json')
    await assert.rejects(loadUsers(file), /Could not read/)
    assert.equal(await readFile(file, 'utf8'), '{ not json')
  })
})
