// API tests for expiry tracking, used / wasted stats, the shopping list, recipes, receipts, barcodes and food filters.
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'
import { defaultStorage, parseShelfDays, shelfDays, trackingFor } from '../server/utils/shelf.js'
import { client, fakeAi, resetUsers, signUp, startServer, TINY_JPEG } from './helpers.js'

let server
before(async () => { server = await startServer() })
after(async () => { await server.stop() })
beforeEach(async () => { await resetUsers(); fakeAi.calls = [] })

const daysAgo = (days) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
async function loggedIn() {
  const api = client(server.baseUrl)
  await signUp(api)
  return api
}

describe('shelf-life numbers', () => {
  test('reads the low end of a range and the first figure on a line', () => {
    assert.equal(parseShelfDays('About 3–5 days once ripe'), 3)
    assert.equal(parseShelfDays('About 4 weeks'), 28)
    assert.equal(parseShelfDays('Dry: about 1 year · Cooked: 3–4 days in fridge'), 365)
    assert.equal(parseShelfDays('Until the date on the pack'), null)
  })

  test('counts down to the use-by date', () => {
    const food = { storageLocation: 'Refrigerator', shelfLife: { refrigerator: 'About 5 days' } }
    const now = new Date('2026-03-10T15:00:00Z')
    assert.equal(trackingFor(food, { boughtOn: '2026-03-04' }, now).state, 'expired')
    assert.equal(trackingFor(food, { boughtOn: '2026-03-05' }, now).state, 'today')
    assert.equal(trackingFor(food, { boughtOn: '2026-03-07' }, now).daysLeft, 2)
    assert.equal(trackingFor(food, { boughtOn: '2026-03-10' }, now).state, 'fresh')
    assert.equal(trackingFor(food, null, now), null, 'no purchase date, no countdown')
  })
})

describe('expiry tracking', () => {
  test('a purchase date adds a countdown to the saved list', async () => {
    const api = await loggedIn()
    await api.post('/api/saved/spinach')
    assert.equal((await api.get('/api/saved')).data.foods[0].tracking, null)

    const res = await api.patch('/api/saved/spinach', { boughtOn: daysAgo(1) })
    assert.equal(res.status, 200)
    const { tracking } = (await api.get('/api/saved')).data.foods[0]
    assert.equal(tracking.boughtOn, daysAgo(1))
    assert.ok(tracking.daysLeft < tracking.shelfLifeDays)
  })

  test('rejects bad dates, wrong storage and foods that are not saved', async () => {
    const api = await loggedIn()
    assert.equal((await api.patch('/api/saved/spinach', { boughtOn: daysAgo(0) })).status, 409)
    await api.post('/api/saved/spinach')
    const future = await api.patch('/api/saved/spinach', { boughtOn: '2999-01-01' })
    assert.equal(future.status, 400)
    assert.ok(future.data.errors.boughtOn)
    const badStorage = await api.patch('/api/saved/spinach', { boughtOn: daysAgo(0), storage: 'moon' })
    assert.ok(badStorage.data.errors.storage)
    assert.equal((await api.patch('/api/saved/spinach', { boughtOn: 'yesterday' })).status, 400)
  })

  test('removing a food forgets its purchase date', async () => {
    const api = await loggedIn()
    await api.post('/api/saved/spinach')
    await api.patch('/api/saved/spinach', { boughtOn: daysAgo(1) })
    await api.delete('/api/saved/spinach')
    await api.post('/api/saved/spinach')
    assert.equal((await api.get('/api/saved')).data.foods[0].tracking, null)
  })
})

describe('used / wasted insights', () => {
  test('finishing a food takes it off the shelf and counts in the stats', async () => {
    const api = await loggedIn()
    for (const id of ['spinach', 'milk', 'banana']) await api.post(`/api/saved/${id}`)
    await api.post('/api/saved/milk/finish', { outcome: 'used' })
    await api.post('/api/saved/banana/finish', { outcome: 'used' })
    const done = await api.post('/api/saved/spinach/finish', { outcome: 'wasted' })
    assert.deepEqual(done.data.savedIds, [])

    const { data } = await api.get('/api/insights')
    assert.equal(data.used, 2)
    assert.equal(data.wasted, 1)
    assert.equal(data.usedShare, 67)
    assert.deepEqual(data.mostWasted.map((item) => item.name), ['Spinach'])
  })

  test('validates the outcome and needs the food to be saved', async () => {
    const api = await loggedIn()
    assert.equal((await api.post('/api/saved/milk/finish', { outcome: 'used' })).status, 409)
    await api.post('/api/saved/milk')
    assert.equal((await api.post('/api/saved/milk/finish', { outcome: 'ate it' })).status, 400)
  })

  test('lists what to use soon, soonest first', async () => {
    const api = await loggedIn()
    await api.post('/api/saved/spinach')
    await api.patch('/api/saved/spinach', { boughtOn: daysAgo(30) })
    const { data } = await api.get('/api/insights')
    assert.equal(data.useSoon[0].id, 'spinach')
    assert.equal(data.useSoon[0].state, 'expired')
  })
})

describe('shopping list', () => {
  test('needs login', async () => {
    assert.equal((await client(server.baseUrl).get('/api/shopping')).status, 401)
  })

  test('add by name and by food, no duplicates, remove, clear', async () => {
    const api = await loggedIn()
    await api.post('/api/shopping', { name: 'Coriander' })
    await api.post('/api/shopping', { foodId: 'milk' })
    const again = await api.post('/api/shopping', { foodId: 'milk' })
    assert.deepEqual(again.data.items.map((item) => item.name), ['Coriander', 'Milk'])
    assert.equal((await api.post('/api/shopping', { name: '  ' })).status, 400)
    assert.equal((await api.post('/api/shopping', { foodId: 'unicorn' })).status, 404)

    const removed = await api.delete(`/api/shopping/${again.data.items[0].id}`)
    assert.deepEqual(removed.data.items.map((item) => item.name), ['Milk'])
    assert.deepEqual((await api.delete('/api/shopping')).data.items, [])
  })

  test('marking a guide food as bought puts it on the shelves with today as the date', async () => {
    const api = await loggedIn()
    const { data } = await api.post('/api/shopping', { foodId: 'milk' })
    const bought = await api.post(`/api/shopping/${data.items[0].id}/bought`)
    assert.deepEqual(bought.data.items, [])
    assert.deepEqual(bought.data.savedIds, ['milk'])
    assert.equal((await api.get('/api/saved')).data.foods[0].tracking.boughtOn, daysAgo(0))
    assert.equal((await api.post('/api/shopping/not-an-id/bought')).status, 404)
  })
})

describe('recipes', () => {
  test('uses the foods with the fewest days left first', async () => {
    const api = await loggedIn()
    await api.post('/api/saved/milk')
    await api.post('/api/saved/spinach')
    await api.patch('/api/saved/spinach', { boughtOn: daysAgo(2) })
    const res = await api.post('/api/recipes', {})
    assert.equal(res.status, 200)
    assert.equal(res.data.source, 'ai')
    assert.equal(res.data.recipes[0].title, 'Saag')
    assert.equal(fakeAi.calls[0].foods[0].name, 'Spinach')
  })

  test('needs at least one food, and a valid id', async () => {
    const api = await loggedIn()
    assert.equal((await api.post('/api/recipes', {})).status, 400)
    assert.equal((await api.post('/api/recipes', { foodIds: ['BAD ID'] })).status, 400)
  })

  test('falls back to the guide when the AI is not set up', async () => {
    const api = await loggedIn()
    const configured = fakeAi.isConfigured
    fakeAi.isConfigured = () => false
    try {
      const res = await api.post('/api/recipes', { foodIds: ['banana'] })
      assert.equal(res.data.source, 'guide')
      assert.ok(res.data.recipes[0].steps.length > 0)
    } finally {
      fakeAi.isConfigured = configured
    }
  })
})

describe('receipts and barcodes', () => {
  test('a receipt returns the foods in the guide and the lines it could not match', async () => {
    const api = await loggedIn()
    const res = await api.post('/api/receipts', { image: TINY_JPEG })
    assert.deepEqual(res.data.found, [{ foodId: 'banana', name: 'Banana', text: 'BANANAS 1KG' }])
    assert.deepEqual(res.data.unmatched, ['DETERGENT'])
    assert.equal((await api.get('/api/saved')).data.count, 0, 'reading a receipt saves nothing')
    assert.equal((await api.post('/api/receipts', { image: 'nope' })).status, 400)
  })

  test('bulk add saves foods as bought today', async () => {
    const api = await loggedIn()
    const res = await api.post('/api/saved/bulk', { foodIds: ['banana', 'milk', 'banana'] })
    assert.deepEqual(res.data.savedIds, ['banana', 'milk'])
    assert.ok((await api.get('/api/saved')).data.foods.every((food) => food.tracking?.boughtOn === daysAgo(0)))
    assert.equal((await api.post('/api/saved/bulk', { foodIds: [] })).status, 400)
  })

  test('a barcode is looked up and matched to a guide food', async () => {
    const api = await loggedIn()
    server.app.locals.lookupProduct = async (code) =>
      code === '8901234567890' ? { product_name: 'Fresh Whole Milk', brands: 'Dairy Co', categories_tags: ['en:milks'] } : null
    try {
      const hit = await api.get('/api/barcode/8901234567890')
      assert.equal(hit.data.food.id, 'milk')
      assert.equal(hit.data.product.brand, 'Dairy Co')
      assert.equal((await api.get('/api/barcode/1111111111')).data.found, false)
      assert.equal((await api.get('/api/barcode/abc')).status, 400)
    } finally {
      delete server.app.locals.lookupProduct
    }
  })
})

describe('food guide filters', () => {
  test('filter by storage and by keeps-for', async () => {
    const api = client(server.baseUrl)
    const fridge = await api.get('/api/foods?storage=Refrigerator')
    assert.ok(fridge.data.count > 0 && fridge.data.foods.every((food) => food.storageLocation === 'Refrigerator'))
    const fast = await api.get('/api/foods?lasting=' + encodeURIComponent('Highly Perishable'))
    assert.ok(fast.data.foods.every((food) => food.freshnessStatus === 'Highly Perishable'))
    assert.equal((await api.get('/api/foods?storage=Moon')).status, 400)
    assert.equal((await api.get('/api/foods?sort=random')).status, 400)
  })

  test('sort by shelf life and by name', async () => {
    const api = client(server.baseUrl)
    const days = (food) => shelfDays(food, defaultStorage(food))
    const shortest = (await api.get('/api/foods?sort=shortest')).data.foods.map(days).filter((n) => n != null)
    const longest = (await api.get('/api/foods?sort=longest')).data.foods.map(days).filter((n) => n != null)
    assert.deepEqual(shortest, [...shortest].sort((a, b) => a - b))
    assert.deepEqual(longest, [...longest].sort((a, b) => b - a))
    const names = (await api.get('/api/foods?sort=name')).data.foods.map((food) => food.name)
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)))
  })
})

describe('scanner with several photos', () => {
  test('sends every angle to the AI and rejects too many', async () => {
    const api = await loggedIn()
    fakeAi.nextVerdict = { isFood: false, summary: 'not food' }
    await api.post('/api/scans', { images: [TINY_JPEG, TINY_JPEG] })
    assert.equal(fakeAi.calls[0].image.length, 2)
    const tooMany = await api.post('/api/scans', { images: [TINY_JPEG, TINY_JPEG, TINY_JPEG, TINY_JPEG] })
    assert.equal(tooMany.status, 400)
    assert.equal((await api.post('/api/scans', { images: [] })).status, 400)
  })
})
