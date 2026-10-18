// npm run eval            (all labelled photos)
// npm run eval -- 2       (only the first 2 photos, to check the setup before spending quota)
// npm run eval -- --resume (keep the photos already scored in eval/results.json, run only the rest;
//                           useful when the free daily quota ran out part-way)
//
// Measures how often the freshness scanner gets labelled photos right.
// It uses the REAL scanner code: the same Gemini prompt and schema (services/gemini.js) and the same
// clean-up and safety rule (normaliseVerdict in scanController.js). So the numbers describe what users see.
//
// Input:  eval/labels.json, one entry per photo with the answer a person decided on.
// Output: a printed summary and eval/results.json.
// It never touches MongoDB: the food catalogue is read from server/data/foods.json.
// Each photo is one free-tier Gemini request, so photos are sent slowly (one every 12 seconds).
import 'dotenv/config'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { analyseImage, isConfigured } from '../server/services/gemini.js'
import { normaliseVerdict } from '../server/controllers/scanController.js'
import { parseImageDataUrl } from '../server/utils/helpers.js'

const ROOT = new URL('..', import.meta.url)
const LABELS_FILE = new URL('eval/labels.json', ROOT)
const RESULTS_FILE = new URL('eval/results.json', ROOT)
const FOODS_FILE = new URL('server/data/foods.json', ROOT)

const PAUSE_MS = 12_000 // 5 photos a minute, below our own limit of 6 per minute
const MAX_BYTES = 2.5 * 1024 * 1024 // same limit as real uploads
const STOP_AFTER_FAILURES = 3 // stop early if Gemini keeps failing (busy or quota used up)
const RIPENESS_ORDER = ['unripe', 'ripe', 'overripe', 'spoiled', 'unknown']

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
const asList = (value) => (Array.isArray(value) ? value : [value])
const percent = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : 'n/a')
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Reads one photo and checks it exactly like the upload route does (type, size, magic bytes).
async function loadPhoto(file) {
  const type = MIME[file.split('.').pop().toLowerCase()]
  const bytes = await readFile(new URL(file, ROOT))
  const { mimeType, data } = parseImageDataUrl(`data:${type};base64,${bytes.toString('base64')}`, { maxBytes: MAX_BYTES })
  return { mimeType, data }
}

// Compares one scanner verdict with its label. `verdict` is null when the scanner said "not food".
// A label may list several acceptable answers, e.g. an overripe banana: ["use-soon", "cook-today"].
export function compare(label, verdict) {
  const got = verdict ?? { matchedFood: null, ripeness: 'unknown', mould: { detected: false }, recommendation: 'unsure' }
  return {
    file: label.file,
    expected: { food: label.food, ripeness: label.ripeness, mould: label.mould, recommendation: label.recommendation },
    got: {
      food: got.matchedFood ?? 'none',
      ripeness: got.ripeness,
      mould: got.mould.detected,
      recommendation: got.recommendation,
      score: got.freshnessScore,
      confidence: got.confidence,
    },
    foodOk: asList(label.food).includes(got.matchedFood ?? 'none'),
    ripenessOk: asList(label.ripeness).includes(got.ripeness),
    // mould: null in a label means a person could not tell from the photo, so it is not scored.
    mouldOk: label.mould === null ? null : label.mould === got.mould.detected,
    recommendationOk: asList(label.recommendation).includes(got.recommendation),
    mustDiscard: asList(label.recommendation).every((r) => r === 'discard'),
    saidDiscard: got.recommendation === 'discard',
  }
}

// Turns the per-photo rows into the headline numbers.
export function summarise(rows) {
  const count = (test) => rows.filter(test).length
  const mustDiscard = rows.filter((r) => r.mustDiscard)
  const fineToKeep = rows.filter((r) => !r.mustDiscard)
  const mouldScored = rows.filter((r) => r.mouldOk !== null)

  // Confusion table: rows = the label's ripeness, columns = what the scanner said.
  const confusion = {}
  for (const row of rows) {
    const expected = asList(row.expected.ripeness)[0]
    confusion[expected] ??= Object.fromEntries(RIPENESS_ORDER.map((r) => [r, 0]))
    confusion[expected][row.got.ripeness] += 1
  }

  return {
    photos: rows.length,
    foodMatch: percent(count((r) => r.foodOk), rows.length),
    ripeness: percent(count((r) => r.ripenessOk), rows.length),
    mould: percent(count((r) => r.mouldOk === true), mouldScored.length),
    recommendation: percent(count((r) => r.recommendationOk), rows.length),
    // Of the photos a person said must be thrown out, how many did the scanner also say "discard"?
    discardCaught: `${count((r) => r.mustDiscard && r.saidDiscard)} of ${mustDiscard.length}`,
    // Of the photos that were still usable, how many did the scanner wrongly say "discard"?
    falseDiscard: `${count((r) => !r.mustDiscard && r.saidDiscard)} of ${fineToKeep.length}`,
    confusion,
  }
}

async function main() {
  if (!isConfigured()) {
    console.error('GEMINI_API_KEY is not set in .env, so the scanner cannot be evaluated.')
    process.exit(1)
  }
  const args = process.argv.slice(2)
  const limit = Number(args.find((arg) => /^\d+$/.test(arg))) || Infinity
  let labels = JSON.parse(await readFile(LABELS_FILE, 'utf8')).slice(0, limit)

  // --resume: start from the rows of the previous run and skip the photos they already cover.
  const rows = []
  if (args.includes('--resume')) {
    const previous = JSON.parse(await readFile(RESULTS_FILE, 'utf8').catch(() => '{"rows":[]}'))
    const done = new Set(previous.rows.map((row) => row.file))
    rows.push(...previous.rows.filter((row) => labels.some((label) => label.file === row.file)))
    labels = labels.filter((label) => !done.has(label.file))
    console.log(`Resuming: ${rows.length} photo(s) already scored, ${labels.length} to go.`)
  }
  const catalog = JSON.parse(await readFile(FOODS_FILE, 'utf8'))
    .map(({ slug, name, category }) => ({ slug, name, category }))

  const failed = []
  let failuresInARow = 0

  for (const [index, label] of labels.entries()) {
    if (index > 0) await wait(PAUSE_MS)
    process.stdout.write(`[${index + 1}/${labels.length}] ${label.file} ... `)
    try {
      const raw = await analyseImage(await loadPhoto(label.file), catalog)
      const matched = catalog.find((food) => food.slug === raw.matchedFoodId)
      const verdict = raw.isFood === true ? normaliseVerdict(raw, catalog, matched?.category) : null
      const row = compare(label, verdict)
      rows.push(row)
      failuresInARow = 0
      console.log(`${row.got.food}, ${row.got.ripeness}, ${row.got.recommendation}${row.recommendationOk ? '' : '  <- differs'}`)
    } catch (error) {
      failed.push({ file: label.file, error: error.message })
      failuresInARow += 1
      console.log(`failed: ${error.message}`)
      if (failuresInARow >= STOP_AFTER_FAILURES) {
        console.log('Gemini failed several times in a row, stopping early. Try again later.')
        break
      }
    }
  }

  const summary = summarise(rows)
  console.log('\nSummary')
  console.table({
    'Photos scored': summary.photos,
    'Right food': summary.foodMatch,
    'Right ripeness': summary.ripeness,
    'Right mould call': summary.mould,
    'Right recommendation': summary.recommendation,
    'Must-discard photos caught': summary.discardCaught,
    'Usable photos wrongly discarded': summary.falseDiscard,
  })
  console.log('Ripeness: rows = label, columns = scanner')
  console.table(summary.confusion)
  if (failed.length) console.log(`${failed.length} photo(s) could not be scored:`, failed)

  await writeFile(RESULTS_FILE, `${JSON.stringify({
    date: new Date().toISOString(),
    models: { main: process.env.GEMINI_MODEL || 'gemini-3.5-flash', fallback: process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.8-flash' },
    summary,
    failed,
    rows,
  }, null, 2)}\n`)
  console.log('Saved eval/results.json')
}

// Run only when started from the command line (so compare/summarise can be imported on their own).
if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
