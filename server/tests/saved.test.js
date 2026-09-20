import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { startTestApp } from './helpers.js'

let t
before(async () => { t = await startTestApp() })
after(async () => { await t.stop() })

async function loggedInAgent(email) {
  const agent = t.agent()
  await agent.post('/api/auth/register').send({ name: 'Test User', email, password: 'freshfood1' }).expect(201)
  return agent
}

describe('saved foods require login', () => {
  it('returns 401 for anonymous requests on every saved endpoint', async () => {
    await t.api().get('/api/saved').expect(401)
    await t.api().post('/api/saved/banana').expect(401)
    await t.api().delete('/api/saved/banana').expect(401)
  })
})

describe('saved foods for a logged-in user', () => {
  it('starts empty, then add and remove work', async () => {
    const agent = await loggedInAgent('one@example.com')
    const empty = await agent.get('/api/saved').expect(200)
    assert.equal(empty.body.count, 0)

    const added = await agent.post('/api/saved/banana').expect(200)
    assert.deepEqual(added.body.savedIds, ['banana'])
    await agent.post('/api/saved/milk').expect(200)

    const list = await agent.get('/api/saved').expect(200)
    assert.deepEqual(list.body.foods.map((f) => f.id), ['banana', 'milk'])
    assert.ok(list.body.foods[0].shelfLife)

    const removed = await agent.delete('/api/saved/banana').expect(200)
    assert.deepEqual(removed.body.savedIds, ['milk'])
  })

  it('does not create duplicates when the same food is saved twice', async () => {
    const agent = await loggedInAgent('two@example.com')
    await agent.post('/api/saved/apple').expect(200)
    const again = await agent.post('/api/saved/apple').expect(200)
    assert.deepEqual(again.body.savedIds, ['apple'])
  })

  it('removing a food that is not saved is harmless', async () => {
    const agent = await loggedInAgent('three@example.com')
    const res = await agent.delete('/api/saved/rice').expect(200)
    assert.deepEqual(res.body.savedIds, [])
  })

  it('returns 404 for an unknown food and 400 for a malformed id', async () => {
    const agent = await loggedInAgent('four@example.com')
    await agent.post('/api/saved/dragonfruit').expect(404)
    await agent.post('/api/saved/BAD!ID').expect(400)
    await agent.delete('/api/saved/dragonfruit').expect(404)
  })

  it('keeps each user’s saved foods separate', async () => {
    const alice = await loggedInAgent('alice@example.com')
    const bob = await loggedInAgent('bob@example.com')
    await alice.post('/api/saved/cheese').expect(200)
    const bobList = await bob.get('/api/saved').expect(200)
    assert.equal(bobList.body.count, 0)
    await bob.post('/api/saved/pasta').expect(200)
    const aliceList = await alice.get('/api/saved').expect(200)
    assert.deepEqual(aliceList.body.foods.map((f) => f.id), ['cheese'])
  })

  it('saved foods survive logging out and back in', async () => {
    const agent = await loggedInAgent('five@example.com')
    await agent.post('/api/saved/tomato').expect(200)
    await agent.post('/api/auth/logout').expect(200)
    await agent.get('/api/saved').expect(401)
    await agent.post('/api/auth/login').send({ email: 'five@example.com', password: 'freshfood1' }).expect(200)
    const list = await agent.get('/api/saved').expect(200)
    assert.deepEqual(list.body.foods.map((f) => f.id), ['tomato'])
  })
})
