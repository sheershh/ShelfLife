// Food guide: search by name and filter by category. Both are sent to the API together.

import { api } from '../api.js'
import { initLayout } from '../layout.js'
import { emptyStateHtml, escapeHtml, foodListHtml, handleSaveButtons } from '../ui.js'

const ALL = 'All foods'
const searchInput = document.getElementById('food-search')
const categoryFilter = document.getElementById('category-filter')
const resultCount = document.getElementById('result-count')
const resultCountVisible = document.getElementById('result-count-visible')
const results = document.getElementById('food-results')
// The three dropdowns under the search box; the key is the API query parameter each one sets.
const refine = {
  storage: document.getElementById('storage-filter'),
  lasting: document.getElementById('lasting-filter'),
  sort: document.getElementById('sort-by'),
}

let categories = [ALL]
let countByCategory = {} // e.g. { Fruits: 18 }, from one request for all foods
let searchText = ''
let selectedCategory = ALL
let totalFoods = 0
let latestRequest = 0

// Category filters: each has a colour swatch and the number of foods in it.
const categoryTone = { 'All foods': 'tomato', Fruits: 'orange', Vegetables: 'green', Dairy: 'citrus', 'Pantry & Grains': 'ink' }

function renderCategoryButtons() {
  categoryFilter.innerHTML = categories
    .map((category) => {
      const count = category === ALL ? totalFoods : countByCategory[category]
      return `
      <button type="button" class="cat cat-${categoryTone[category] || 'ink'}" aria-pressed="${category === selectedCategory}"
        data-category="${escapeHtml(category)}">
        <span class="cat-swatch" aria-hidden="true"></span>${escapeHtml(category)}
        ${count ? `<span class="cat-count num">${count}</span>` : ''}
      </button>`
    })
    .join('')
}

// Asks the API for the foods that match the current search text and category.
async function loadFoods() {
  const requestNumber = ++latestRequest
  const params = new URLSearchParams()
  if (searchText.trim()) params.set('search', searchText.trim())
  if (selectedCategory !== ALL) params.set('category', selectedCategory)
  for (const [name, select] of Object.entries(refine)) if (select.value) params.set(name, select.value)

  try {
    const { foods } = await api.get(`/api/foods?${params}`)
    if (requestNumber !== latestRequest) return // a newer search has already started

    const refined = Object.values(refine).some((select) => select.value && select !== refine.sort)
    if (!searchText.trim() && selectedCategory === ALL && !refined) totalFoods = foods.length
    const text = `Showing ${foods.length} of ${totalFoods || foods.length} foods`
    resultCount.textContent = text
    resultCountVisible.textContent = foods.length > 0 ? text : ''

    results.innerHTML = foods.length > 0
      ? foodListHtml(foods)
      : emptyStateHtml('No foods match', 'Try another name, or clear the filters to see everything in the guide.',
          '<button type="button" class="btn btn-secondary" data-clear-filters>Clear search and filters</button>')
    // Rows arrive one after another (the delay comes from --i, set here because CSP blocks inline styles).
    results.querySelectorAll('.food-row').forEach((row, index) => row.style.setProperty('--i', index))
  } catch (error) {
    if (requestNumber !== latestRequest) return
    resultCount.textContent = ''
    resultCountVisible.textContent = ''
    results.innerHTML = emptyStateHtml('Could not load foods', error.message,
      '<button type="button" class="btn btn-secondary" data-retry>Try again</button>')
  }
}

function resetFilters() {
  searchText = ''
  selectedCategory = ALL
  searchInput.value = ''
  for (const select of Object.values(refine)) select.value = ''
  renderCategoryButtons()
  loadFoods()
  searchInput.focus()
}

await initLayout()
handleSaveButtons(results)

// A ?category= link (e.g. from a food page) preselects that category.
const fromUrl = new URLSearchParams(window.location.search).get('category')
try {
  const [meta, all] = await Promise.all([api.get('/api/meta'), api.get('/api/foods')])
  categories = [ALL, ...meta.categories]
  if (meta.categories.includes(fromUrl)) selectedCategory = fromUrl
  totalFoods = all.foods.length
  for (const food of all.foods) countByCategory[food.category] = (countByCategory[food.category] || 0) + 1
} catch {
  // Without the list we still show every food; the filters simply only offer "All foods".
}
renderCategoryButtons()

let searchTimer
searchInput.addEventListener('input', () => {
  searchText = searchInput.value
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadFoods, 250) // wait briefly so we do not call the API on every keystroke
})

for (const select of Object.values(refine)) select.addEventListener('change', loadFoods)

categoryFilter.addEventListener('click', (event) => {
  const button = event.target.closest('[data-category]')
  if (!button) return
  selectedCategory = button.dataset.category
  renderCategoryButtons()
  loadFoods()
})

results.addEventListener('click', (event) => {
  if (event.target.closest('[data-clear-filters]')) resetFilters()
  if (event.target.closest('[data-retry]')) loadFoods()
})

await loadFoods()
