# ShelfLife

Know what's still good. ShelfLife is a food freshness web app:

- **Freshness scanner.** Upload or take a photo of fruit or vegetables. ShelfLife returns a ripeness reading, a mould check, a freshness score and one clear recommendation, grounded in its own food guide. You can then ask follow-up questions in a chat.
- **Food guide.** Shelf life by storage condition, storage tips, freshness stages and spoilage signs for 50 everyday foods (fruits, vegetables, dairy, pantry staples, including Indian kitchen staples such as paneer, okra, ghee and atta).
- **Accounts.** Save foods and see them on the shelves of an interactive fridge, and keep a history of scans.
- **Use-by clock.** Tell ShelfLife when you bought a saved food and where you keep it. It counts down the days from the guide's shelf-life figure (the low end of the range), tags the fridge shelves and warns about food to use first.
- **Used / thrown away, insights and shopping list.** Mark a food as used or thrown away to see your last 30 days. A shopping list moves guide foods onto your shelves, bought today, when ticked off.
- **Add groceries.** Photograph a receipt (AI) or scan a barcode (browser `BarcodeDetector` plus Open Food Facts, with a typed fallback) to fill the fridge.
- **Recipes for what you have.** AI recipe ideas that use the foods closest to their limit (falls back to the guide's ideas without an API key).
- **Nutrition diary.** Log foods by meal (grams, with quick serving buttons, or a custom entry) and track calories, carbs, fat and protein against daily goals. See where your calories come from, the last 7 days, and log a food straight from the food page, a scan or your fridge. All 50 guide foods carry general per-100 g nutrition figures (rounded USDA and Indian food-composition values: estimates, not label data).
- **Guide filters.** Search plus category, best-kept location, keeps-for and sort by shelf life.
- **Scanner with up to 3 photos** of one item and a confidence meter that suggests what to do when the reading is not firm.
- **Installable (PWA).** Web app manifest and a service worker; the food guide stays readable offline. Personal data is never cached.
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

On first start with an empty database the 50 starter foods are loaded from `server/data/foods.json` automatically.
An existing database is updated with `npm run seed` (see Scripts).

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
| `npm run test:e2e` | 11 browser journeys on desktop and mobile (Playwright) |
| `npm run seed` | Load `server/data/foods.json` into the database: adds new foods, overwrites foods with the same id (admin edits to those foods are replaced) and removes the retired foods listed in `scripts/seed.js` (oats, chapati, poha); never deletes admin-added foods |
| `npm run make-admin -- you@example.com` | Give an existing account the admin role |
| `npm run migrate-users` | One-time copy of accounts from the old `server/data/users.json` into MongoDB |
| `npm run eval` | Score the real scanner on the labelled photos in `eval/` (uses free Gemini quota; `-- 2` for the first 2 photos, `-- --resume` to continue a run). Results in `eval/results.json` |

## Folders

```
client/                 the website (served as static files)
  *.html                one file per page (index, foods, food, scan, saved, recipes, about, login, signup, admin, 404)
  css/                  style.css imports tokens, base, components, pages, scan, fridge, admin
  images/foods/         one studio photo per food: 800x800 transparent WebP, same scale and shadow (credits in docs/PHOTO_CREDITS.md)
  images/fridge/        the same foods cropped tightly so they can stand on the fridge shelves
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
scripts/                seed, make-admin, migrate-users, evaluate-scanner
eval/                   labelled photos (labels.json, photos/) and the latest scanner results (results.json)
tests/                  API tests; tests/e2e/ browser tests
docs/VIVA_NOTES.md      how everything works, for the viva
```
