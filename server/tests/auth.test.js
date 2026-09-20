import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import User from '../models/User.js'
import { startTestApp } from './helpers.js'

let t
before(async () => { t = await startTestApp() })
after(async () => { await t.stop() })

const validUser = { name: 'Asha Rao', email: 'Asha@Example.com', password: 'freshfood1' }

describe('POST /api/auth/register', () => {
  it('creates an account, sets an httpOnly cookie, and never returns the password', async () => {
    const res = await t.api().post('/api/auth/register').send(validUser).expect(201)
    assert.equal(res.body.user.email, 'asha@example.com')
    assert.equal(res.body.user.name, 'Asha Rao')
    assert.equal(JSON.stringify(res.body).includes('freshfood1'), false)
    assert.equal(res.body.user.passwordHash, undefined)
    const cookie = res.headers['set-cookie'][0]
    assert.match(cookie, /shelflife_token=/)
    assert.match(cookie, /HttpOnly/i)
  })

  it('stores a bcrypt hash, not the password', async () => {
    const user = await User.findOne({ email: 'asha@example.com' }).select('+passwordHash')
    assert.notEqual(user.passwordHash, validUser.password)
    assert.match(user.passwordHash, /^\$2[aby]\$12\$/)
  })

  it('rejects a duplicate email (case-insensitive) with 409', async () => {
    const res = await t.api().post('/api/auth/register').send({ ...validUser, email: 'ASHA@example.com' }).expect(409)
    assert.ok(res.body.errors.email)
  })

  it('rejects invalid input with 400 and field errors', async () => {
    const res = await t.api().post('/api/auth/register').send({ name: 'A', email: 'nope', password: 'short' }).expect(400)
    assert.ok(res.body.errors.name && res.body.errors.email && res.body.errors.password)
    const weak = await t.api().post('/api/auth/register').send({ ...validUser, email: 'x@y.co', password: 'onlyletters' }).expect(400)
    assert.ok(weak.body.errors.password)
  })

  it('rejects non-string values and malformed JSON', async () => {
    await t.api().post('/api/auth/register').send({ name: { $gt: '' }, email: { $ne: null }, password: 12345678 }).expect(400)
    const res = await t.api().post('/api/auth/register').set('Content-Type', 'application/json').send('{bad json').expect(400)
    assert.equal(res.body.message, 'Request body is not valid JSON.')
  })
})

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials (email is case-insensitive)', async () => {
    const res = await t.api().post('/api/auth/login').send({ email: 'ASHA@example.com', password: validUser.password }).expect(200)
    assert.equal(res.body.user.name, 'Asha Rao')
    assert.match(res.headers['set-cookie'][0], /shelflife_token=/)
  })

  it('returns the same 401 message for a wrong password and an unknown email', async () => {
    const wrongPassword = await t.api().post('/api/auth/login').send({ email: 'asha@example.com', password: 'wrongpass1' }).expect(401)
    const unknownEmail = await t.api().post('/api/auth/login').send({ email: 'nobody@example.com', password: 'wrongpass1' }).expect(401)
    assert.equal(wrongPassword.body.message, unknownEmail.body.message)
  })

  it('rejects missing fields with 400 and ignores operator-injection objects', async () => {
    await t.api().post('/api/auth/login').send({}).expect(400)
    await t.api().post('/api/auth/login').send({ email: { $ne: null }, password: { $ne: null } }).expect(400)
  })
})

describe('session endpoints', () => {
  it('GET /me returns the user when logged in and null when not', async () => {
    const anonymous = await t.api().get('/api/auth/me').expect(200)
    assert.equal(anonymous.body.user, null)

    const agent = t.agent()
    await agent.post('/api/auth/login').send({ email: 'asha@example.com', password: validUser.password }).expect(200)
    const loggedIn = await agent.get('/api/auth/me').expect(200)
    assert.equal(loggedIn.body.user.email, 'asha@example.com')
  })

  it('POST /logout ends the session', async () => {
    const agent = t.agent()
    await agent.post('/api/auth/login').send({ email: 'asha@example.com', password: validUser.password }).expect(200)
    await agent.post('/api/auth/logout').expect(200)
    const after = await agent.get('/api/auth/me').expect(200)
    assert.equal(after.body.user, null)
  })

  it('treats a tampered token as logged out', async () => {
    const res = await t.api().get('/api/auth/me').set('Cookie', 'shelflife_token=not.a.real.token').expect(200)
    assert.equal(res.body.user, null)
  })
})
