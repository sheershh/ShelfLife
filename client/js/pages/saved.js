import { api } from '../api.js'
import { initLayout } from '../layout.js'
import { session } from '../session.js'
import { foodGridHtml, handleSaveButtons, messageBoxHtml } from '../ui.js'

const results = document.getElementById('saved-results')

const emptyHtml = () =>
  messageBoxHtml('Nothing saved yet', "You haven't saved any foods. Explore foods and save your favorites here.",
    '<a href="/foods" class="btn btn-primary">Explore Foods</a>')

async function showSavedFoods() {
  try {
    const { foods } = await api.get('/api/saved')
    results.innerHTML = foods.length > 0 ? foodGridHtml(foods, { showRemove: true }) : emptyHtml()
  } catch (error) {
    results.innerHTML = messageBoxHtml('Could not load your saved foods', error.message)
  }
}

await initLayout()

if (!session.user) {
  results.innerHTML = messageBoxHtml('Log in to see your saved foods', 'Saved foods are kept in your account.',
    '<div class="button-row"><a href="/login?next=/saved" class="btn btn-primary">Login</a><a href="/signup" class="btn btn-outline">Signup</a></div>')
} else {
  handleSaveButtons(results, {
    onRemoved: (foodId) => {
      // Remove the card from the page without another request.
      const button = results.querySelector(`[data-food-id="${CSS.escape(foodId)}"]`)
      if (button) button.closest('.food-card').remove()
      if (!results.querySelector('.food-card')) results.innerHTML = emptyHtml()
    },
  })
  await showSavedFoods()
}
