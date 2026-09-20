import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { createApp } from '../app.js'
import { loadUsers } from '../store/userStore.js'

// Each test file gets its own temporary users file, so tests never touch real data.
export async function startTestApp() {
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123'
  process.env.NODE_ENV = 'test'
  const dir = await mkdtemp(path.join(os.tmpdir(), 'shelflife-test-'))
  const usersFile = path.join(dir, 'users.json')
  await loadUsers(usersFile)
  const app = createApp()
  return {
    app,
    usersFile,
    api: () => request(app),
    agent: () => request.agent(app), // keeps cookies between requests, like a browser
    stop: () => rm(dir, { recursive: true, force: true }),
  }
}
