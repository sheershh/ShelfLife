// End-to-end API tests: real Express app + real MongoDB (in memory) + fake AI.
// Run with: npm test
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'
import { client, fakeAi, makeAdmin, resetUsers, signUp, startServer, TINY_JPEG } from './helpers.js'

let server
before(async () => { server = await startServer() })
after(async () => { await server.stop() })
beforeEach(async () => { await resetUsers(); fakeAi.calls = [] })

describe('foods', () => {
  test('lists all 12 seeded foods in the original order', async () => {
    const { status, data } = await client(server.baseUrl).get('/api/foods')
    assert.equal(status, 200)
    assert.equal(data.count, 12)
    assert.equal(data.foods[0].id, 'banana')
    assert.equal(data.foods[0]._id, undefined, 'database internals are not exposed')
  })

  test('search is case-insensitive and combines with category', async () => {
    const api = client(server.baseUrl)
    assert.deepEqual((await api.get('/api/foods?search=BAN')).data.foods.map((f) => f.id), ['banana'])
    assert.equal((await api.get('/api/foods?category=Dairy')).data.count, 3)
    assert.equal((await api.get('/api/foods?search=ban&category=Dairy')).data.count, 0)
  })

  test('search text is treated literally, not as a regular expression', async () => {
    const { status, data } = await client(server.baseUrl).get('/api/foods?search=.*')
    assert.equal(status, 200)
    assert.equal(data.count, 0)
  })

  test('rejects an unknown category and a bad id', async () => {
    const api = client(server.baseUrl)
    assert.equal((await api.get('/api/foods?category=Sweets')).status, 400)
    assert.equal((await api.get('/api/foods/BAD!')).status, 400)
    assert.equal((await api.get('/api/foods/dragonfruit')).status, 404)
  })

  test('one food has the full details', async () => {
    const { data } = await client(server.baseUrl).get('/api/foods/milk')
    assert.equal(data.food.name, 'Milk')
    assert.ok(data.food.freshnessStages.length > 0)
    assert.ok(data.food.shelfLife.refrigerator)
  })

  test('meta returns categories and recipes', async () => {
    const { data } = await client(server.baseUrl).get('/api/meta')
    assert.equal(data.categories.length, 4)
    assert.equal(data.recipes.length, 6)
  })
})

describe('accounts', () => {
  test('register logs in, me returns the user without the hash', async () => {
    const api = client(server.baseUrl)
    const res = await signUp(api, { name: 'Asha' })
    assert.equal(res.status, 201)
    assert.equal(res.data.user.role, 'user')
    const me = await api.get('/api/auth/me')
    assert.equal(me.data.user.name, 'Asha')
    assert.equal(me.data.user.passwordHash, undefined)
  })

  test('the cookie is httpOnly', async () => {
    const res = await signUp(client(server.baseUrl))
    assert.match(res.headers.get('set-cookie'), /HttpOnly/i)
  })

  test('duplicate email is rejected, email is case-insensitive', async () => {
    const first = await signUp(client(server.baseUrl), { email: 'same@example.com' })
    assert.equal(first.status, 201)
    const second = await signUp(client(server.baseUrl), { email: 'SAME@example.com' })
    assert.equal(second.status, 409)
  })

  test('validation errors are per field', async () => {
    const res = await client(server.baseUrl).post('/api/auth/register', { name: 'A', email: 'x', password: 'short' })
    assert.equal(res.status, 400)
    assert.deepEqual(Object.keys(res.data.errors).sort(), ['email', 'name', 'password'])
  })

  test('login works and wrong password / unknown email give the same message', async () => {
    const { email, password } = await signUp(client(server.baseUrl))
    const api = client(server.baseUrl)
    assert.equal((await api.post('/api/auth/login', { email, password })).status, 200)
    const wrong = await api.post('/api/auth/login', { email, password: 'wrongpass1' })
    const unknown = await api.post('/api/auth/login', { email: 'nobody@example.com', password: 'whatever1' })
    assert.equal(wrong.status, 401)
    assert.equal(wrong.data.message, unknown.data.message)
  })

  test('NoSQL injection in login is rejected', async () => {
    await signUp(client(server.baseUrl))
    const res = await client(server.baseUrl).post('/api/auth/login', { email: { $gt: '' }, password: { $gt: '' } })
    assert.equal(res.status, 400)
  })

  test('logout clears the session', async () => {
    const api = client(server.baseUrl)
    await signUp(api)
    await api.post('/api/auth/logout')
    assert.equal((await api.get('/api/auth/me')).data.user, null)
  })
})

describe('saved foods', () => {
  test('needs login', async () => {
    assert.equal((await client(server.baseUrl).get('/api/saved')).status, 401)
    assert.equal((await client(server.baseUrl).post('/api/saved/banana')).status, 401)
  })

  test('save, save again, list in order, remove', async () => {
    const api = client(server.baseUrl)
    await signUp(api)
    await api.post('/api/saved/milk')
    await api.post('/api/saved/banana')
    const again = await api.post('/api/saved/milk')
    assert.deepEqual(again.data.savedIds, ['milk', 'banana'])
    assert.deepEqual((await api.get('/api/saved')).data.foods.map((f) => f.id), ['milk', 'banana'])
    const removed = await api.delete('/api/saved/milk')
    assert.deepEqual(removed.data.savedIds, ['banana'])
  })

  test('unknown food cannot be saved', async () => {
    const api = client(server.baseUrl)
    await signUp(api)
    assert.equal((await api.post('/api/saved/unicorn')).status, 404)
  })
})

describe('freshness scanner', () => {
  const goodVerdict = {
    isFood: true, item: 'Banana', matchedFoodId: 'banana', ripeness: 'overripe', freshnessScore: 48,
    mould: { detected: false, where: '' }, visibleSigns: ['Brown spots'], estimatedDaysLeft: 'About 1 day',
    recommendation: 'cook-today', confidence: 'high', summary: 'Very ripe, good for banana bread.',
  }

  test('needs login', async () => {
    assert.equal((await client(server.baseUrl).post('/api/scans', { image: TINY_JPEG })).status, 401)
  })

  test('analyses a photo, grounds it in our food record and stores it', async () => {
    const api = client(server.baseUrl)
    await signUp(api)
    fakeAi.nextVerdict = goodVerdict
    const res = await api.post('/api/scans', { image: TINY_JPEG, thumbnail: TINY_JPEG })
    assert.equal(res.status, 201)
    assert.equal(res.data.scan.recommendation, 'cook-today')
    assert.equal(res.data.food.id, 'banana', 'the ShelfLife record is attached')
    assert.equal(fakeAi.calls[0].catalog.length, 12, 'the AI is given our catalog')
    const history = await api.get('/api/scans')
    assert.equal(history.data.count, 1)
    assert.ok(history.data.scans[0].thumbnail.startsWith('data:image/jpeg'))
  })

  test('mould on soft food is always "discard", whatever the model said', async () => {
    const api = client(server.baseUrl)
    await signUp(api)
    fakeAi.nextVerdict = { ...goodVerdict, mould: { detected: true, where: 'stem end' }, recommendation: 'use-soon', freshnessScore: 60 }
    const { data } = await api.post('/api/scans', { image: TINY_JPEG })
    assert.equal(data.scan.recommendation, 'discard')
    assert.ok(data.scan.freshnessScore <= 15)
  })

  test('bad model output is cleaned up', async () => {
    const api = client(server.baseUrl)
    await signUp(api)
    fakeAi.nextVerdict = { ...goodVerdict, matchedFoodId: 'not-real', ripeness: 'weird', freshnessScore: 900, confidence: 'max' }
    const { data } = await api.post('/api/scans', { image: TINY_JPEG })
    assert.equal(data.scan.matchedFood, null)
    assert.equal(data.scan.ripeness, 'unknown')
    assert.equal(data.scan.freshnessScore, 100)
    assert.equal(data.scan.confidence, 'low')
  })

  test('non-food photos are not stored', async () => {
    const api = client(server.baseUrl)
    await signUp(api)
    fakeAi.nextVerdict = { ...goodVerdict, isFood: false, summary: 'This looks like a keyboard.' }
    const res = await api.post('/api/scans', { image: TINY_JPEG })
    assert.equal(res.status, 200)
    assert.equal(res.data.scan, null)
    assert.equal(res.data.message, 'This looks like a keyboard.')
    assert.equal((await api.get('/api/scans')).data.count, 0)
  })

  test('rejects files that are not real images', async () => {
    const api = client(server.baseUrl)
    await signUp(api)
    const fake = `data:image/jpeg;base64,${Buffer.from('<script>alert(1)</script>').toString('base64')}`
    assert.equal((await api.post('/api/scans', { image: fake })).status, 400)
    assert.equal((await api.post('/api/scans', { image: 'data:text/html;base64,AAAA' })).status, 400)
    assert.equal(fakeAi.calls.length, 0, 'the AI is never called for invalid files')
  })

  test('assistant uses the scan and our records as context', async () => {
    const api = client(server.baseUrl)
    await signUp(api)
    fakeAi.nextVerdict = goodVerdict
    const { data } = await api.post('/api/scans', { image: TINY_JPEG })
    const res = await api.post('/api/assistant', {
      message: 'Can I bake with it?', scanId: data.scan.id, history: [{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'hello' }],
    })
    assert.equal(res.status, 200)
    assert.equal(res.data.reply, 'fake reply (2 earlier turns)')
    const chatCall = fakeAi.calls.find((call) => call.type === 'chat')
    assert.match(chatCall.context, /ShelfLife record for Banana/)
    assert.doesNotMatch(chatCall.context, /data:image/, 'the photo is not sent again')
  })

  test("a user cannot use someone else's scan", async () => {
    const owner = client(server.baseUrl)
    await signUp(owner)
    fakeAi.nextVerdict = goodVerdict
    const { data } = await owner.post('/api/scans', { image: TINY_JPEG })
    const other = client(server.baseUrl)
    await signUp(other)
    assert.equal((await other.post('/api/assistant', { message: 'hi', scanId: data.scan.id })).status, 404)
  })

  test('assistant grounds plain questions by food name', async () => {
    const api = client(server.baseUrl)
    await signUp(api)
    await api.post('/api/assistant', { message: 'How long does milk last?' })
    assert.match(fakeAi.calls.at(-1).context, /ShelfLife record for Milk/)
  })
})

describe('admin', () => {
  const newFood = {
    slug: 'mango', name: 'Mango', category: 'Fruits', image: '/images/placeholder.svg',
    shortDescription: 'A sweet tropical fruit that ripens at room temperature.', storageLocation: 'Room Temperature',
    storageMethod: 'Ripen at room temperature, then refrigerate for a few extra days.', shelfLifePreview: 'Room temp: 2–4 days',
    shelfLife: { roomTemperature: 'About 2–4 days once ripe', refrigerator: 'About 5 days once ripe' },
    storageTips: ['Keep unripe mangoes out of the fridge.'], freshnessStatus: 'Highly Perishable',
    freshnessStages: [{ label: 'Ripe', description: 'Gives slightly when pressed, fragrant at the stem.' }],
    freshnessSigns: ['Fragrant'], spoilageSigns: ['Sour smell'], usageIdeas: ['Mango lassi'],
  }

  async function adminClient() {
    const api = client(server.baseUrl)
    const { email } = await signUp(api)
    await makeAdmin(email)
    return api
  }

  test('regular users get 403, visitors get 401', async () => {
    assert.equal((await client(server.baseUrl).get('/api/admin/stats')).status, 401)
    const api = client(server.baseUrl)
    await signUp(api)
    assert.equal((await api.get('/api/admin/stats')).status, 403)
    assert.equal((await api.post('/api/admin/foods', newFood)).status, 403)
  })

  test('stats', async () => {
    const api = await adminClient()
    await api.post('/api/saved/banana')
    const { status, data } = await api.get('/api/admin/stats')
    assert.equal(status, 200)
    assert.equal(data.totals.foods, 12)
    assert.equal(data.totals.admins, 1)
    assert.deepEqual(data.mostSaved[0], { id: 'banana', name: 'Banana', saves: 1 })
  })

  test('create, edit and delete a food; it appears publicly and leaves saved lists', async () => {
    const api = await adminClient()
    assert.equal((await api.post('/api/admin/foods', newFood)).status, 201)
    assert.equal((await api.post('/api/admin/foods', newFood)).status, 409)
    assert.equal((await client(server.baseUrl).get('/api/foods/mango')).data.food.name, 'Mango')

    const edited = await api.put('/api/admin/foods/mango', { ...newFood, name: 'Alphonso Mango', slug: 'changed' })
    assert.equal(edited.data.food.name, 'Alphonso Mango')
    assert.equal(edited.data.food.id, 'mango', 'the slug cannot be changed')

    await api.post('/api/saved/mango')
    assert.equal((await api.delete('/api/admin/foods/mango')).status, 200)
    assert.equal((await client(server.baseUrl).get('/api/foods/mango')).status, 404)
    assert.deepEqual((await api.get('/api/auth/me')).status, 200)
    assert.equal((await api.get('/api/saved')).data.count, 0)
  })

  test('food validation lists every bad field', async () => {
    const api = await adminClient()
    const res = await api.post('/api/admin/foods', { ...newFood, slug: 'Bad Slug', category: 'Sweets', image: 'http://evil/x.png', usageIdeas: [] })
    assert.equal(res.status, 400)
    assert.deepEqual(Object.keys(res.data.errors).sort(), ['category', 'image', 'slug', 'usageIdeas'])
  })

  test('users: list, promote, cannot demote or delete yourself, delete others', async () => {
    const api = await adminClient()
    const other = client(server.baseUrl)
    await signUp(other)
    const { data } = await api.get('/api/admin/users')
    assert.equal(data.count, 2)
    const me = (await api.get('/api/auth/me')).data.user
    const them = data.users.find((user) => user.id !== me.id)

    assert.equal((await api.patch(`/api/admin/users/${them.id}`, { role: 'admin' })).data.user.role, 'admin')
    assert.equal((await api.patch(`/api/admin/users/${me.id}`, { role: 'user' })).status, 400)
    assert.equal((await api.delete(`/api/admin/users/${me.id}`)).status, 400)
    assert.equal((await api.delete(`/api/admin/users/${them.id}`)).status, 200)
    assert.equal((await other.get('/api/auth/me')).data.user, null, 'deleted user is logged out at once')
    assert.equal((await api.delete('/api/admin/users/not-an-id')).status, 404)
  })

  test('image upload stores a real image under a server-chosen name', async () => {
    const api = await adminClient()
    const res = await api.post('/api/admin/images', { image: TINY_JPEG })
    assert.equal(res.status, 201)
    assert.match(res.data.path, /^\/images\/uploads\/[0-9a-f-]{36}\.jpg$/)
    const { unlink } = await import('node:fs/promises')
    await unlink(new URL(`../client${res.data.path}`, import.meta.url))
  })
})

describe('general', () => {
  test('unknown API routes return JSON 404, big bodies are refused', async () => {
    const api = client(server.baseUrl)
    const res = await api.get('/api/nope')
    assert.equal(res.status, 404)
    assert.match(res.data.message, /Route not found/)
    const big = await api.post('/api/auth/login', { email: 'a@b.co', password: 'x'.repeat(20_000) })
    assert.equal(big.status, 413)
  })

  test('security headers are set', async () => {
    const res = await client(server.baseUrl).get('/api/health')
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/)
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  })
})
