// The login rate limit, tested with a deliberately low limit.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { client, startServer } from './helpers.js'

let server
before(async () => { server = await startServer({ limits: { auth: 3, ai: 1000 } }) })
after(async () => { await server.stop() })

test('the 4th login attempt within 15 minutes gets 429 with Retry-After', async () => {
  const api = client(server.baseUrl)
  const attempt = () => api.post('/api/auth/login', { email: 'a@example.com', password: 'wrongpass1' })
  for (let i = 0; i < 3; i += 1) assert.equal((await attempt()).status, 401)
  const blocked = await attempt()
  assert.equal(blocked.status, 429)
  assert.ok(Number(blocked.headers.get('retry-after')) > 0)
})
