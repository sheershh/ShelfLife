import express from 'express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRouter } from './routes/index.js'
import { apiNotFound, errorHandler } from './middleware/errorHandler.js'
import * as gemini from './services/gemini.js'

const clientDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client')

// Builds the Express app. Options are only used by the tests:
//   ai     - the AI service (defaults to Gemini; tests pass a fake so no real API calls are made)
//   limits - rate-limit overrides
export function createApp({ ai = gemini, limits } = {}) {
  const app = express()
  app.locals.ai = ai

  // Security headers. The CSP only allows our own scripts; styles and fonts may also come from
  // Google Fonts. Images may be data: or blob: URLs (photo previews in the scanner).
  // The browser never talks to Gemini directly: the API key stays on the server.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          upgradeInsecureRequests: null,
        },
      },
    }),
  )

  // Photo uploads need a bigger body limit, but only on these two routes.
  // Every other request is limited to 10 KB.
  app.use(['/api/scans', '/api/admin/images'], express.json({ limit: '4mb' }))
  app.use(express.json({ limit: '10kb' }))
  app.use(cookieParser())

  app.get('/api/health', (req, res) => res.json({ ok: true, ai: ai.isConfigured() }))
  app.use('/api', createRouter(limits))
  app.use('/api', apiNotFound)

  // The frontend: plain HTML, CSS and JavaScript files. "/foods" serves foods.html.
  app.use(express.static(clientDir, { extensions: ['html'] }))
  app.use((req, res) => res.status(404).sendFile(path.join(clientDir, '404.html')))

  app.use(errorHandler)
  return app
}
