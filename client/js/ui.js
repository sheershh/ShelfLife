// Helpers that build HTML for foods, tags, the ripeness scale and messages,
// plus the shared save-button behaviour.

import { ApiError } from './api.js'
import { icon } from './icons.js'
import { removeSaved, session, toggleSaved } from './session.js'

// Every value that comes from the API is escaped before it goes into HTML (stops script injection).
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Counts numbers up from 0 to their value: <span data-count="82" data-suffix="%">82%</span>.
// The real value is already in the HTML, so nothing is lost without JavaScript or with reduced motion.
export function animateNumbers(root = document, duration = 1100) {
  if (reducedMotion()) return
  for (const el of root.querySelectorAll('[data-count]')) {
    const target = Number(el.dataset.count)
    if (!Number.isFinite(target)) continue
    const suffix = el.dataset.suffix || ''
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      el.textContent = `${Math.round(target * (1 - (1 - t) ** 3)).toLocaleString()}${suffix}` // ease-out
      if (t < 1) requestAnimationFrame(tick)
    }
    el.textContent = `0${suffix}`
    requestAnimationFrame(tick)
  }
}

export const listHtml = (items) => items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')

// Our Content Security Policy blocks inline style="" attributes, so positions and widths are
// written as data-* attributes in the HTML and copied into CSS variables here.
export function applyDataStyles(root = document) {
  for (const el of root.querySelectorAll('[data-at]')) el.style.setProperty('--at', `${el.dataset.at}%`)
  for (const el of root.querySelectorAll('[data-value]')) el.style.setProperty('--value', `${el.dataset.value}%`)
  for (const el of root.querySelectorAll('[data-color]')) el.style.setProperty('--meter-color', el.dataset.color)
}

// ---------- Storage and perishability ----------

const storageIcons = { 'Room Temperature': 'home', Refrigerator: 'fridge', Pantry: 'box', Freezer: 'snow' }
export const storageHtml = (location) =>
  `<span class="storage">${icon(storageIcons[location] || 'box')}${escapeHtml(location)}</span>`

const lastingLevels = { 'Highly Perishable': 1, 'Moderately Perishable': 2, 'Longer Lasting': 3 }
export const lastingHtml = (status) => `
  <span class="lasting" data-level="${lastingLevels[status] || 0}">
    <span class="lasting-pips" aria-hidden="true"><span></span><span></span><span></span></span>${escapeHtml(status)}
  </span>`

// ---------- Ripeness scale ----------

export const RIPENESS_LABELS = { unripe: 'Unripe', ripe: 'Ripe', overripe: 'Overripe', spoiled: 'Spoiled' }
const RIPENESS_ORDER = ['unripe', 'ripe', 'overripe', 'spoiled']

// Where the marker sits (0-100). Each stage owns a quarter of the scale; within "ripe",
// "overripe" and "spoiled" a lower freshness score moves the marker further right.
export function scalePosition(ripeness, score = 70) {
  const index = RIPENESS_ORDER.indexOf(ripeness)
  if (index === -1) return 50
  if (ripeness === 'unripe') return 12.5
  return index * 25 + 3 + 19 * (1 - Math.max(0, Math.min(100, score)) / 100)
}

export function scaleHtml(ripeness, score) {
  const label = RIPENESS_LABELS[ripeness] || 'Unknown'
  return `
    <div class="scale" role="img" aria-label="Ripeness: ${escapeHtml(label)}" data-at="${scalePosition(ripeness, score).toFixed(1)}">
      <div class="scale-track"><span></span><span></span><span></span><span></span></div>
      <span class="scale-marker"></span>
      <div class="scale-labels" aria-hidden="true">
        ${RIPENESS_ORDER.map((stage) => `<span class="${stage === ripeness ? 'is-current' : ''}">${RIPENESS_LABELS[stage]}</span>`).join('')}
      </div>
    </div>`
}

export const RECOMMENDATION_LABELS = {
  eat: 'Good to eat',
  'use-soon': 'Use soon',
  'cook-today': 'Cook or blend today',
  discard: 'Throw it out',
  unsure: 'Not sure',
}
export const recommendationTag = (value) =>
  `<span class="tag tag-dot tag-${escapeHtml(value)}">${escapeHtml(RECOMMENDATION_LABELS[value] || value)}</span>`

// ---------- Foods ----------

export function saveButtonHtml(food, saved, withText = false) {
  const label = saved ? `Remove ${food.name} from saved foods` : `Save ${food.name}`
  return `
    <button type="button" class="save-btn ${saved ? 'is-saved' : ''} ${withText ? 'with-text' : ''}"
      data-action="toggle-save" data-food-id="${escapeHtml(food.id)}" data-food-name="${escapeHtml(food.name)}"
      aria-pressed="${saved}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
      ${icon('heart')}${withText ? `<span>${saved ? 'Saved' : 'Save'}</span>` : ''}
    </button>`
}

// One food as a row in the food guide list. `removable` gives the Saved page version.
export function foodRowHtml(food, { removable = false } = {}) {
  const name = escapeHtml(food.name)
  const url = `/food?id=${encodeURIComponent(food.id)}`
  const action = removable
    ? `<button type="button" class="btn btn-ghost btn-sm" data-action="remove-saved" data-food-id="${escapeHtml(food.id)}"
        aria-label="Remove ${name} from saved foods">Remove</button>`
    : saveButtonHtml(food, session.savedIds.has(food.id))
  return `
    <li class="food-row">
      <a class="food-row-link" href="${url}">
        <span class="food-frame food-row-thumb"><img src="${escapeHtml(food.image)}" alt="" loading="lazy" width="80" height="80"></span>
        <span class="food-row-name"><strong>${name}</strong><span>${escapeHtml(food.category)}</span></span>
        <span class="food-row-store">${storageHtml(food.storageLocation)}</span>
        <span class="food-row-life num">${escapeHtml(food.shelfLifePreview)}</span>
        <span class="food-row-lasting">${lastingHtml(food.freshnessStatus)}</span>
      </a>
      <div class="food-row-action">${action}</div>
    </li>`
}

export const foodListHtml = (foods, options) =>
  `<ul class="food-list">${foods.map((food) => foodRowHtml(food, options)).join('')}</ul>`

// ---------- Messages ----------

export function emptyStateHtml(title, text, actionsHtml = '') {
  return `
    <div class="empty-state">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(text)}</p>
      ${actionsHtml ? `<div class="button-row">${actionsHtml}</div>` : ''}
    </div>`
}

// Short message at the bottom of the screen. An optional action adds one button, e.g. "Undo".
export function showToast(message, action) {
  document.querySelector('.toast')?.remove()
  const toast = document.createElement('div')
  toast.className = 'toast'
  toast.setAttribute('role', 'status')
  const text = document.createElement('span')
  text.textContent = message
  toast.append(text)
  if (action) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = action.label
    button.addEventListener('click', () => {
      toast.remove()
      action.onClick()
    })
    toast.append(button)
  }
  document.body.append(toast)
  setTimeout(() => toast.remove(), action ? 7000 : 4000)
}

export function goToLogin(reason = 'save') {
  const next = window.location.pathname + window.location.search
  window.location.assign(`/login?reason=${reason}&next=${encodeURIComponent(next)}`)
}

function showSavedState(button, saved) {
  const name = button.dataset.foodName
  const label = saved ? `Remove ${name} from saved foods` : `Save ${name}`
  button.classList.toggle('is-saved', saved)
  button.classList.toggle('just-saved', saved) // plays the heart pop only when the user saves it
  button.setAttribute('aria-pressed', String(saved))
  button.setAttribute('aria-label', label)
  button.title = label
  const text = button.querySelector('span')
  if (text) text.textContent = saved ? 'Saved' : 'Save'
}

// One click listener on a container handles every save / remove button inside it.
export function handleSaveButtons(container, { onRemoved } = {}) {
  container.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]')
    if (!button || button.disabled) return

    const { action, foodId } = button.dataset
    if (action !== 'toggle-save' && action !== 'remove-saved') return
    if (!session.user) return goToLogin()

    button.disabled = true
    try {
      if (action === 'toggle-save') {
        showSavedState(button, await toggleSaved(foodId))
      } else {
        await removeSaved(foodId)
        if (onRemoved) onRemoved(foodId)
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return goToLogin()
      showToast(error.message)
    } finally {
      button.disabled = false
    }
  })
}

// Broken images fall back to data-fallback (if given) or a neutral placeholder.
// (Inline onerror is blocked by our CSP, so one listener on the document handles every image.)
document.addEventListener(
  'error',
  (event) => {
    const image = event.target
    if (image.tagName !== 'IMG' || image.dataset.failed) return
    image.dataset.failed = 'true'
    image.src = image.dataset.fallback || '/images/placeholder.svg'
  },
  true,
)
