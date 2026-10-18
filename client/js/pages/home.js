// Home page: plays the scanner demo once, lets visitors drag through the freshness stages of a food,
// and shows the food guide as four colour-blocked aisles. All food data comes from the API.

import { api } from '../api.js'
import { shelfLifeLabels } from '../constants.js'
import { initLayout, observeReveals } from '../layout.js'
import { applyDataStyles, emptyStateHtml, escapeHtml, listHtml, storageHtml } from '../ui.js'

const STAGE_FOODS = ['banana', 'tomato', 'mango', 'strawberry', 'bread', 'spinach', 'avocado']
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// The hero demo: a scan line sweeps the photo, then the reading settles. Plays once.
function playDemo() {
  const demo = document.getElementById('scanner-demo')
  const status = document.getElementById('demo-status-text')
  applyDataStyles(document.querySelector('.main'))
  const finish = () => {
    demo.classList.add('is-done')
    status.textContent = 'Read complete'
  }
  if (reduceMotion) return finish()
  demo.classList.add('is-scanning')
  setTimeout(finish, 2400)
}

// ---------- Stage reader (the one interactive thing on the page) ----------

// A food's stages are spread over the four-part ripeness scale: first stage = 0, last stage = 3.
const toneOf = (index, count) => Math.round((index / Math.max(1, count - 1)) * 3)

function stageHtml(food, index) {
  const stages = food.freshnessStages
  const stage = stages[index]
  const last = index === stages.length - 1
  const signs = last ? food.spoilageSigns : food.freshnessSigns
  return `
    <div class="stage-readout-body" data-tone="${toneOf(index, stages.length)}">
      <p class="label">${escapeHtml(food.name)} &nbsp;·&nbsp; stage <span class="num">${index + 1}</span> of <span class="num">${stages.length}</span></p>
      <p class="stage-name">${escapeHtml(stage.label)}</p>
      <p class="stage-desc">${escapeHtml(stage.description)}</p>
      <div class="stage-signs">
        <h4>${last ? 'Signs it may be spoiling' : 'Signs it is fresh'}</h4>
        <ul>${listHtml(signs.slice(0, 3))}</ul>
      </div>
      <a class="text-link" href="/food?id=${encodeURIComponent(food.id)}">Full guide for ${escapeHtml(food.name.toLowerCase())}</a>
    </div>`
}

function setupStageReader(foods) {
  const picker = document.getElementById('stage-food-picker')
  const strip = document.getElementById('stage-strip')
  const range = document.getElementById('stage-range')
  const spectrum = document.getElementById('spectrum')
  const choices = STAGE_FOODS.map((id) => foods.find((food) => food.id === id)).filter(Boolean)
  if (choices.length === 0) {
    strip.innerHTML = ''
    return
  }
  let food = choices[0]

  const showStage = () => {
    const index = Number(range.value)
    const tone = toneOf(index, food.freshnessStages.length)
    strip.innerHTML = stageHtml(food, index)
    range.setAttribute('aria-valuetext', food.freshnessStages[index].label)
    range.style.setProperty('--progress', `${(index / Math.max(1, range.max)) * 100}%`)
    for (const item of spectrum.children) item.classList.toggle('is-active', Number(item.dataset.stage) === tone)
  }
  const showFood = (id) => {
    food = choices.find((choice) => choice.id === id)
    for (const chip of picker.children) chip.setAttribute('aria-pressed', String(chip.dataset.id === id))
    range.max = String(food.freshnessStages.length - 1)
    range.value = '0'
    showStage()
  }

  picker.innerHTML = choices.map((choice) =>
    `<button type="button" class="chip" data-id="${escapeHtml(choice.id)}" aria-pressed="false">${escapeHtml(choice.name)}</button>`).join('')
  // The photos are only dimmed once the visitor starts reading stages, so the section opens in full colour.
  const startReading = () => spectrum.classList.add('is-reading')
  picker.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-id]')
    if (!chip) return
    startReading()
    showFood(chip.dataset.id)
  })
  range.addEventListener('input', () => {
    startReading()
    showStage()
  })
  range.disabled = false
  showFood(food.id)
}

// ---------- Food guide aisles ----------

// Each category is shown as one colour block with three of its foods and its real count.
const AISLES = [
  { category: 'Fruits', tone: 'orange', picks: ['mango', 'peach', 'strawberry'] },
  { category: 'Vegetables', tone: 'green', picks: ['broccoli', 'carrot', 'eggplant'] },
  { category: 'Dairy', tone: 'citrus', picks: ['milk', 'paneer', 'cheese'] },
  { category: 'Pantry & Grains', tone: 'ink', picks: ['bread', 'rice', 'pasta'] },
]

function aisleHtml(aisle, foods) {
  const inAisle = foods.filter((food) => food.category === aisle.category)
  // Use the chosen foods when they exist, otherwise the first foods of that category.
  const shown = aisle.picks.map((id) => inAisle.find((food) => food.id === id)).filter(Boolean)
  const photos = (shown.length ? shown : inAisle.slice(0, 3)).map((food) =>
    `<img src="${escapeHtml(food.image)}" alt="" loading="lazy" width="800" height="800">`).join('')
  return `
    <a class="aisle aisle-${aisle.tone} reveal" href="/foods?category=${encodeURIComponent(aisle.category)}">
      <span class="aisle-text">
        <span class="aisle-name">${escapeHtml(aisle.category)}</span>
        <span class="aisle-count"><span class="num">${inAisle.length}</span> foods</span>
      </span>
      <span class="aisle-photos" aria-hidden="true">${photos}</span>
    </a>`
}

function guideIndexHtml(foods) {
  const links = foods.map((food) => `<a href="/food?id=${encodeURIComponent(food.id)}">${escapeHtml(food.name)}</a>`)
  return `<span class="label">Everything in the guide</span> ${links.join('<span aria-hidden="true"> · </span>')}`
}

// The storage proof is a real record from the guide (tomato), not sample text.
function storageProofHtml(food) {
  const rows = Object.entries(shelfLifeLabels)
    .filter(([condition]) => food.shelfLife?.[condition])
    .map(([condition, label]) => `
      <tr class="${food.storageLocation === label ? 'is-best' : ''}">
        <th scope="row">${storageHtml(label)}</th>
        <td>${escapeHtml(food.shelfLife[condition])}</td>
      </tr>`).join('')
  return `
    <p class="label">From the guide: ${escapeHtml(food.name)}</p>
    <table class="proof-table"><caption class="visually-hidden">How long ${escapeHtml(food.name.toLowerCase())} keeps</caption><tbody>${rows}</tbody></table>
    <p class="proof-method">${escapeHtml(food.storageMethod)}</p>`
}

await initLayout()
playDemo()

const aisles = document.getElementById('aisles')
const proof = document.getElementById('proof-storage')
try {
  const { foods } = await api.get('/api/foods')
  setupStageReader(foods)

  aisles.innerHTML = AISLES.map((aisle) => aisleHtml(aisle, foods)).join('')
  document.getElementById('guide-index').innerHTML = guideIndexHtml(foods)
  document.getElementById('guide-link').textContent = `Open all ${foods.length} foods`
  document.getElementById('hero-food-count').textContent = `${foods.length} everyday`

  const tomato = foods.find((food) => food.id === 'tomato')
  proof.innerHTML = tomato ? storageProofHtml(tomato) : ''
  observeReveals(aisles)
} catch (error) {
  document.getElementById('stage-strip').innerHTML = ''
  aisles.innerHTML = emptyStateHtml('Could not load the food guide', error.message)
  proof.innerHTML = ''
}
