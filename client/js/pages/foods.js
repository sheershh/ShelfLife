import { api } from '../api.js'
import { categories } from '../constants.js'
import { initLayout } from '../layout.js'
import { escapeHtml, foodGridHtml, handleSaveButtons, messageBoxHtml } from '../ui.js'

const searchInput = document.getElementById('food-search')
const categoryFilter = document.getElementById('category-filter')
const resultCount = document.getElementById('result-count')
const results = document.getElementById('food-results')

let searchText = ''
let selectedCategory = 'All Foods'
let totalFoods = 0
let latestRequest = 0

function renderCategoryButtons() {
  categoryFilter.innerHTML = categories
    .map((category) => `
      <button type="button" class="chip ${category === selectedCategory ? 'is-active' : ''}"
        aria-pressed="${category === selectedCategory}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`)
    .join('')
}

// Asks the API for the foods that match the current search text and category.
async function loadFoods() {
  const requestNumber = ++latestRequest
  const params = new URLSearchParams()
  if (searchText.trim()) params.set('search', searchText.trim())
  if (selectedCategory !== 'All Foods') params.set('category', selectedCategory)

  try {
    const { foods } = await api.get(`/api/foods?${params}`)
    if (requestNumber !== latestRequest) return // a newer search has already started

    if (!searchText.trim() && selectedCategory === 'All Foods') totalFoods = foods.length
    resultCount.textContent = `Showing ${foods.length} of ${totalFoods || foods.length} foods`

    results.innerHTML = foods.length > 0
      ? foodGridHtml(foods)
      : messageBoxHtml('No foods found', 'Try a different name or choose another category.',
          '<button type="button" class="btn btn-outline" data-clear-filters>Clear search and filters</button>')
  } catch (error) {
    if (requestNumber !== latestRequest) return
    resultCount.textContent = ''
    results.innerHTML = messageBoxHtml('Could not load foods', error.message,
      '<button type="button" class="btn btn-outline" data-retry>Try again</button>')
  }
}

function resetFilters() {
  searchText = ''
  selectedCategory = 'All Foods'
  searchInput.value = ''
  renderCategoryButtons()
  loadFoods()
}

await initLayout()
renderCategoryButtons()
handleSaveButtons(results)

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
