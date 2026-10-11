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

let categories = [ALL]
let searchText = ''
let selectedCategory = ALL
let totalFoods = 0
let latestRequest = 0

function renderCategoryButtons() {
  categoryFilter.innerHTML = categories
    .map((category) => `
      <button type="button" class="chip" aria-pressed="${category === selectedCategory}"
        data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`)
    .join('')
}

// Asks the API for the foods that match the current search text and category.
async function loadFoods() {
  const requestNumber = ++latestRequest
  const params = new URLSearchParams()
  if (searchText.trim()) params.set('search', searchText.trim())
  if (selectedCategory !== ALL) params.set('category', selectedCategory)

  try {
    const { foods } = await api.get(`/api/foods?${params}`)
    if (requestNumber !== latestRequest) return // a newer search has already started

    if (!searchText.trim() && selectedCategory === ALL) totalFoods = foods.length
    const text = `Showing ${foods.length} of ${totalFoods || foods.length} foods`
    resultCount.textContent = text
    resultCountVisible.textContent = foods.length > 0 ? text : ''

    results.innerHTML = foods.length > 0
      ? foodListHtml(foods)
      : emptyStateHtml('No foods match', 'Try another name, or clear the filters to see everything in the guide.',
          '<button type="button" class="btn btn-secondary" data-clear-filters>Clear search and filters</button>')
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
  renderCategoryButtons()
  loadFoods()
  searchInput.focus()
}

await initLayout()
handleSaveButtons(results)

// A ?category= link (e.g. from a food page) preselects that category.
const fromUrl = new URLSearchParams(window.location.search).get('category')
try {
  const meta = await api.get('/api/meta')
  categories = [ALL, ...meta.categories]
  if (meta.categories.includes(fromUrl)) selectedCategory = fromUrl
} catch {
  // Without the list we still show every food; the chips simply only offer "All foods".
}
renderCategoryButtons()

let searchTimer
searchInput.addEventListener('input', () => {
  searchText = searchInput.value
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadFoods, 250) // wait briefly so we do not call the API on every keystroke
})

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
