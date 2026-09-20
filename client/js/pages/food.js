import { api, ApiError } from '../api.js'
import { shelfLifeDisclaimer, shelfLifeLabels } from '../constants.js'
import { initLayout } from '../layout.js'
import { session } from '../session.js'
import {
  escapeHtml, favoriteButtonHtml, freshnessBadgeHtml, handleSaveButtons, messageBoxHtml, storageLabelHtml,
} from '../ui.js'

const page = document.getElementById('food-details')
const listHtml = (items) => items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
const notFoundHtml = (title, text) =>
  messageBoxHtml(title, text, '<a href="/foods" class="btn btn-primary">Back to Explore Foods</a>')

function detailsHtml(food) {
  const name = escapeHtml(food.name)
  const shelfCards = Object.entries(food.shelfLife)
    .filter(([, estimate]) => estimate)
    .map(([condition, estimate]) => `
      <div class="shelf-card ${food.storageLocation === shelfLifeLabels[condition] ? 'is-recommended' : ''}">
        ${storageLabelHtml(shelfLifeLabels[condition])}
        <p class="shelf-card-value">${escapeHtml(estimate)}</p>
      </div>`)
    .join('')

  const stages = food.freshnessStages.map((stage, index) => `
    <li class="stage">
      <span class="stage-number" aria-hidden="true">${index + 1}</span>
      <div><h3>${escapeHtml(stage.label)}</h3><p>${escapeHtml(stage.description)}</p></div>
    </li>`).join('')

  return `
    <a href="/foods" class="text-link">← Back to Explore Foods</a>

    <header class="details-header">
      <img class="details-image" src="${escapeHtml(food.image)}" alt="${name}">
      <div class="details-summary">
        <p class="food-card-category">${escapeHtml(food.category)}</p>
        <h1>${name}</h1>
        <p class="details-lead">${escapeHtml(food.shortDescription)}</p>
        <div class="details-meta">
          <div><p class="meta-label">Best storage location</p>${storageLabelHtml(food.storageLocation)}</div>
          <div><p class="meta-label">Freshness status</p>${freshnessBadgeHtml(food.freshnessStatus)}</div>
        </div>
        ${favoriteButtonHtml(food, session.savedIds.has(food.id), true)}
      </div>
    </header>

    <section class="details-section" aria-labelledby="shelf-life-heading">
      <h2 id="shelf-life-heading">Estimated shelf life</h2>
      <div class="shelf-grid">${shelfCards}</div>
    </section>

    <section class="details-section two-column">
      <div><h2>Storage method</h2><p>${escapeHtml(food.storageMethod)}</p></div>
      <div><h2>Storage tips</h2><ul class="check-list">${listHtml(food.storageTips)}</ul></div>
    </section>

    <section class="details-section">
      <h2>Freshness stages</h2>
      <ol class="stages">${stages}</ol>
    </section>

    <section class="details-section two-column">
      <div class="panel panel-good">
        <h2>Freshness signs</h2>
        <ul class="check-list">${listHtml(food.freshnessSigns)}</ul>
      </div>
      <div class="panel panel-warn">
        <h2>Possible spoilage signs</h2>
        <ul class="warn-list">${listHtml(food.spoilageSigns)}</ul>
        <p class="fine-print">Also watch for an unusual smell, visible mold, unusual texture or appearance. When in doubt, do not consume it.</p>
      </div>
    </section>

    <p class="notice">${escapeHtml(shelfLifeDisclaimer)}</p>

    <section class="details-section">
      <h2>Use it before you lose it</h2>
      <ul class="idea-list">${listHtml(food.usageIdeas)}</ul>
      <a href="/recipes" class="text-link">More ideas on the Recipes page →</a>
    </section>`
}

async function loadFood() {
  const id = new URLSearchParams(window.location.search).get('id')
  if (!id) {
    page.innerHTML = notFoundHtml('Food not found', 'No food was selected.')
    return
  }

  try {
    const { food } = await api.get(`/api/foods/${encodeURIComponent(id)}`)
    document.title = `${food.name} | ShelfLife`
    page.innerHTML = detailsHtml(food)
  } catch (error) {
    const missing = error instanceof ApiError && (error.status === 404 || error.status === 400)
    page.innerHTML = missing
      ? notFoundHtml('Food not found', 'We could not find a food with that ID.')
      : notFoundHtml('Could not load this food', error.message)
  }
}

await initLayout()
handleSaveButtons(page)
await loadFood()
