// Helpers that build HTML for food cards, badges and buttons.

import { ApiError } from './api.js'
import { removeSaved, session, toggleSaved } from './session.js'

// Every value that comes from the API is escaped before it goes into HTML.
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const toClassName = (text) => text.toLowerCase().replace(/\s+/g, '-')

export const storageLabelHtml = (location) =>
  `<span class="badge storage-${toClassName(location)}">${escapeHtml(location)}</span>`

export const freshnessBadgeHtml = (status) =>
  `<span class="badge freshness-${toClassName(status)}">${escapeHtml(status)}</span>`

export function favoriteButtonHtml(food, saved, withText = false) {
  const label = saved ? `Remove ${food.name} from saved foods` : `Save ${food.name} to saved foods`
  return `
    <button type="button" class="favorite-btn ${saved ? 'is-saved' : ''} ${withText ? 'with-text' : ''}"
      data-action="toggle-save" data-food-id="${escapeHtml(food.id)}" data-food-name="${escapeHtml(food.name)}"
      aria-pressed="${saved}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
      <span aria-hidden="true">${saved ? '♥' : '♡'}</span>${withText ? `<span>${saved ? 'Saved' : 'Save Food'}</span>` : ''}
    </button>`
}

// `showRemove` gives the Saved Foods version of the card.
export function foodCardHtml(food, { saved = false, showRemove = false } = {}) {
  const name = escapeHtml(food.name)
  const detailsUrl = `/food?id=${encodeURIComponent(food.id)}`
  return `
    <article class="food-card">
      <div class="food-card-media">
        <a href="${detailsUrl}" aria-label="View details for ${name}">
          <img class="food-card-image" src="${escapeHtml(food.image)}" alt="${name}" loading="lazy">
        </a>
        ${showRemove ? '' : favoriteButtonHtml(food, saved)}
      </div>
      <div class="food-card-body">
        <p class="food-card-category">${escapeHtml(food.category)}</p>
        <h3 class="food-card-title">${name}</h3>
        <p class="food-card-text">${escapeHtml(food.shortDescription)}</p>
        <div class="badge-row">
          ${storageLabelHtml(food.storageLocation)}
          ${freshnessBadgeHtml(food.freshnessStatus)}
        </div>
        <p class="shelf-preview">
          <span class="shelf-preview-label">Shelf life</span>
          ${escapeHtml(food.shelfLifePreview)}
        </p>
        <div class="food-card-actions">
          <a href="${detailsUrl}" class="btn btn-primary btn-small">View Details</a>
          ${showRemove ? `<button type="button" class="btn btn-outline btn-small" data-action="remove-saved"
            data-food-id="${escapeHtml(food.id)}" aria-label="Remove ${name} from Saved Foods">Remove Favorite</button>` : ''}
        </div>
      </div>
    </article>`
}

export function foodGridHtml(foods, options = {}) {
  const cards = foods.map((food) => foodCardHtml(food, { ...options, saved: session.savedIds.has(food.id) }))
  return `<div class="food-grid ${options.featured ? 'food-grid-featured' : ''}">${cards.join('')}</div>`
}

export function messageBoxHtml(title, text, actionsHtml = '') {
  return `
    <div class="message-box">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(text)}</p>
      ${actionsHtml}
    </div>`
}

// Short message at the bottom of the screen for errors that have no better place to go.
export function showToast(message) {
  const toast = document.createElement('div')
  toast.className = 'toast'
  toast.setAttribute('role', 'status')
  toast.textContent = message
  document.body.append(toast)
  setTimeout(() => toast.remove(), 4000)
}

export function goToLogin() {
  const next = window.location.pathname + window.location.search
  window.location.assign(`/login?reason=save&next=${encodeURIComponent(next)}`)
}

function showSavedState(button, saved) {
  const name = button.dataset.foodName
  const label = saved ? `Remove ${name} from saved foods` : `Save ${name} to saved foods`
  button.classList.toggle('is-saved', saved)
  button.setAttribute('aria-pressed', String(saved))
  button.setAttribute('aria-label', label)
  button.title = label
  button.firstElementChild.textContent = saved ? '♥' : '♡'
  if (button.classList.contains('with-text')) button.lastElementChild.textContent = saved ? 'Saved' : 'Save Food'
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

// Broken images fall back to a neutral placeholder. (Inline onerror is blocked by our CSP.)
document.addEventListener(
  'error',
  (event) => {
    const image = event.target
    if (image.tagName === 'IMG' && !image.dataset.failed) {
      image.dataset.failed = 'true'
      image.src = '/images/placeholder.svg'
    }
  },
  true,
)
