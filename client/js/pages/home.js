import { api } from '../api.js'
import { initLayout } from '../layout.js'
import { foodGridHtml, handleSaveButtons, messageBoxHtml } from '../ui.js'

const featuredIds = ['banana', 'strawberry', 'milk', 'bread']
const container = document.getElementById('featured-foods')

async function loadFeatured() {
  try {
    const { foods } = await api.get('/api/foods')
    const featured = featuredIds.map((id) => foods.find((food) => food.id === id)).filter(Boolean)
    container.innerHTML = foodGridHtml(featured, { featured: true })
  } catch (error) {
    container.innerHTML = messageBoxHtml('Could not load foods', error.message)
  }
}

await initLayout()
handleSaveButtons(container)
await loadFeatured()
