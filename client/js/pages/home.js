// Home page: plays the scanner demo once, shows freshness stages for a chosen food,
// and previews the food guide. All food data comes from the API.

import { api } from '../api.js'
import { initLayout } from '../layout.js'
import {
  applyDataStyles, emptyStateHtml, escapeHtml, foodListHtml, handleSaveButtons,
} from '../ui.js'

const STAGE_FOODS = ['banana', 'tomato', 'strawberry', 'bread', 'spinach']
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// The hero demo: a scan line sweeps the photo, then the result appears. Plays once.
function playDemo() {
  const demo = document.getElementById('scanner-demo')
  const status = document.getElementById('demo-status-text')
  applyDataStyles(demo)
  const finish = () => {
    demo.classList.add('is-done')
    status.textContent = 'Scan complete'
  }
  if (reduceMotion) return finish()
  demo.classList.add('is-scanning')
  setTimeout(finish, 2200)
}

// Each stage of a food, coloured along the ripeness scale from first to last.
function stageStripHtml(food) {
  const count = food.freshnessStages.length
  const stages = food.freshnessStages.map((stage, index) => `
    <li class="stage-cell" data-tone="${Math.round((index / Math.max(1, count - 1)) * 3)}">
      <span class="stage-bar" aria-hidden="true"></span>
      <h3>${escapeHtml(stage.label)}</h3>
      <p>${escapeHtml(stage.description)}</p>
    </li>`).join('')
  return `
    <ol class="stage-list">${stages}</ol>
    <p class="stage-foot">
      <span>Best kept in the <strong>${escapeHtml(food.storageLocation.toLowerCase())}</strong> section of the guide: ${escapeHtml(food.shelfLifePreview)}</span>
      <a class="text-link" href="/food?id=${encodeURIComponent(food.id)}">Full guide for ${escapeHtml(food.name.toLowerCase())}</a>
    </p>`
}

function setupStages(foods) {
  const picker = document.getElementById('stage-food-picker')
  const strip = document.getElementById('stage-strip')
  const choices = STAGE_FOODS.map((id) => foods.find((food) => food.id === id)).filter(Boolean)
  if (choices.length === 0) {
    strip.innerHTML = ''
    return
  }

  const show = (id) => {
    for (const chip of picker.children) chip.setAttribute('aria-pressed', String(chip.dataset.id === id))
    strip.innerHTML = stageStripHtml(choices.find((food) => food.id === id))
  }

  picker.innerHTML = choices.map((food) =>
    `<button type="button" class="chip" data-id="${escapeHtml(food.id)}" aria-pressed="false">${escapeHtml(food.name)}</button>`).join('')
  picker.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-id]')
    if (chip) show(chip.dataset.id)
  })
  show(choices[0].id)
}

await initLayout()
playDemo()

const preview = document.getElementById('guide-preview')
handleSaveButtons(preview)
try {
  const { foods } = await api.get('/api/foods')
  setupStages(foods)
  preview.innerHTML = foodListHtml(foods.slice(0, 5))
  document.getElementById('guide-heading').textContent = `A storage guide for ${foods.length} everyday foods`
} catch (error) {
  document.getElementById('stage-strip').innerHTML = ''
  preview.innerHTML = emptyStateHtml('Could not load the food guide', error.message)
}
