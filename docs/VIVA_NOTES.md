# ShelfLife: Viva Notes

How the code works, in the order you would explain it, followed by likely questions with answers.
File references are clickable in most editors.

---

## 1. The 30-second pitch

People throw away good food because they are unsure about it. ShelfLife lets you photograph fruit or vegetables
and get one clear call (eat, use soon, cook today or throw out) together with storage advice from our own
food guide. It is a plain HTML/CSS/JS frontend, an Express API, MongoDB Atlas for data and Google Gemini for
image understanding. **The model perceives; our database advises.**

---

## 2. What happens when you open a page

1. Express serves the HTML file (`server/app.js`, `express.static(..., { extensions: ['html'] })`, so `/foods` serves `foods.html`).
2. The page loads one stylesheet (`client/css/style.css`, which `@import`s the layers) and one script, e.g. `client/js/pages/foods.js`.
3. Every page script starts with `await initLayout()` (`client/js/layout.js`). This:
   - calls `initSession()` (`client/js/session.js`), which asks `GET /api/auth/me` who is logged in and, if someone is, `GET /api/saved`;
   - draws the header (different links for visitors, users and admins) and the footer;
   - starts the scroll-reveal effect: elements with the class `reveal` fade up once when they enter the screen
     (an `IntersectionObserver`; without JavaScript or with reduced motion everything is simply visible).
4. The page then fetches its data through `api.get/post/...` (`client/js/api.js`), a small `fetch` wrapper that sends the cookie and turns error responses into an `ApiError` with `status`, `message` and per-field `errors`.
5. HTML is built as strings by helpers in `client/js/ui.js`. **Every value from the API goes through `escapeHtml()`**, which is our XSS protection on the client.

Why no framework? The project has ~11 pages and modest interactivity; plain modules keep it explainable and need no build step.

---

## 3. The backend, layer by layer

```
request → server/app.js → routes/index.js → middleware → controller → helpers (validate) → store → model → MongoDB
                                                                     ↘ services/gemini.js (scanner only)
errors anywhere → throw new AppError(status, message, fieldErrors) → middleware/errorHandler.js → JSON
```

### `server/server.js`: start-up
Loads `.env`, refuses to start if `JWT_SECRET` is shorter than 32 characters, calls `connectDb(MONGODB_URI)`, warns if
`GEMINI_API_KEY` is missing, then `listen()`s.

### `server/db.js`: database connection
- `mongoose.set('sanitizeFilter', true)`: any `$`-operator smuggled into a query filter from user input is neutralised (NoSQL injection).
- `connectDb()`: connects with a 10-second timeout, builds indexes (`syncIndexes`), and on an **empty** database loads the 50 foods from `server/data/foods.json`. An existing database (our Atlas) is updated with `npm run seed`, which upserts by slug.
- Development fallback: if `MONGODB_URI` is empty (and not production) it starts an in-memory MongoDB from the `mongodb-memory-server` dev dependency. The tests use the same trick.

### `server/app.js`: the Express app
In order:
1. **Helmet** security headers, including a Content Security Policy: scripts only from our own origin, styles/fonts from Google Fonts, images may be `data:`/`blob:` (scanner previews). Inline `style=""` attributes are blocked, which is why `applyDataStyles()` in `ui.js` copies `data-at` / `data-value` attributes into CSS variables from JavaScript.
2. **Body size limits:** 4 MB JSON only for `/api/scans` and `/api/admin/images`; 10 KB everywhere else.
3. `cookie-parser`, then `/api/health`, the API router, a JSON 404 for unknown `/api` routes, the static frontend, the HTML 404 page and finally the error handler.
4. `createApp({ ai, limits })` takes the AI service as a parameter (**dependency injection**). Normally it is the real Gemini module; tests pass a fake one.

### `server/routes/index.js`: every URL in one place
Each route lists its middleware, so access rules are visible at a glance:
`router.post('/scans', requireAuth, aiLimit, createScanFromPhoto)`.
`router.use('/admin', requireAuth, requireAdmin)` protects every admin route with one line.

### `server/middleware/`
- **`auth.js`.** `setAuthCookie()` signs a JWT `{ sub: userId }` valid for 7 days and stores it in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production). `requireAuth` verifies the token **and loads the user from MongoDB on every request**, so a deleted user or a removed admin role takes effect immediately. `requireAdmin` checks `req.user.role === 'admin'` (403 otherwise).
- **`rateLimit.js`.** Our own fixed-window limiter. It keeps a `Map` of `key → { count, resetAt }`, where the key is the user id (logged in) or the IP. Over the limit it throws a 429 with a `Retry-After` header. Used on login/register (20 per 15 min) and on AI routes (6 per minute).
- **`errorHandler.js`.** Turns `AppError`s, bad JSON, too-large bodies and Mongoose validation errors into the standard `{ message, errors }` JSON. Anything unexpected is logged and answered with a generic 500, so internals never leak.

### `server/models/`: Mongoose schemas
- **`User`.** `email` has `unique: true` (a MongoDB unique index, so the database itself refuses duplicates) and `lowercase: true`. `passwordHash` has `select: false`, so it is left out of every query unless login explicitly asks for it. `role` is `'user'` or `'admin'`. `savedFoods` is an array of food slugs (embedded, because it is small and always read with the user).
- **`Food`.** Mirrors `foods.json`. `slug` is `unique` and `immutable`, so URLs never break. Category, storage location and freshness status are enums.
- **`Scan`.** One analysed photo: `user` (reference to User, indexed), the verdict fields, and a ~160px thumbnail as a data URL for the history list. The full photo is **not** stored.
- `toPublicFood` / `publicUser` / `toPublicScan` decide exactly which fields the browser sees.

### `server/store/`: data access
Controllers never call Mongoose directly; they call functions like `listFoods()`, `findUserByEmail()` or `createScan()`.
This is the same design as version 1 (which used JSON files), which is why switching to MongoDB barely touched the controllers.
Notable details:
- Search builds `new RegExp(escapeRegex(text), 'i')`, so typing `.*` searches for those characters literally.
- `addSavedFood` uses `$addToSet` and `removeSavedFood` uses `$pull`: single atomic updates, so double clicks cannot create duplicates.
- `deleteFood` also runs `User.updateMany({ savedFoods: slug }, { $pull: ... })`, so no one keeps a dangling saved item.
- Admin statistics use **aggregation pipelines** (`$unwind` + `$group` for most-saved foods, `$dateToString` + `$group` for scans per day).

### `server/utils/helpers.js`
`AppError`, all validation (`validateRegistration`, `validateLogin`, `validateFoodQuery`, `validateFood`) and
`parseImageDataUrl()`, which accepts only JPEG/PNG/WebP, enforces a size limit and checks the file's **magic bytes**
(for example JPEG starts with `FF D8 FF`) so a renamed text file is rejected.

---

## 4. The AI freshness scanner (the main new feature)

### In the browser: `client/js/pages/scan.js`, `client/js/image.js`, `client/js/scan-ui.js`
1. The user takes a photo (`<input capture="environment">` opens the rear camera on phones), chooses a file, drags one in or pastes one.
2. `preparePhoto()` decodes it with `createImageBitmap` (which also fixes phone rotation), draws it on a `<canvas>` at most 1024px wide and exports a JPEG (~150 KB instead of several MB), plus a 160px thumbnail.
3. The page is an **instrument with a visible state**. `setStage(state, text)` in `scan.js` writes one attribute,
   `data-state` on `#stage`, and the CSS (`client/css/scan.css`) shows the right thing for each state:
   `idle` (empty viewfinder with Take / Choose photo) → `preparing` (photo blurred while it is shrunk) →
   `analysing` (the scan line moves **only while the real request is running**) → `done` (corners turn green, status line
   names the result) or `error` (photo greyed out, the server's message, **Try again** resends the same prepared photo).
   No progress percentage is shown, because we don't know one. Then `POST /api/scans { image, thumbnail }`.
4. `verdictHtml()` (`client/js/scan-ui.js`) draws the result card in a fixed order: the item and the call, the freshness
   score and ripeness scale, **What the scanner saw** (summary, signs, mould), **What to do** (recommendation, time left),
   and **"From the ShelfLife guide"**, which is our database record. Nothing is filled in when the model left a value out.
5. Follow-up questions go to `POST /api/assistant` with the last 8 turns and the `scanId`.

### On the server: `server/controllers/scanController.js` + `server/services/gemini.js`
1. `createScanFromPhoto` validates the image, loads a compact **catalog** of our foods (`slug`, `name`, `category`) and calls `ai.analyseImage(image, catalog)`.
2. `analyseImage` sends one `generateContent` request to Gemini with:
   - a **system instruction** (rules: describe only what is visible, how to judge ripeness and mould, never claim safety);
   - the photo as `inlineData` (base64);
   - `responseMimeType: 'application/json'` plus a **`responseSchema`**. This is *structured output*: Gemini must return exactly our fields, and `matchedFoodId` must be one of our slugs (an `enum` built from the catalog) or `"none"`.
   - `temperature: 0.2` for consistent answers, and `thinkingLevel: 'low'` so the model doesn't spend long "thinking" (answers in seconds).
   - Main model `gemini-3.5-flash`; if Google says it is overloaded, or it doesn't answer within 25 s, the request is retried once on `gemini-3.8-flash`.
   The API key travels in the `x-goog-api-key` header from our server; the browser never sees it.
3. `normaliseVerdict()` **does not trust the model**: unknown enum values fall back to safe defaults, the score is clamped to 0–100, text is trimmed and shortened, and our own **safety rule** overrides the model: *visible mould on soft food ⇒ "discard"* (and a spoiled ripeness ⇒ discard).
4. Non-food photos (`isFood: false`) are answered with a message and not saved.
5. The scan is saved, the matching food record is fetched, and both are returned. This is **grounding**: the advice text comes from our database, not from the model.

### The assistant (`askAssistant`)
Builds a context block from the user's scan (looked up by id **and** owner) plus the ShelfLife records of any food
named in the question or matched by the scan. This is a simple form of **retrieval-augmented generation (RAG)**: retrieve
relevant records, put them in the prompt, ask the model to base its answer on them. History is capped at 10 turns and
1,500 characters per turn to keep requests small.

### Error handling
| Situation | What the user sees |
| --- | --- |
| No API key on the server | Scanner page notice; API answers 503 "not set up yet" |
| Free quota used up (Gemini 429) | "The free AI quota is used up for the moment. Please try again in a minute." |
| Wrong key / model (400/403) | 502 "check GEMINI_API_KEY and GEMINI_MODEL" (detail logged on the server only) |
| Main model busy (503) or silent for 25 s | Automatically retried once on the backup model (`GEMINI_FALLBACK_MODEL`) |
| Both models busy / slow | 503 "very busy right now" or 504 "took too long" |
| Safety-filtered / empty answer | 422 "Try a clearer photo" |
| Our rate limit | 429 "You are going a bit fast" |
Photo errors switch the instrument to its `error` state with a **Try again** button; question errors show in the chat with their own **Try again** button.

---

## 5. Saved foods: the fridge (`client/saved.html`, `client/js/pages/saved.js`, `client/css/fridge.css`)

- **Data.** `loadFridge()` fetches `GET /api/saved` (the user's saved foods) and `GET /api/scans` (their last 30 scans) with
  `Promise.allSettled`, so the fridge still opens if scans fail. For each food the newest scan with that `matchedFood` is
  remembered and shown in its detail panel. Saved foods are **bookmarks**, not real inventory, and the page says so.
- **Drawing.** `renderFridge()` puts each food on the shelf for its category: dairy on top, fruits in the middle,
  pantry and grains below, vegetables in the crisper drawer. The look is layered CSS: dark brushed-steel cabinet, a bright
  back wall that fades into shadow, side walls drawn as trapezoids (`clip-path`) so the inside looks deep, white LED strips
  (a white line with a large `box-shadow` glow), glass shelves with a bright front edge and a cast shadow, a faint reflection
  under each food (`-webkit-box-reflect`) and a frosted drawer front (`backdrop-filter: blur`). Each food is a real `<button>` with its cut-out photo,
  so keyboard users can Tab to it and press Enter; screen readers hear "Milk, highly perishable. Open details".
- **The 3D.** Pure CSS. The cabinet has `perspective`; each door is a `div` with `transform-style: preserve-3d` and two faces
  (`.door-front` brushed steel with a handle, `.door-back` the white liner, turned with `rotateY(180deg)` and hidden with
  `backface-visibility`). When the data has loaded, JavaScript sets `data-state="open"` and the CSS transition turns the doors
  `rotateY(±100deg)` around their hinges. At the same moment a dark overlay inside fades out, which looks like the interior
  light switching on, and the foods appear one after another (`animation-delay` from a `--i` variable set in JavaScript,
  because the CSP blocks inline styles). With reduced motion the doors are simply open.
- **Hover / focus** lifts the food (`translateY` + `scale`, transform only) and shows its name and status (the ripeness of the
  last scan if there is one, otherwise how perishable it is). On touch screens the label is hidden and a tap opens the panel.
- **Detail panel.** A native `<dialog>` (`showModal()` traps focus, Escape closes it, focus returns to the food).
  It shows the guide data, the user's latest scan of that food (or says there is none) and actions: full guide, scan one
  now, and **Remove from saved** (two clicks, then a toast with **Undo**, which saves it again through the same API).
- **States.** Loading (doors closed, "Opening your fridge…"), error (doors closed, message, Try again), logged out (login
  prompt), empty (a note on the back wall), many foods (the interior scrolls).

---

## 6. The design system (`client/css/tokens.css` and the files it feeds)

- Everything visual is a **token** (CSS custom property): colours, two fonts, a type scale, a 4px spacing scale, radii,
  shadows for floating things only, motion timings. Pages never use raw colour values, except the fridge materials.
- Brand idea: **"a second look"**. Colour blocks of deep ink, ivory, tomato red, citrus yellow, orange and botanical green,
  one per section, so the page has rhythm. Archivo (expanded, heavy) for headings, Instrument Sans for everything else.
  The motif is the scanner **lens** (a circle with reticle marks), used only where something is being looked at.
  Buttons are pills (`border-radius: 999px`), panels are crisp.
- The **ripeness scale** colours mean freshness and nothing else. They are never used as decoration or chart colours.
- Food photos are real, licensed photographs (Wikimedia Commons / Openverse). During development each one was processed
  the same way with an open-source background-removal model: cut out, edges cleaned, centred at the same scale on an
  800×800 transparent square with the same soft shadow (`client/images/foods/`). On the site every photo sits on one shared
  warm studio background, the `.food-frame` class in `components.css`, so all 50 foods look like one photo series.
  A tightly cropped copy (`client/images/fridge/`) lets each food stand on a fridge shelf; if one is missing (a food added
  later by an admin), `data-fallback` in `saved.js` and the image error listener in `ui.js` switch to the normal photo.
  Every photo is credited in `docs/PHOTO_CREDITS.md`. Produce photos appear only as scanner input or as food-guide reference, as the
  mid-sem feedback asked.
- CSS is split into layers imported by `style.css`: tokens → base → components → pages → scan → fridge → admin.

---

## 7. The admin console (`client/admin.html`, `client/js/pages/admin.js`, `server/controllers/adminController.js`)

- The page hides itself for non-admins, but **the real protection is on the server**: every `/api/admin/*` route runs `requireAuth` + `requireAdmin`. Hiding a button is never security.
- **Overview.** `GET /api/admin/stats` runs counts and aggregations in parallel with `Promise.all`. The charts are plain HTML bars in one colour, each labelled with text (a recommendation tag or food name) and a value, with a tooltip and a hidden data table for screen readers.
- **Foods.** A native `<dialog>` form. Lists are typed one per line; stages as `Label: description`. The server's `validateFood()` returns per-field errors that appear under each input. Photo upload: the image is resized in the browser, `POST /api/admin/images` checks it and saves it under a **random UUID file name** chosen by the server (no path tricks possible).
- **Users.** Promote/demote and delete, with two-step confirmation in the button itself. The server refuses to let an admin demote or delete themselves, so the system can never lose its last admin by accident.
- **Scans.** Recent scans with `populate('user', 'name email')` to show who scanned what.

Making the first admin: sign up on the site, then `npm run make-admin -- you@example.com`.

---

## 8. Design decisions worth defending

| Decision | Reason |
| --- | --- |
| Vanilla JS, no React | Small app; no build step; every line is explainable; the stores/controllers pattern gives structure without a framework |
| MongoDB over SQL | Foods are naturally nested documents (lists of tips, stages, shelf-life object); flexible for admin-added fields; Atlas free tier |
| Mongoose | Schemas = validation + documentation (they map directly to the class diagram) |
| Gemini via REST, no SDK | One `fetch` call is easy to read and avoids a dependency |
| Gemini instead of training our own model | A CNN trained on a Kaggle fresh/rotten set needs Python, a GPU and only covers ~6 fruits with two labels; Gemini gives ripeness stages, mould location, a score and conversation for free |
| Hybrid / grounded design | The model can describe a photo, but the advice must be consistent and checkable, so it comes from our curated database |
| Structured output (JSON schema) | No fragile text parsing; the response always has our fields |
| Our own safety rule after the model | Models can be wrong; the rule that matters most for safety is enforced in code we control |
| Resize photos in the browser | Faster uploads on mobile data, smaller requests, less quota |
| Cookie (httpOnly) instead of localStorage for the token | JavaScript, including injected scripts, can't read it |
| Role loaded from DB each request | Role changes and deletions apply instantly |
| Dependency-injected AI service | Tests run offline, are repeatable and cost nothing |
| Fridge in CSS 3D instead of a 3D library (three.js) | No dependency, nothing to download, works with keyboard and screen readers because every food is a normal button; real photos give the realism |
| Real licensed photos instead of AI-generated images | Honest reference images for a food guide, free, and every one is credited |

---

## 9. Likely viva questions

**Q: Is the AI deciding whether food is safe?**
No. It judges visible quality only. A photo cannot show smell, temperature history or bacteria. The UI says this
on every result, and our code forces "discard" whenever mould is seen on soft food, whatever the model says.

**Q: What is grounding / RAG here?**
We retrieve our own food records (by the matched slug, or by food names in the question) and put them in the prompt or
next to the result. The model's job is perception and conversation; the facts come from our database.

**Q: What if Gemini returns something unexpected?**
Structured output already constrains it, and `normaliseVerdict()` whitelists every enum, clamps numbers and trims text.
Invalid output becomes safe defaults ("unknown", "unsure", "low" confidence). There is a test for exactly this.

**Q: How do you stop someone calling the admin API directly?**
The browser check is cosmetic. `router.use('/admin', requireAuth, requireAdmin)` runs on the server for every admin URL,
using the role stored in MongoDB, which a user cannot change. Tests check that visitors get 401 and users get 403.

**Q: How are passwords stored?**
bcrypt with 12 salt rounds. Only the hash is stored, it's excluded from queries by `select: false`, and it is never sent to
the browser. Login does the same bcrypt work for unknown emails (`DUMMY_HASH`) so timing doesn't reveal which emails exist.

**Q: What is NoSQL injection and how do you prevent it?**
Sending `{"email": {"$gt": ""}}` could match any user if passed straight into a query. Our validators require strings, and
Mongoose's `sanitizeFilter` neutralises `$` operators in filters. There is a test that sends exactly this payload.

**Q: Why is there a body limit, and why two?**
To stop huge requests from using memory. Normal JSON is tiny (10 KB); only photo uploads need more (4 MB).

**Q: What does the Content Security Policy do?**
It tells the browser to run scripts only from our own server and blocks inline scripts and styles, so even if text slipped
through unescaped, injected `<script>` would not execute.

**Q: How does the rate limiter work and what are its limits?**
A fixed window per user/IP stored in a `Map`. It is simple and enough for one server; with several servers we would move the
counts to a shared store like Redis.

**Q: Why store saved foods inside the user document?**
A user saves a few foods, and we always need them together with the user. Embedding avoids a join, and `$addToSet`/`$pull`
are atomic.

**Q: How does search work?**
`GET /api/foods?search=ban&category=Fruits` becomes a Mongo filter `{ category: 'Fruits', name: /ban/i }`. The client waits
250 ms after typing (debounce) and ignores out-of-date responses (`latestRequest` counter in `foods.js`).

**Q: How did you test it?**
39 API tests with Node's built-in runner against a real (in-memory) MongoDB and a fake AI, and 11 Playwright browser
journeys run on desktop and mobile sizes (22 runs), including the fridge with keyboard, remove and undo. See section 11 of `PROJECT_STATUS.md`.

**Q: How does the fridge animation work without a 3D library?**
CSS 3D transforms. The cabinet sets `perspective`, each door rotates around its hinge with `rotateY`, and
`backface-visibility` shows the inside of the door once it has turned past 90°. JavaScript only sets `data-state="open"`
after the saved foods have loaded; the CSS transition does the rest. Only `transform` and `opacity` are animated, so it stays smooth.

**Q: Does the fridge know what is in my real fridge?**
No. It shows the foods you saved from the guide (bookmarks). The page says this. Tracking real inventory with purchase dates is future work.

**Q: Where do the 50 food photos come from? Are they AI-generated?**
They are real photographs from Wikimedia Commons and Openverse under free licences (CC0, public domain, CC BY, CC BY-SA),
cut out from their backgrounds during development. Every photo is credited in `docs/PHOTO_CREDITS.md`, with its author and licence.

**Q: How much does it cost to run?**
Nothing: MongoDB Atlas M0 and Gemini's free tier. Rate limits protect the free quota.

**Q: How accurate is the scanner?**
We measured it. `npm run eval` (`scripts/evaluate-scanner.js`) sends labelled photos (`eval/labels.json`) through the
real scanner code, the same prompt and the same `normaliseVerdict()` safety rule, and compares each answer with the
label a person chose. On the first 20 of 26 photos it named the right food 20 times, the right ripeness 20 times and the
right recommendation 19 times. It caught both "must discard" photos scored so far and never told anyone to throw out
usable food. The one miss was green bananas: it said "use soon", because our recommendation list has no "wait until ripe"
option. The free daily quota (about 20 requests per model) stopped the run, so 6 rotten or mouldy photos are still to be
scored with `npm run eval -- --resume`. Twenty photos is a rough indicator, not a benchmark.

**Q: Why not just trust the tests for accuracy?**
The tests use a fake AI on purpose, so they are free, offline and repeatable. That proves our code handles every kind of
answer, but says nothing about whether the real model sees correctly. The evaluation is the separate check for that.

**Q: What would you do next?**
A pantry tracker with purchase dates and reminders (the fridge could then show real inventory), more foods, an installable PWA,
finishing the scanner evaluation on a larger labelled set, a "wait until ripe" recommendation, and deployment.

---

## 10. Demo script (5 minutes)

1. Home page: "One scan closer to a smarter kitchen." The tomatoes sit inside the scanner lens and an example reading appears:
   the photo is shown *as an input being analysed*, never as decoration. Scroll to the ripeness scale, pick Tomato and drag
   the slider: the stages come from our database. The four colour blocks below are the guide's categories with real counts.
2. Food guide: 50 foods. Search "mil", filter Dairy, open Milk; show the shelf-life table and stages.
3. Log in, open the scanner, take a photo of a real fruit (bring a spotty banana!). Show the verdict, the ripeness scale and "From the ShelfLife guide".
4. Tap "Can I still cook with it?" to show the grounded answer.
5. Save two or three foods, open **Saved**: the fridge doors open. Hover a food, click it to show the detail panel with your
   latest scan, remove it and press Undo. Then the Scan history tab.
6. Log in as admin: overview charts, add a food (e.g. Jackfruit, which is not in the guide yet), show it in the public guide, delete it.
7. If asked about security: open DevTools → Application → Cookies and show the `HttpOnly` flag; try `/api/admin/stats` as a normal user and show the 403.
