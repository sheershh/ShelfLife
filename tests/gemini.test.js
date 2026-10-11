// Tests for server/services/gemini.js with a fake fetch (no real calls to Google).
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { chat } from '../server/services/gemini.js'

process.env.GEMINI_API_KEY = 'test-key'
process.env.GEMINI_MODEL = 'main-model'
process.env.GEMINI_FALLBACK_MODEL = 'backup-model'
const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

// Answers each call with the next reply in the list and records which model was called.
function fakeFetch(replies) {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ model: url.split('/models/')[1].split(':')[0], body: JSON.parse(options.body) })
    const { status, body } = replies.shift()
    return new Response(JSON.stringify(body), { status })
  }
  return calls
}
const ok = (text) => ({ status: 200, body: { candidates: [{ content: { parts: [{ text }] } }] } })
const busy = { status: 503, body: { error: { message: 'high demand' } } }

test('uses the main model with a low thinking level', async () => {
  const calls = fakeFetch([ok('Hello')])
  assert.equal(await chat({ history: [], message: 'hi', context: '' }), 'Hello')
  assert.equal(calls[0].model, 'main-model')
  assert.equal(calls[0].body.generationConfig.thinkingConfig.thinkingLevel, 'low')
})

test('falls back to the backup model when the main one is busy', async () => {
  const calls = fakeFetch([busy, ok('From backup')])
  assert.equal(await chat({ history: [], message: 'hi', context: '' }), 'From backup')
  assert.deepEqual(calls.map((call) => call.model), ['main-model', 'backup-model'])
})

test('a friendly 503 when both models are busy', async () => {
  fakeFetch([busy, busy])
  await assert.rejects(chat({ history: [], message: 'hi', context: '' }), { status: 503, message: /very busy/ })
})

test('quota errors become a clear 429 and are not retried', async () => {
  const calls = fakeFetch([{ status: 429, body: { error: { message: 'quota' } } }])
  await assert.rejects(chat({ history: [], message: 'hi', context: '' }), { status: 429, message: /free AI quota/ })
  assert.equal(calls.length, 1)
})

test('"thought" parts are not shown to the user', async () => {
  fakeFetch([{ status: 200, body: { candidates: [{ content: { parts: [{ text: 'secret plan', thought: true }, { text: 'Answer' }] } }] } }])
  assert.equal(await chat({ history: [], message: 'hi', context: '' }), 'Answer')
})
