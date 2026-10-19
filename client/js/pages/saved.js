// "Your saved foods": the fridge (saved foods on shelves) and the scan history, as two tabs.
//
// The fridge is drawn from real data only:
//   GET /api/saved  -> the foods this user bookmarked (each one becomes an item on a shelf)
//   GET /api/scans  -> the user's recent scans; the newest scan of a food is shown in its detail panel
// Saved foods are bookmarks, not a record of what is physically in someone's fridge, and the page says so.

import { api, ApiError } from '../api.js'
import { initLayout } from '../layout.js'
import { expiryTag, expiryText, shortDate, STORAGE_LABELS, todayIso } from '../kitchen-ui.js'
import { initShopping, loadInsights } from '../kitchen-tabs.js'
import { mouldHtml, scanHistoryHtml, scoreColor } from '../scan-ui.js'
import { removeSaved, session, setSavedIds, toggleSaved } from '../session.js'
import {
  applyDataStyles, emptyStateHtml, escapeHtml, goToLogin, lastingHtml, listHtml, recommendationTag,
  RIPENESS_LABELS, scaleHtml, showToast, storageHtml,
} from '../ui.js'

const fridge = document.getElementById('fridge')
const shelvesEl = document.getElementById('fridge-shelves')
const statusEl = document.getElementById('fridge-status')
const countEl = document.getElementById('fridge-count')
const legendEl = document.getElementById('fridge-legend')
const useSoonEl = document.getElementById('use-soon')
const dialog = document.getElementById('fridge-dialog')
const dialogBody = document.getElementById('fridge-dialog-body')
const scanResults = document.getElementById('scan-results')
const tabs = [...document.querySelectorAll('[role="tab"]')]
const shoppingPanel = document.getElementById('panel-shopping')
const insightsPanel = document.getElementById('panel-insights')

// Shelves from top to bottom. Each food goes on the shelf for its category.
const SHELVES = [
  { category: 'Dairy', label: 'Top shelf', name: 'Dairy' },
  { category: 'Fruits', label: 'Middle shelf', name: 'Fruits' },
  { category: 'Pantry & Grains', label: 'Lower shelf', name: 'Pantry and grains' },
  { category: 'Vegetables', label: 'Crisper drawer', name: 'Vegetables', drawer: true },
]

let foods = []
let latestScanByFood = new Map() // food id -> newest scan of that food (from the last 30 scans)
let opener = null // the item that opened the dialog, so focus can return to it

// ---------- Drawing the fridge ----------

const shortStatus = (food) => {
  if (food.tracking) return expiryText(food.tracking)
  const scan = latestScanByFood.get(food.id)
  return scan && RIPENESS_LABELS[scan.ripeness]
    ? `Last scan: ${RIPENESS_LABELS[scan.ripeness].toLowerCase()}`
    : food.freshnessStatus
}

// Very short countdown for the label on a shelf item: "3d", "Today", "Past".
const chipText = ({ state, daysLeft }) => (state === 'expired' ? 'Past' : state === 'today' ? 'Today' : `${daysLeft}d`)

// Each food has a tightly cropped photo in /images/fridge/ so it can stand on a shelf.
// A food added later through the admin console has none, so its normal photo is used instead.
function itemHtml(food) {
  const name = escapeHtml(food.name)
  return `
    <li class="fridge-slot">
      <button type="button" class="fridge-item" data-food-id="${escapeHtml(food.id)}" data-category="${escapeHtml(food.category)}"
        data-expiry="${food.tracking ? food.tracking.state : ''}"
        aria-haspopup="dialog" aria-label="${name}, ${escapeHtml(shortStatus(food).toLowerCase())}. Open details">
        <img src="/images/fridge/${encodeURIComponent(food.id)}.webp" data-fallback="${escapeHtml(food.image)}" alt="" decoding="async">
        ${food.tracking ? `<span class="fridge-chip" data-state="${food.tracking.state}" aria-hidden="true">${escapeHtml(chipText(food.tracking))}</span>` : ''}
        <span class="fridge-tag" aria-hidden="true">
          <strong>${name}</strong>
          <span>${escapeHtml(shortStatus(food))}</span>
        </span>
      </button>
    </li>`
}

function shelfHtml(shelf, items) {
  return `
    <section class="shelf ${shelf.drawer ? 'shelf-drawer' : ''}" aria-label="${escapeHtml(`${shelf.label}: ${shelf.name}`)}">
      <p class="shelf-label" aria-hidden="true">${escapeHtml(shelf.label)} &nbsp;·&nbsp; ${escapeHtml(shelf.name)}</p>
      <ul class="shelf-items">${items.map(itemHtml).join('')}</ul>
      <span class="shelf-glass" aria-hidden="true"></span>
    </section>`
}

function renderFridge() {
  // A food whose category has no shelf (e.g. a new category added later) goes on the lower shelf.
  const known = SHELVES.map((shelf) => shelf.category)
  const onShelf = (shelf) => foods.filter((food) =>
    food.category === shelf.category || (shelf.category === 'Pantry & Grains' && !known.includes(food.category)))

  shelvesEl.innerHTML = SHELVES.map((shelf) => shelfHtml(shelf, onShelf(shelf))).join('') +
    (foods.length === 0 ? `
      <div class="fridge-empty">
        <p class="fridge-empty-title">Nothing saved yet</p>
        <p>Save foods from the guide and they will appear on these shelves.</p>
        <a href="/foods" class="btn btn-primary btn-sm">Open the food guide</a>
      </div>` : '')

  // Items appear one after another once the door has opened (the delay is set here because CSP blocks inline styles).
  shelvesEl.querySelectorAll('.fridge-slot').forEach((slot, index) => slot.style.setProperty('--i', index))

  renderUseSoon()
  countEl.innerHTML = `<span class="num">${foods.length}</span> saved ${foods.length === 1 ? 'food' : 'foods'}`
  legendEl.innerHTML = SHELVES.map((shelf) => `
    <li><span>${escapeHtml(shelf.name)}</span><span class="num">${onShelf(shelf).length}</span></li>`).join('')
  fridge.classList.toggle('is-empty', foods.length === 0)
  fridge.classList.toggle('is-full', foods.length > 16)
}

// A short reminder above the fridge when something is close to (or past) its limit.
function renderUseSoon() {
  const soon = foods.filter((food) => food.tracking && food.tracking.state !== 'fresh')
    .sort((a, b) => a.tracking.daysLeft - b.tracking.daysLeft)
  useSoonEl.hidden = soon.length === 0
  useSoonEl.innerHTML = soon.length === 0 ? '' : `
    <p class="use-soon-title">Use these up first</p>
    <ul class="use-soon-list">${soon.map((food) => `
      <li><button type="button" class="use-soon-item" data-open-food="${escapeHtml(food.id)}">${escapeHtml(food.name)} ${expiryTag(food.tracking)}</button></li>`).join('')}
    </ul>
    <a href="/recipes" class="btn btn-on-dark btn-sm">Get recipe ideas</a>`
}

function openDoors() {
  // Wait one frame so the closed doors are painted before they swing open.
  requestAnimationFrame(() => requestAnimationFrame(() => { fridge.dataset.state = 'open' }))
  // Once every item has appeared, later redraws (e.g. after removing a food) should not replay the entrance.
  setTimeout(() => fridge.classList.add('is-settled'), 1800 + foods.length * 45)
}

// ---------- Detail panel ----------

function scanSectionHtml(food) {
  const scan = latestScanByFood.get(food.id)
  if (!scan) {
    return `
      <section class="fd-section">
        <h3>Your latest scan</h3>
        <p class="fd-muted">You haven't scanned ${escapeHtml(food.name.toLowerCase())} yet, so there is no reading to show.</p>
      </section>`
  }
  const when = new Date(scan.createdAt).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  const score = scan.freshnessScore ?? 0
  return `
    <section class="fd-section fd-scan">
      <h3>Your latest scan</h3>
      <p class="label">Scanned <time datetime="${escapeHtml(scan.createdAt)}">${escapeHtml(when)}</time></p>
      <div class="fd-scan-head">
        ${scan.thumbnail ? `<img src="${escapeHtml(scan.thumbnail)}" alt="Your photo of ${escapeHtml(scan.item)}" width="64" height="64">` : ''}
        <div>
          <p class="fd-score"><span class="num">${score}</span> / 100 freshness</p>
          ${recommendationTag(scan.recommendation)}
        </div>
      </div>
      <span class="meter" data-value="${score}" data-color="${scoreColor(score)}"><span></span></span>
      ${scan.ripeness !== 'unknown' ? scaleHtml(scan.ripeness, score) : ''}
      ${scan.visibleSigns?.length ? `<ul class="fd-list">${listHtml(scan.visibleSigns)}</ul>` : ''}
      <dl class="fd-facts">
        <div><dt>Mould</dt><dd>${mouldHtml(scan.mould)}</dd></div>
        ${scan.estimatedDaysLeft ? `<div><dt>Time left at the scan</dt><dd>${escapeHtml(scan.estimatedDaysLeft)}</dd></div>` : ''}
      </dl>
    </section>`
}

// The use-by clock: when it was bought, where it is kept, and the countdown.
function clockSectionHtml(food) {
  const t = food.tracking
  const options = food.storageOptions.map((key) => `
    <option value="${escapeHtml(key)}" ${key === (t?.storage || food.defaultStorage) ? 'selected' : ''}>${escapeHtml(STORAGE_LABELS[key] || key)}</option>`).join('')
  return `
    <section class="fd-section fd-clock">
      <h3>Use-by clock</h3>
      ${t ? `
        <p class="fd-clock-line">${expiryTag(t)} <span class="fd-muted">Bought ${escapeHtml(shortDate(t.boughtOn))}, use by ${escapeHtml(shortDate(t.useBy))} (${t.shelfLifeDays} days in the ${escapeHtml((STORAGE_LABELS[t.storage] || t.storage).toLowerCase())})</span></p>`
      : `<p class="fd-muted">Tell ShelfLife when you bought ${escapeHtml(food.name.toLowerCase())} and it will count down the days from the guide's shelf-life figure.</p>`}
      ${food.storageOptions.length ? `
      <form class="fd-clock-form" data-track-form="${escapeHtml(food.id)}" novalidate>
        <div class="field"><label for="bought-on">Bought on</label>
          <input id="bought-on" name="boughtOn" type="date" max="${todayIso()}" value="${escapeHtml(t?.boughtOn || todayIso())}" required></div>
        <div class="field"><label for="kept-in">Kept in</label>
          <select id="kept-in" name="storage">${options}</select></div>
        <button type="submit" class="btn btn-secondary btn-sm">${t ? 'Update' : 'Start the clock'}</button>
      </form>` : '<p class="fd-muted">The guide has no day-count for this food, so there is nothing to count down.</p>'}
      <p class="field-error" data-clock-error hidden></p>
    </section>`
}

function detailHtml(food) {
  const name = escapeHtml(food.name)
  return `
    <button type="button" class="fd-close" data-close aria-label="Close">×</button>
    <div class="fd-media food-frame"><img src="${escapeHtml(food.image)}" alt="${name}" width="800" height="800"></div>
    <div class="fd-body">
      <p class="label">Saved food &nbsp;·&nbsp; ${escapeHtml(food.category)}</p>
      <h2 id="fridge-dialog-title">${name}</h2>
      <p class="fd-lead">${escapeHtml(food.shortDescription)}</p>
      <dl class="fd-facts fd-facts-main">
        <div><dt>Best kept</dt><dd>${storageHtml(food.storageLocation)}</dd></div>
        <div><dt>Shelf life</dt><dd class="num">${escapeHtml(food.shelfLifePreview)}</dd></div>
        <div><dt>Keeps for</dt><dd>${lastingHtml(food.freshnessStatus)}</dd></div>
      </dl>
      ${clockSectionHtml(food)}
      ${scanSectionHtml(food)}
      <section class="fd-section">
        <h3>Freshness stages</h3>
        <ol class="fd-stages">${food.freshnessStages.map((stage, index) => `
          <li data-tone="${Math.round((index / Math.max(1, food.freshnessStages.length - 1)) * 3)}">
            <strong>${escapeHtml(stage.label)}</strong> ${escapeHtml(stage.description)}</li>`).join('')}
        </ol>
      </section>
      <section class="fd-section">
        <h3>How to store it</h3>
        <p>${escapeHtml(food.storageMethod)}</p>
      </section>
      <p class="form-error" role="alert" hidden></p>
      <div class="fd-actions">
        <a href="/food?id=${encodeURIComponent(food.id)}" class="btn btn-primary btn-sm">Open the full guide</a>
        <a href="/scan" class="btn btn-secondary btn-sm">Scan one now</a>
        ${food.nutrition ? `<a href="/nutrition?add=${encodeURIComponent(food.id)}" class="btn btn-secondary btn-sm">Log a serving</a>` : ''}
        <button type="button" class="btn btn-primary btn-sm" data-finish="used" data-food="${escapeHtml(food.id)}">I used it</button>
        <button type="button" class="btn btn-secondary btn-sm" data-finish="wasted" data-food="${escapeHtml(food.id)}">I threw it away</button>
        <button type="button" class="btn btn-danger btn-sm" data-remove="${escapeHtml(food.id)}">Remove from saved</button>
      </div>
    </div>`
}

function openDetail(foodId, button) {
  const food = foods.find((item) => item.id === foodId)
  if (!food) return
  opener = button
  dialogBody.innerHTML = detailHtml(food)
  applyDataStyles(dialogBody)
  dialog.showModal()
  dialogBody.querySelector('.fd-close').focus()
}

async function removeFood(button) {
  // Two steps so a stray tap doesn't remove anything.
  if (!button.classList.contains('is-confirming')) {
    button.classList.add('is-confirming')
    button.textContent = 'Yes, remove it'
    return
  }
  const id = button.dataset.remove
  const food = foods.find((item) => item.id === id)
  const errorBox = dialogBody.querySelector('.form-error')
  button.disabled = true
  try {
    await removeSaved(id)
    foods = foods.filter((item) => item.id !== id)
    opener = null
    dialog.close()
    renderFridge()
    statusEl.textContent = `${food.name} removed.`
    showToast(`${food.name} removed from your saved foods.`, { label: 'Undo', onClick: () => undoRemove(food) })
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return goToLogin()
    errorBox.textContent = error.message
    errorBox.hidden = false
    button.disabled = false
  }
}

// "I used it" / "I threw it away": takes the food off the shelf and logs it for the Insights tab.
async function finishFood(button) {
  const id = button.dataset.food
  const outcome = button.dataset.finish
  const food = foods.find((item) => item.id === id)
  const errorBox = dialogBody.querySelector('.form-error')
  button.disabled = true
  try {
    const data = await api.post(`/api/saved/${encodeURIComponent(id)}/finish`, { outcome })
    setSavedIds(data.savedIds)
    foods = foods.filter((item) => item.id !== id)
    opener = null
    dialog.close()
    renderFridge()
    delete insightsPanel.dataset.loaded
    statusEl.textContent = `${food.name} ${outcome === 'used' ? 'used' : 'thrown away'}.`
    showToast(data.message, { label: 'Add to shopping list', onClick: () => addToShopping(food) })
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return goToLogin()
    errorBox.textContent = error.message
    errorBox.hidden = false
    button.disabled = false
  }
}

async function addToShopping(food) {
  try {
    await api.post('/api/shopping', { foodId: food.id })
    delete shoppingPanel.dataset.loaded
    showToast(`${food.name} is on your shopping list.`)
  } catch (error) {
    showToast(error.message)
  }
}

async function saveClock(form) {
  const id = form.dataset.trackForm
  const errorBox = dialogBody.querySelector('[data-clock-error]')
  errorBox.hidden = true
  const data = Object.fromEntries(new FormData(form))
  try {
    const { food } = await api.patch(`/api/saved/${encodeURIComponent(id)}`, { boughtOn: data.boughtOn, storage: data.storage })
    foods = foods.map((item) => (item.id === id ? food : item))
    renderFridge()
    delete insightsPanel.dataset.loaded
    dialogBody.innerHTML = detailHtml(food)
    applyDataStyles(dialogBody)
    dialogBody.querySelector('.fd-close').focus()
    statusEl.textContent = `${food.name}: ${food.tracking ? expiryText(food.tracking) : 'clock updated'}.`
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return goToLogin()
    errorBox.textContent = error.errors?.boughtOn || error.errors?.storage || error.message
    errorBox.hidden = false
  }
}

async function undoRemove(food) {
  try {
    await toggleSaved(food.id)
    foods = [...foods, food]
    renderFridge()
    statusEl.textContent = `${food.name} is back in your fridge.`
  } catch (error) {
    showToast(error.message)
  }
}

// ---------- Loading ----------

async function loadFridge() {
  fridge.dataset.state = 'closed'
  statusEl.textContent = 'Opening your fridge…'
  try {
    // Scans only add detail; if they fail to load the fridge still opens.
    const [saved, scans] = await Promise.allSettled([api.get('/api/saved'), api.get('/api/scans')])
    if (saved.status === 'rejected') throw saved.reason
    foods = saved.value.foods
    latestScanByFood = new Map()
    if (scans.status === 'fulfilled') {
      for (const scan of scans.value.scans) {
        if (scan.matchedFood && !latestScanByFood.has(scan.matchedFood)) latestScanByFood.set(scan.matchedFood, scan)
      }
    }
    renderFridge()
    statusEl.textContent = foods.length ? 'Door open. Choose a food to inspect it.' : 'Your fridge is empty.'
    openDoors()
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return goToLogin()
    statusEl.innerHTML = `
      <p class="fridge-error">Could not open your fridge: ${escapeHtml(error.message)}</p>
      <button type="button" class="btn btn-on-dark btn-sm" data-retry-fridge>Try again</button>`
  }
}

// ---------- Scan history tab ----------

const noScansHtml = () =>
  emptyStateHtml('No scans yet', 'Photos you check with the scanner will appear here with their results.',
    '<a href="/scan" class="btn btn-primary">Scan a photo</a>')

async function loadScans() {
  scanResults.innerHTML = '<div class="skeleton guide-skeleton"></div>'
  try {
    const { scans } = await api.get('/api/scans')
    scanResults.innerHTML = scans.length > 0
      ? `${scanHistoryHtml(scans)}<button type="button" class="btn btn-ghost btn-sm" data-clear-scans>Clear scan history</button>`
      : noScansHtml()
    applyDataStyles(scanResults)
  } catch (error) {
    scanResults.innerHTML = emptyStateHtml('Could not load your scans', error.message)
  }
}

const shopping = initShopping(shoppingPanel, {
  onBought: (savedIds) => {
    setSavedIds(savedIds)
    loadFridge()
  },
})

// Accessible tabs: click or arrow keys switch panels; the URL hash remembers the tab.
function selectTab(tab) {
  for (const other of tabs) {
    const selected = other === tab
    other.setAttribute('aria-selected', String(selected))
    other.tabIndex = selected ? 0 : -1
    document.getElementById(other.getAttribute('aria-controls')).hidden = !selected
  }
  history.replaceState(null, '', `#${tab.id.replace('tab-', '')}`)
  // Each tab loads when first opened, and again after something it shows has changed.
  const loader = {
    'tab-scans': [scanResults, loadScans],
    'tab-shopping': [shoppingPanel, shopping.load],
    'tab-insights': [insightsPanel, () => loadInsights(insightsPanel)],
  }[tab.id]
  if (loader && !loader[0].dataset.loaded) {
    loader[0].dataset.loaded = 'true'
    loader[1]()
  }
}

function setupTabs() {
  for (const tab of tabs) {
    tab.addEventListener('click', () => selectTab(tab))
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
      const next = tabs[(tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]
      next.focus()
      selectTab(next)
    })
  }
  const fromHash = tabs.find((tab) => `#${tab.id.replace('tab-', '')}` === window.location.hash)
  if (fromHash && fromHash !== tabs[0]) selectTab(fromHash)
}

// ---------- Wiring ----------

await initLayout()

if (!session.user) {
  document.querySelector('.tabs').hidden = true
  countEl.textContent = 'Locked'
  statusEl.innerHTML = `
    <p>Log in to open your fridge. Saved foods are kept in your account.</p>
    <div class="button-row">
      <a href="/login?next=/saved" class="btn btn-on-dark btn-sm">Log in</a>
      <a href="/signup" class="btn btn-outline-dark btn-sm">Create account</a>
    </div>`
} else {
  setupTabs()

  shelvesEl.addEventListener('click', (event) => {
    const item = event.target.closest('.fridge-item')
    if (item) openDetail(item.dataset.foodId, item)
  })
  statusEl.addEventListener('click', (event) => {
    if (event.target.closest('[data-retry-fridge]')) loadFridge()
  })
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target.closest('[data-close]')) dialog.close() // backdrop or close button
    const remove = event.target.closest('[data-remove]')
    if (remove) removeFood(remove)
    const finish = event.target.closest('[data-finish]')
    if (finish) finishFood(finish)
  })
  dialog.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-track-form]')
    if (!form) return
    event.preventDefault()
    saveClock(form)
  })
  useSoonEl.addEventListener('click', (event) => {
    const item = event.target.closest('[data-open-food]')
    if (item) openDetail(item.dataset.openFood, item)
  })
  dialog.addEventListener('close', () => {
    // Return focus to the food that opened the panel (or to the first food if it was removed).
    const target = opener?.isConnected ? opener : shelvesEl.querySelector('.fridge-item')
    target?.focus()
  })
  scanResults.addEventListener('click', async (event) => {
    if (!event.target.closest('[data-clear-scans]')) return
    try {
      await api.delete('/api/scans')
      scanResults.innerHTML = noScansHtml()
      latestScanByFood = new Map()
      showToast('Scan history cleared.')
    } catch (error) {
      showToast(error.message)
    }
  })

  await loadFridge()
}
