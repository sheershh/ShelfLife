// Food details page (/food?id=banana): everything the guide knows about one food.

import { api, ApiError } from '../api.js'
import { shelfLifeDisclaimer, shelfLifeLabels } from '../constants.js'
import { icon } from '../icons.js'
import { initLayout } from '../layout.js'
import { nutritionFactsHtml } from '../nutrition-ui.js'
import { session } from '../session.js'
import {
  emptyStateHtml, escapeHtml, handleSaveButtons, lastingHtml, listHtml, saveButtonHtml, storageHtml,
} from '../ui.js'

const page = document.getElementById('food-details')
const backLink = `<a href="/foods" class="back-link">${icon('back')}Food guide</a>`
const notFoundHtml = (title, text) =>
  backLink + emptyStateHtml(title, text, '<a href="/foods" class="btn btn-primary">Open the food guide</a>')

function shelfTableHtml(food) {
  const rows = Object.entries(shelfLifeLabels)
    .filter(([condition]) => food.shelfLife?.[condition])
    .map(([condition, label]) => {
      const best = food.storageLocation === label
      return `
        <tr class="${best ? 'is-best' : ''}">
          <th scope="row">${storageHtml(label)}${best ? '<span class="tag tag-eat">Best</span>' : ''}</th>
          <td>${escapeHtml(food.shelfLife[condition])}</td>
        </tr>`
    }).join('')
  return `<table class="shelf-table"><caption class="visually-hidden">Estimated shelf life by storage</caption><tbody>${rows}</tbody></table>`
}

function stagesHtml(food) {
  const count = food.freshnessStages.length
  return `<ol class="stage-list">${food.freshnessStages.map((stage, index) => `
    <li class="stage-cell" data-tone="${Math.round((index / Math.max(1, count - 1)) * 3)}">
      <span class="stage-bar" aria-hidden="true"></span>
      <h3>${escapeHtml(stage.label)}</h3>
      <p>${escapeHtml(stage.description)}</p>
    </li>`).join('')}</ol>`
}

function detailsHtml(food) {
  const name = escapeHtml(food.name)
  return `
    ${backLink}
    <header class="detail-head">
      <div class="detail-photo food-frame"><img src="${escapeHtml(food.image)}" alt="${name}" width="800" height="800"></div>
      <div class="detail-summary">
        <p class="detail-category"><a href="/foods?category=${encodeURIComponent(food.category)}">${escapeHtml(food.category)}</a></p>
        <h1>${name}</h1>
        <p class="detail-lead">${escapeHtml(food.shortDescription)}</p>
        <dl class="detail-facts">
          <div><dt>Best kept</dt><dd>${storageHtml(food.storageLocation)}</dd></div>
          <div><dt>Keeps for</dt><dd>${lastingHtml(food.freshnessStatus)}</dd></div>
          <div><dt>Shelf life</dt><dd class="num">${escapeHtml(food.shelfLifePreview)}</dd></div>
        </dl>
        <div class="button-row">
          ${saveButtonHtml(food, session.savedIds.has(food.id), true)}
          <a href="/scan" class="btn btn-primary">${icon('camera')}Check yours with the scanner</a>
        </div>
      </div>
    </header>

    <section class="detail-section" aria-labelledby="shelf-heading">
      <h2 id="shelf-heading">How long it keeps</h2>
      ${shelfTableHtml(food)}
    </section>

    ${nutritionFactsHtml(food)}

    <section class="detail-section" aria-labelledby="stages-heading">
      <h2 id="stages-heading">Freshness stages</h2>
      ${stagesHtml(food)}
    </section>

    <section class="detail-section detail-columns">
      <div>
        <h2>How to store it</h2>
        <p>${escapeHtml(food.storageMethod)}</p>
        <ul class="tick-list">${listHtml(food.storageTips)}</ul>
      </div>
      <div class="signs">
        <div class="signs-block signs-good">
          <h3>Signs it's fresh</h3>
          <ul>${listHtml(food.freshnessSigns)}</ul>
        </div>
        <div class="signs-block signs-bad">
          <h3>Signs it may be spoiling</h3>
          <ul>${listHtml(food.spoilageSigns)}</ul>
        </div>
      </div>
    </section>

    <section class="detail-section" aria-labelledby="use-heading">
      <h2 id="use-heading">Use it before you lose it</h2>
      <ul class="idea-chips">${listHtml(food.usageIdeas)}</ul>
      <a href="/recipes" class="text-link">More ideas in Use it up</a>
    </section>

    <p class="notice">${escapeHtml(shelfLifeDisclaimer)}</p>`
}

async function loadFood() {
  const id = new URLSearchParams(window.location.search).get('id')
  if (!id) {
    page.innerHTML = notFoundHtml('No food selected', 'Choose a food from the guide to see its details.')
    return
  }

  try {
    const { food } = await api.get(`/api/foods/${encodeURIComponent(id)}`)
    document.title = `${food.name}: shelf life and storage | ShelfLife`
    page.innerHTML = detailsHtml(food)
  } catch (error) {
    const missing = error instanceof ApiError && (error.status === 404 || error.status === 400)
    page.innerHTML = missing
      ? notFoundHtml('Food not found', "We couldn't find that food. It may have been removed from the guide.")
      : notFoundHtml('Could not load this food', error.message)
  }
}

await initLayout()
handleSaveButtons(page)
await loadFood()
