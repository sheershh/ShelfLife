import { api } from '../api.js'
import { initLayout } from '../layout.js'
import { recipeIdeas } from '../recipes-data.js'
import { escapeHtml, messageBoxHtml } from '../ui.js'

const grid = document.getElementById('recipe-grid')

function recipeCardHtml(idea, food) {
  return `
    <article class="recipe-card">
      <img class="recipe-image" src="${escapeHtml(food.image)}" alt="${escapeHtml(food.name)}" loading="lazy">
      <div class="recipe-body">
        <p class="food-card-category">${escapeHtml(idea.useWhen)}</p>
        <h2>${escapeHtml(idea.title)}</h2>
        <p>${escapeHtml(idea.description)}</p>
        <ul class="check-list">${idea.ideas.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ul>
        <a href="/food?id=${encodeURIComponent(food.id)}" class="text-link">About ${escapeHtml(food.name)} storage →</a>
      </div>
    </article>`
}

await initLayout()

try {
  const { foods } = await api.get('/api/foods')
  const cards = recipeIdeas
    .map((idea) => ({ idea, food: foods.find((food) => food.id === idea.foodId) }))
    .filter(({ food }) => food)
    .map(({ idea, food }) => recipeCardHtml(idea, food))
  grid.innerHTML = cards.join('')
} catch (error) {
  grid.innerHTML = messageBoxHtml('Could not load ideas', error.message)
}
