# ShelfLife

A food shelf-life guide. Users can browse foods, see estimated shelf life and storage advice, create an account, and save foods to their own list.

- **Frontend:** plain HTML, CSS and vanilla JavaScript (`client/`)
- **Backend:** Node.js, Express, MongoDB with Mongoose (`server/`)

## Run it

1. Have a MongoDB database ready: a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster, or MongoDB installed locally.
2. Install packages and create your settings file:
   ```
   npm install
   cp .env.example .env
   ```
3. Edit `.env`: set `MONGODB_URI` to your connection string and `JWT_SECRET` to a long random string.
4. Load the food data (safe to run more than once):
   ```
   npm run seed
   ```
5. Start the server and open http://localhost:3000:
   ```
   npm start        # or: npm run dev  (restarts on file changes)
   ```

`npm test` runs the API tests. They use a temporary in-memory database, so they never touch your real data.

## API

| Method | Route | Login needed | Purpose |
| --- | --- | --- | --- |
| GET | `/api/foods?search=&category=` | No | List foods, optionally filtered |
| GET | `/api/foods/:id` | No | One food, e.g. `/api/foods/banana` |
| POST | `/api/auth/register` | No | Create an account (also logs in) |
| POST | `/api/auth/login` | No | Log in |
| POST | `/api/auth/logout` | No | Log out |
| GET | `/api/auth/me` | No | Current user, or `null` |
| GET | `/api/saved` | Yes | The user's saved foods |
| POST | `/api/saved/:id` | Yes | Save a food |
| DELETE | `/api/saved/:id` | Yes | Remove a saved food |

Errors are always JSON: `{ "message": "...", "errors": { "field": "..." } }`.

## Folders

```
client/   pages (*.html), css/, js/ (api, session, layout, ui, pages/), images/
server/   app.js, server.js, config/, models/, routes/, controllers/, middleware/, utils/, seed/, tests/
```
