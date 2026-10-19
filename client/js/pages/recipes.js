// "Use it up" page: recipe ideas come from GET /api/meta, matched with foods from the guide.

import { api, ApiError } from '../api.js'
import { expiryTag } from '../kitchen-ui.js'
import { initLayout } from '../layout.js'
import { session } from '../session.js'
import { emptyStateHtml, escapeHtml, goToLogin, listHtml } from '../ui.js'

const list = document.getElementById('recipe-list')
const cookPanel = document.getElementById('cook-panel')
const cookFoods = document.getElementById('cook-foods')
const cookResults = document.getElementById('cook-results')
const cookError = document.getElementById('cook-error')
const cookButton = document.getElementById('cook-button')

// ---------- Cook with what you have (logged-in users) ----------

function cookRecipeHtml(recipe, source) {
  return `
    <article class="cook-recipe">
      <h3>${escapeHtml(recipe.title)}${recipe.minutes ? ` <span class="shop-guide">${recipe.minutes} min</span>` : ''}</h3>
      ${recipe.uses.length ? `<p class="fd-muted">Uses ${recipe.uses.map(escapeHtml).join(', ')}</p>` : ''}
      ${source === 'guide' ? '<p class="fd-muted">Ideas from the ShelfLife guide:</p>' : ''}
      ${source === 'guide' ? `<ul class="tick-list">${listHtml(recipe.steps)}</ul>` : `<ol class="cook-steps">${listHtml(recipe.steps)}</ol>`}
    </article>`
}

async function loadSavedFoods() {
  try {
    const { foods } = await api.get('/api/saved')
    if (foods.length === 0) {
      cookPanel.hidden = false
      cookPanel.querySelector('form').hidden = true
      cookResults.innerHTML = emptyStateHtml('Nothing saved yet', 'Save foods from the guide, or add groceries, and ShelfLife will suggest recipes for them.',
        '<a href="/add" class="btn btn-primary btn-sm">Add groceries</a> <a href="/foods" class="btn btn-secondary btn-sm">Open the guide</a>')
      return
    }
    // Closest to the limit first; untracked foods follow.
    foods.sort((a, b) => (a.tracking?.daysLeft ?? Infinity) - (b.tracking?.daysLeft ?? Infinity))
    cookFoods.innerHTML = foods.map((food, index) => `
      <li><label><input type="checkbox" name="food" value="${escapeHtml(food.id)}" ${index < 4 ? 'checked' : ''}>
        <span><strong>${escapeHtml(food.name)}</strong> ${expiryTag(food.tracking)}</span></label></li>`).join('')
    cookPanel.hidden = false
  } catch {
    // The static ideas below still work without the personal panel.
  }
}

document.getElementById('cook-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const foodIds = [...cookFoods.querySelectorAll('input:checked')].map((input) => input.value)
  cookError.hidden = true
  if (foodIds.length === 0) {
    cookError.textContent = 'Tick at least one food.'
    cookError.hidden = false
    return
  }
  cookButton.disabled = true
  cookResults.innerHTML = '<p class="msg-thinking"><span class="dots" aria-hidden="true"><span></span><span></span><span></span></span>Thinking up recipes…</p>'
  try {
    const { recipes, source } = await api.post('/api/recipes', { foodIds })
    cookResults.innerHTML = recipes.length
      ? recipes.map((recipe) => cookRecipeHtml(recipe, source)).join('')
      : '<p class="fd-muted">No recipes came back. Try a different mix of foods.</p>'
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return goToLogin('scan')
    cookResults.innerHTML = ''
    cookError.textContent = error.message
    cookError.hidden = false
  } finally {
    cookButton.disabled = false
  }
})

// ---------- Quick ideas by food ----------

function recipeHtml(idea, food) {
  return `
    <article class="recipe">
      <div class="recipe-when">
        <span class="food-frame recipe-photo"><img src="${escapeHtml(food.image)}" alt="" loading="lazy" width="96" height="96"></span>
        <p>${escapeHtml(idea.useWhen)}</p>
      </div>
      <div class="recipe-body">
        <h2>${escapeHtml(idea.title)}</h2>
        <p>${escapeHtml(idea.description)}</p>
        <ul class="tick-list">${listHtml(idea.ideas)}</ul>
      </div>
      <a href="/food?id=${encodeURIComponent(food.id)}" class="text-link recipe-link">How to store ${escapeHtml(food.name.toLowerCase())}</a>
    </article>`
}

await initLayout()
if (session.user) loadSavedFoods()

try {
  const [{ recipes }, { foods }] = await Promise.all([api.get('/api/meta'), api.get('/api/foods')])
  const items = recipes
    .map((idea) => ({ idea, food: foods.find((food) => food.id === idea.foodId) }))
    .filter(({ food }) => food)
  list.innerHTML = items.length
    ? `<div class="recipes">${items.map(({ idea, food }) => recipeHtml(idea, food)).join('')}</div>`
    : emptyStateHtml('No ideas yet', 'Ideas appear here when their foods are in the guide.')
} catch (error) {
  list.innerHTML = emptyStateHtml('Could not load ideas', error.message)
}
