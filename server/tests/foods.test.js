import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { startTestApp } from './helpers.js'

let t
before(async () => { t = await startTestApp() })
after(async () => { await t.stop() })

describe('GET /api/foods', () => {
  it('returns all 12 foods in order with public ids', async () => {
    const res = await t.api().get('/api/foods').expect(200)
    assert.equal(res.body.count, 12)
    assert.equal(res.body.foods[0].id, 'banana')
    assert.equal(res.body.foods[11].id, 'pasta')
    assert.equal(res.body.foods[0]._id, undefined)
    assert.equal(res.body.foods[0].slug, undefined)
  })

  it('filters by search text, case-insensitively', async () => {
    const res = await t.api().get('/api/foods?search=BAN').expect(200)
    assert.deepEqual(res.body.foods.map((f) => f.id), ['banana'])
  })

  it('filters by category and combines with search', async () => {
    const dairy = await t.api().get('/api/foods').query({ category: 'Dairy' }).expect(200)
    assert.equal(dairy.body.count, 3)
    const both = await t.api().get('/api/foods').query({ category: 'Dairy', search: 'ch' }).expect(200)
    assert.deepEqual(both.body.foods.map((f) => f.id), ['cheese'])
    const grains = await t.api().get('/api/foods').query({ category: 'Pantry & Grains' }).expect(200)
    assert.equal(grains.body.count, 3)
  })

  it('returns an empty list when nothing matches', async () => {
    const res = await t.api().get('/api/foods?search=zzz').expect(200)
    assert.equal(res.body.count, 0)
  })

  it('treats regex characters in search as plain text', async () => {
    const res = await t.api().get('/api/foods').query({ search: '.*' }).expect(200)
    assert.equal(res.body.count, 0)
  })

  it('rejects an unknown category or repeated search parameter with 400', async () => {
    const bad = await t.api().get('/api/foods?category=Candy').expect(400)
    assert.ok(bad.body.errors.category)
    await t.api().get('/api/foods?search=a&search=b').expect(400)
  })
})

describe('GET /api/foods/:id', () => {
  it('returns one food with shelf-life details', async () => {
    const res = await t.api().get('/api/foods/tomato').expect(200)
    assert.equal(res.body.food.name, 'Tomato')
    assert.ok(res.body.food.shelfLife.roomTemperature)
    assert.equal(res.body.food.shelfLife.pantry, undefined)
    assert.equal(res.body.food.freshnessStages.length, 4)
  })

  it('returns 404 for a food that does not exist and 400 for a malformed id', async () => {
    const missing = await t.api().get('/api/foods/nope').expect(404)
    assert.equal(missing.body.message, 'Food not found.')
    await t.api().get('/api/foods/BAD%20ID!').expect(400)
  })
})

describe('unknown routes', () => {
  it('returns JSON 404 for unknown API routes', async () => {
    const res = await t.api().get('/api/unknown').expect(404)
    assert.ok(res.body.message)
  })
})
