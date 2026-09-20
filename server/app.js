import express from 'express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import authRoutes from './routes/authRoutes.js'
import foodRoutes from './routes/foodRoutes.js'
import savedRoutes from './routes/savedRoutes.js'
import { apiNotFound, errorHandler } from './middleware/errorHandler.js'

const clientDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client')

export function createApp() {
  const app = express()

  // Security headers. The CSP also allows the Google Fonts stylesheet and font files.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:'],
          upgradeInsecureRequests: null,
        },
      },
    }),
  )
  app.use(express.json({ limit: '10kb' }))
  app.use(cookieParser())

  app.use('/api/auth', authRoutes)
  app.use('/api/foods', foodRoutes)
  app.use('/api/saved', savedRoutes)
  app.use('/api', apiNotFound)

  // The frontend: plain HTML, CSS and JavaScript files. "/foods" serves foods.html.
  app.use(express.static(clientDir, { extensions: ['html'] }))
  app.use((req, res) => res.status(404).sendFile(path.join(clientDir, '404.html')))

  app.use(errorHandler)
  return app
}
