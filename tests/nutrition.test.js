// API tests for the nutrition diary: foods carry nutrition, entries are scaled by amount,
// day and week totals, goals, and that each person only sees their own diary.
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'
import { scaleNutrition } from '../server/controllers/nutritionController.js'
import { client, resetUsers, signUp, startServer } from './helpers.js'

let server
before(async () => { server = await startServer() })
after(async () => { await server.stop() })
beforeEach(async () => { await resetUsers() })

const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = (days) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
async function loggedIn() {
  const api = client(server.baseUrl)
  await signUp(api)
  return api
}

describe('nutrition data', () => {
  test('every seeded food has nutrition figures and a serving', async () => {
    const { data } = await client(server.baseUrl).get('/api/foods')
    for (const food of data.foods) {
      assert.ok(food.nutrition?.per100g?.calories >= 0, `${food.id} has calories`)
      assert.ok(food.nutrition.serving.grams > 0, `${food.id} has a serving`)
    }
  })

  test('the energy in each food roughly matches its macros (4 / 4 / 9 kcal per gram)', async () => {
    const { data } = await client(server.baseUrl).get('/api/foods')
    for (const { id, nutrition: { per100g: n } } of data.foods) {
      const fromMacros = n.carbs * 4 + n.protein * 4 + n.fat * 9
      // Fibre, water and rounding make small differences, so allow a generous margin.
      assert.ok(Math.abs(fromMacros - n.calories) <= Math.max(35, n.calories * 0.25), `${id}: ${n.calories} kcal vs ${Math.round(fromMacros)} from macros`)
    }
  })

  test('scaling by amount', () => {
    assert.deepEqual(scaleNutrition({ calories: 89, carbs: 22.8, fat: 0.3, protein: 1.1, fibre: 2.6 }, 118),
      { calories: 105, carbs: 26.9, fat: 0.4, protein: 1.3, fibre: 3.1 })
  })
})

describe('logging food', () => {
  test('needs login', async () => {
    assert.equal((await client(server.baseUrl).get(`/api/nutrition/day?date=${today()}`)).status, 401)
    assert.equal((await client(server.baseUrl).post('/api/nutrition/entries', {})).status, 401)
  })

  test('a guide food is scaled by grams and shows up in the day with totals and default goals', async () => {
    const api = await loggedIn()
    const added = await api.post('/api/nutrition/entries', { date: today(), meal: 'breakfast', foodId: 'banana', grams: 118 })
    assert.equal(added.status, 201)
    assert.equal(added.data.entry.calories, 105)
    await api.post('/api/nutrition/entries', { date: today(), meal: 'lunch', foodId: 'rice', grams: 160 })

    const { data } = await api.get(`/api/nutrition/day?date=${today()}`)
    assert.equal(data.entries.length, 2)
    assert.equal(data.totals.calories, 105 + 208)
    assert.deepEqual(data.goals, { calories: 2000, carbs: 250, fat: 65, protein: 50 })
    assert.equal(data.customGoals, false)
  })

  test('a custom entry stores what the person typed', async () => {
    const api = await loggedIn()
    const res = await api.post('/api/nutrition/entries', { date: today(), meal: 'snack', name: 'Samosa', calories: 262, carbs: '24', fat: 17, protein: 3.5 })
    assert.equal(res.status, 201)
    assert.deepEqual([res.data.entry.name, res.data.entry.calories, res.data.entry.carbs, res.data.entry.grams], ['Samosa', 262, 24, null])
  })

  test('validates meal, date, amount and custom fields', async () => {
    const api = await loggedIn()
    const bad = (body) => api.post('/api/nutrition/entries', { date: today(), meal: 'lunch', ...body })
    assert.ok((await bad({ meal: 'brunch', foodId: 'banana', grams: 100 })).data.errors.meal)
    assert.ok((await bad({ date: '2026-02-31', foodId: 'banana', grams: 100 })).data.errors.date)
    assert.ok((await bad({ date: '2999-01-01', foodId: 'banana', grams: 100 })).data.errors.date)
    assert.ok((await bad({ foodId: 'banana', grams: 0 })).data.errors.grams)
    assert.ok((await bad({ foodId: 'banana', grams: 'lots' })).data.errors.grams)
    assert.equal((await bad({ foodId: 'unicorn', grams: 100 })).status, 404)
    assert.equal((await bad({ foodId: 'BAD ID', grams: 100 })).status, 400)
    const custom = await bad({ name: '', calories: -5 })
    assert.ok(custom.data.errors.name && custom.data.errors.calories)
  })

  test('a food without nutrition figures cannot be logged by id', async () => {
    const api = await loggedIn()
    const admin = client(server.baseUrl)
    const { email, password } = await signUp(admin)
    const { makeAdmin } = await import('./helpers.js')
    await makeAdmin(email)
    await admin.post('/api/auth/login', { email, password })
    const food = {
      slug: 'plain-test', name: 'Plain Test', category: 'Fruits', storageLocation: 'Refrigerator', freshnessStatus: 'Longer Lasting',
      image: '/images/banana.jpg', shortDescription: 'A food with no nutrition record.', storageMethod: 'Keep it somewhere cool and dry.',
      shelfLifePreview: 'Fridge: 1 week', shelfLife: { refrigerator: 'About 1 week' }, storageTips: ['Keep cool.'], freshnessSigns: ['Firm'],
      spoilageSigns: ['Mould'], usageIdeas: ['Eat'], freshnessStages: [{ label: 'Fresh', description: 'Firm and bright.' }],
    }
    assert.equal((await admin.post('/api/admin/foods', food)).status, 201)
    const res = await api.post('/api/nutrition/entries', { date: today(), meal: 'snack', foodId: 'plain-test', grams: 50 })
    assert.equal(res.status, 409)
  })

  test('deleting an entry removes it, and only the owner can', async () => {
    const owner = await loggedIn()
    const other = await loggedIn()
    const { data } = await owner.post('/api/nutrition/entries', { date: today(), meal: 'dinner', foodId: 'lentils', grams: 150 })
    assert.equal((await other.delete(`/api/nutrition/entries/${data.entry.id}`)).status, 404)
    assert.equal((await other.get(`/api/nutrition/day?date=${today()}`)).data.entries.length, 0, 'diaries are private')
    assert.equal((await owner.delete(`/api/nutrition/entries/${data.entry.id}`)).status, 200)
    assert.equal((await owner.get(`/api/nutrition/day?date=${today()}`)).data.entries.length, 0)
    assert.equal((await owner.delete('/api/nutrition/entries/not-an-id')).status, 404)
  })

  test('history keeps the numbers from the day it was logged', async () => {
    const api = await loggedIn()
    await api.post('/api/nutrition/entries', { date: today(), meal: 'breakfast', foodId: 'milk', grams: 245 })
    const admin = client(server.baseUrl)
    const { email, password } = await signUp(admin)
    const { makeAdmin } = await import('./helpers.js')
    await makeAdmin(email)
    await admin.post('/api/auth/login', { email, password })
    await admin.delete('/api/admin/foods/milk')
    const { data } = await api.get(`/api/nutrition/day?date=${today()}`)
    assert.equal(data.entries[0].name, 'Milk')
    assert.equal(data.entries[0].calories, 149)
  })
})

describe('goals and the week', () => {
  test('goals can be set and validated', async () => {
    const api = await loggedIn()
    const set = await api.put('/api/nutrition/goals', { calories: 1800, carbs: 200, fat: 60, protein: 90 })
    assert.equal(set.data.goals.calories, 1800)
    const day = (await api.get(`/api/nutrition/day?date=${today()}`)).data
    assert.deepEqual(day.goals, { calories: 1800, carbs: 200, fat: 60, protein: 90 })
    assert.equal(day.customGoals, true)

    const bad = await api.put('/api/nutrition/goals', { calories: 100, carbs: -1, fat: 'x', protein: 90 })
    assert.equal(bad.status, 400)
    assert.ok(bad.data.errors.calories && bad.data.errors.carbs && bad.data.errors.fat)
  })

  test('the week lists seven days with zeros for empty days and averages the logged ones', async () => {
    const api = await loggedIn()
    await api.post('/api/nutrition/entries', { date: today(), meal: 'lunch', name: 'Thali', calories: 800, carbs: 100, fat: 30, protein: 25 })
    await api.post('/api/nutrition/entries', { date: daysAgo(2), meal: 'lunch', name: 'Pizza', calories: 1000, carbs: 120, fat: 40, protein: 35 })
    const { data } = await api.get(`/api/nutrition/week?end=${today()}`)
    assert.equal(data.days.length, 7)
    assert.equal(data.days.at(-1).date, today())
    assert.equal(data.days[0].calories, 0)
    assert.equal(data.days[0].logged, false)
    assert.equal(data.days.at(-1).calories, 800)
    assert.deepEqual([data.averages.loggedDays, data.averages.calories], [2, 900])
    assert.equal((await api.get('/api/nutrition/week?end=junk')).status, 400)
  })
})
