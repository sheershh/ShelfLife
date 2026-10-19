// Test helpers: an in-memory MongoDB, the real Express app on a random port, a fake AI,
// and a tiny HTTP client that remembers the login cookie like a browser would.
import { connectDb, disconnectDb } from '../server/db.js'
import { createApp } from '../server/app.js'
import mongoose from 'mongoose'

process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-the-checks-1234567890'
delete process.env.MONGODB_URI // always use the in-memory database in tests

// A fake AI service. Tests change `nextVerdict` to control what the "model" says.
export const fakeAi = {
  calls: [],
  nextVerdict: null,
  isConfigured: () => true,
  async analyseImage(image, catalog) {
    this.calls.push({ type: 'image', image, catalog })
    return this.nextVerdict
  },
  nextRecipes: { recipes: [{ title: 'Saag', minutes: 25, uses: ['Spinach'], steps: ['Wash.', 'Cook.'] }] },
  nextReceipt: { items: [{ text: 'BANANAS 1KG', matchedFoodId: 'banana' }, { text: 'DETERGENT', matchedFoodId: 'none' }] },
  async suggestRecipes(foods) {
    this.calls.push({ type: 'recipes', foods })
    return this.nextRecipes
  },
  async readReceipt(image, catalog) {
    this.calls.push({ type: 'receipt', image, catalog })
    return this.nextReceipt
  },
  async chat(input) {
    this.calls.push({ type: 'chat', ...input })
    return `fake reply (${input.history.length} earlier turns)`
  },
}

export async function startServer({ limits = { auth: 1000, ai: 1000 } } = {}) {
  await connectDb() // no URI -> in-memory MongoDB, seeded with the 12 foods
  const app = createApp({ ai: fakeAi, limits })
  const server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  return {
    app,
    baseUrl,
    async stop() {
      server.close()
      await disconnectDb()
    },
  }
}

export async function resetUsers() {
  await mongoose.connection.collection('users').deleteMany({})
  await mongoose.connection.collection('scans').deleteMany({})
  await mongoose.connection.collection('mealentries').deleteMany({})
}

// Each client keeps its own cookie, like a separate browser.
export function client(baseUrl) {
  let cookie = ''
  async function send(method, path, body) {
    const response = await fetch(baseUrl + path, {
      method,
      headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(cookie && { Cookie: cookie }) },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    })
    const setCookie = response.headers.get('set-cookie')
    if (setCookie) cookie = setCookie.split(';')[0]
    const data = await response.json().catch(() => null)
    return { status: response.status, data, headers: response.headers }
  }
  return {
    get: (path) => send('GET', path),
    post: (path, body) => send('POST', path, body ?? {}),
    put: (path, body) => send('PUT', path, body),
    patch: (path, body) => send('PATCH', path, body),
    delete: (path) => send('DELETE', path),
    raw: send,
  }
}

let counter = 0
export async function signUp(api, overrides = {}) {
  counter += 1
  const body = { name: 'Test User', email: `user${counter}@example.com`, password: 'password123', ...overrides }
  const res = await api.post('/api/auth/register', body)
  return { ...res, email: body.email, password: body.password }
}

export async function makeAdmin(email) {
  await mongoose.connection.collection('users').updateOne({ email }, { $set: { role: 'admin' } })
}

// A real 1x1 JPEG, so the server's image checks pass.
export const TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='
