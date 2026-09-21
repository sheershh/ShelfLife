# ShelfLife

A food shelf-life guide. Users can browse foods, see estimated shelf life and storage advice, create an account, and save foods to their own list.

- **Frontend:** plain HTML, CSS and vanilla JavaScript (`client/`)
- **Backend:** Node.js and Express (`server/`). Foods are read from `server/data/foods.json`; accounts and saved foods are stored in `server/data/users.json` (created automatically).

## Run it

1. Install packages and create your settings file:
   ```
   npm install
   cp .env.example .env
   ```
2. Edit `.env` and set `JWT_SECRET` to a long random string (the file explains how to generate one).
3. Start the server and open http://localhost:3000:
   ```
   npm start        # or: npm run dev  (restarts on file changes)
   ```

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
server/   app.js, server.js, routes/index.js, controllers/, middleware/, store/, data/, utils/helpers.js
```
