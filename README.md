# ShelfLife

Know what's still good. ShelfLife is a food freshness web app:

- **Freshness scanner.** Upload or take a photo of fruit or vegetables. ShelfLife returns a ripeness reading, a mould check, a freshness score and one clear recommendation, grounded in its own food guide. You can then ask follow-up questions in a chat.
- **Food guide.** Shelf life by storage condition, storage tips, freshness stages and spoilage signs for everyday foods.
- **Accounts.** Save foods to "your shelf" and keep a history of scans.
- **Admin console.** Add, edit and delete foods (with photo upload), manage users and roles, and see scanner activity.

| Layer | Technology |
| --- | --- |
| Frontend | Plain HTML, CSS and JavaScript (ES modules). No framework, no build step |
| Backend | Node.js 20+, Express 5 |
| Database | MongoDB Atlas through Mongoose |
| AI | Google Gemini (free tier) via its REST API, called only from the server |
| Auth | bcrypt password hashes, JWT in an httpOnly cookie |
| Tests | Node's built-in test runner (API) and Playwright (browser) |

Read [`docs/VIVA_NOTES.md`](docs/VIVA_NOTES.md) for a walkthrough of how the code works, and
[`PROJECT_STATUS.md`](PROJECT_STATUS.md) for the full reference (architecture, data model, API, flows, security).

## Run it

```bash
npm install
cp .env.example .env      # then fill in the values (see below)
npm run dev               # http://localhost:3000, restarts on file changes
```

`.env` needs:

| Variable | Where it comes from |
| --- | --- |
| `JWT_SECRET` | Any long random string: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `MONGODB_URI` | MongoDB Atlas, free M0 cluster (steps below). If empty in development, a temporary in-memory database is used. |
| `GEMINI_API_KEY` | Google AI Studio, free (steps below). If empty, the scanner page says it is not set up; everything else works. |
| `GEMINI_MODEL` | Optional, defaults to `gemini-3.5-flash` (falls back to `gemini-3.8-flash` when busy). |

On first start with an empty database the 12 starter foods are loaded from `server/data/foods.json` automatically.

### MongoDB Atlas (free, no card)

1. Sign up at https://www.mongodb.com/cloud/atlas/register and create a **Free (M0)** cluster (AWS, Mumbai `ap-south-1` is closest for India).
2. **Database Access** → Add new database user → username + password (Built-in role: *Read and write to any database*).
3. **Network Access** → Add IP address → *Add current IP address* (or `0.0.0.0/0` while presenting from different networks).
4. **Clusters** → Connect → Drivers → copy the `mongodb+srv://...` string. Replace `<db_password>` with the password and put `shelflife` before the `?`. Paste it as `MONGODB_URI` in `.env`.

### Gemini API key (free tier)

1. Open https://aistudio.google.com/apikey and sign in with a Google account.
2. Click **Create API key** and paste it as `GEMINI_API_KEY` in `.env`.
3. Do **not** click "Set up billing". The free tier is enough for a demo; when it is used up the scanner shows "try again in a minute".

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` / `npm run dev` | Start the server (dev restarts on changes) |
| `npm test` | 39 API tests (in-memory MongoDB, fake AI, no internet needed) |
| `npm run test:e2e` | 10 browser journeys on desktop and mobile (Playwright) |
| `npm run seed` | Re-load `server/data/foods.json` into the database (updates, never deletes admin-added foods) |
| `npm run make-admin -- you@example.com` | Give an existing account the admin role |
| `npm run migrate-users` | One-time copy of accounts from the old `server/data/users.json` into MongoDB |

## Folders

```
client/                 the website (served as static files)
  *.html                one file per page (index, foods, food, scan, saved, recipes, about, login, signup, admin, 404)
  css/                  style.css imports tokens, base, components, pages, scan, admin
  js/                   api, session, layout, ui, icons, image, scan-ui, constants, auth-form
  js/pages/             one script per page
server/
  server.js             entry point: checks settings, connects to MongoDB, starts Express
  app.js                security headers, body limits, routes, static files, error handler
  db.js                 Mongoose connection, NoSQL-injection protection, first-run seeding
  models/               Mongoose schemas: User, Food, Scan
  routes/index.js       every API URL in one place, with its middleware
  middleware/           auth (requireAuth, requireAdmin), rateLimit, errorHandler
  controllers/          auth, food, saved, scan (AI), admin
  services/gemini.js    the only file that talks to Gemini
  store/                data-access functions used by controllers
  utils/helpers.js      validation rules, AppError, image checks
  data/                 foods.json and recipes.json (seed data)
scripts/                seed, make-admin, migrate-users
tests/                  API tests; tests/e2e/ browser tests
docs/VIVA_NOTES.md      how everything works, for the viva
```
