import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import request from 'supertest'
import { createApp } from '../app.js'
import { seedFoods } from '../seed/seedFoods.js'

// Starts an in-memory MongoDB so tests never touch a real database.
export async function startTestApp() {
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123'
  process.env.NODE_ENV = 'test'
  const mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  await seedFoods()
  const app = createApp()
  return {
    app,
    api: () => request(app),
    agent: () => request.agent(app), // keeps cookies between requests, like a browser
    async stop() {
      await mongoose.disconnect()
      await mongod.stop()
    },
  }
}
