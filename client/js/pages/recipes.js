// "Use it up" page: recipe ideas come from GET /api/meta, matched with foods from the guide.

import { api } from '../api.js'
import { initLayout } from '../layout.js'
import { emptyStateHtml, escapeHtml, listHtml } from '../ui.js'

const list = document.getElementById('recipe-list')

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
