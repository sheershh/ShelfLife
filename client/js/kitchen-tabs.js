// The Shopping list and Insights tabs of the Saved page.
//   GET/POST/DELETE /api/shopping      the shopping list
//   GET /api/insights                  used / wasted in the last 30 days, and what to use up now

import { api, ApiError } from './api.js'
import { expiryTag } from './kitchen-ui.js'
import { animateNumbers, applyDataStyles, emptyStateHtml, escapeHtml, goToLogin, showToast } from './ui.js'

const fail = (error) => {
  if (error instanceof ApiError && error.status === 401) return goToLogin()
  showToast(error.message)
}

// ---------- Shopping list ----------

// onBought(savedIds) runs when a guide food was moved onto the fridge shelves.
export function initShopping(panel, { onBought } = {}) {
  let items = []
  let guideFoods = []

  const render = () => {
    panel.innerHTML = `
      <div class="container kitchen-panel">
        <form class="shop-add" id="shop-form" novalidate>
          <label for="shop-input" class="visually-hidden">Add something to your shopping list</label>
          <input id="shop-input" name="name" type="text" maxlength="60" list="shop-foods" autocomplete="off"
            placeholder="Add an item, e.g. spinach or atta" />
          <datalist id="shop-foods">${guideFoods.map((food) => `<option value="${escapeHtml(food.name)}"></option>`).join('')}</datalist>
          <button type="submit" class="btn btn-primary">Add</button>
        </form>
        <p class="form-error" id="shop-error" role="alert" hidden></p>
        ${items.length === 0
          ? emptyStateHtml('Your list is empty', 'Add what you need. Foods from the guide land on your fridge shelves when you tick them off as bought.')
          : `<ul class="shop-list">${items.map((item) => `
              <li class="shop-item">
                <button type="button" class="shop-check" data-bought="${escapeHtml(item.id)}"
                  aria-label="Mark ${escapeHtml(item.name)} as bought"></button>
                <span class="shop-name">${escapeHtml(item.name)}${item.foodId ? ' <span class="shop-guide">in the guide</span>' : ''}</span>
                <button type="button" class="btn btn-ghost btn-sm" data-drop="${escapeHtml(item.id)}"
                  aria-label="Remove ${escapeHtml(item.name)} from the list">Remove</button>
              </li>`).join('')}</ul>
            <button type="button" class="btn btn-ghost btn-sm" data-clear-list>Clear the list</button>`}
      </div>`
  }

  panel.addEventListener('submit', async (event) => {
    event.preventDefault()
    const input = panel.querySelector('#shop-input')
    const text = input.value.trim()
    if (!text) return
    const error = panel.querySelector('#shop-error')
    error.hidden = true
    // A name that matches a guide food is added as that food, so ticking it off puts it on the shelves.
    const food = guideFoods.find((entry) => entry.name.toLowerCase() === text.toLowerCase())
    try {
      items = (await api.post('/api/shopping', food ? { foodId: food.id } : { name: text })).items
      render()
      panel.querySelector('#shop-input').focus()
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) return goToLogin()
      error.textContent = caught.message
      error.hidden = false
    }
  })

  panel.addEventListener('click', async (event) => {
    const bought = event.target.closest('[data-bought]')
    const drop = event.target.closest('[data-drop]')
    try {
      if (bought) {
        const data = await api.post(`/api/shopping/${bought.dataset.bought}/bought`)
        items = data.items
        if (data.savedIds) {
          onBought?.(data.savedIds)
          showToast('Added to your fridge, bought today.')
        }
        render()
      } else if (drop) {
        items = (await api.delete(`/api/shopping/${drop.dataset.drop}`)).items
        render()
      } else if (event.target.closest('[data-clear-list]')) {
        items = (await api.delete('/api/shopping')).items
        render()
      }
    } catch (error) {
      fail(error)
    }
  })

  return {
    async load() {
      panel.innerHTML = '<div class="container"><div class="skeleton guide-skeleton"></div></div>'
      try {
        const [list, foods] = await Promise.all([api.get('/api/shopping'), api.get('/api/foods')])
        items = list.items
        guideFoods = foods.foods
        render()
      } catch (error) {
        panel.innerHTML = `<div class="container">${emptyStateHtml('Could not load your list', error.message)}</div>`
      }
    },
  }
}

// ---------- Insights ----------

export async function loadInsights(panel) {
  panel.innerHTML = '<div class="container"><div class="skeleton guide-skeleton"></div></div>'
  try {
    const data = await api.get('/api/insights')
    const total = data.used + data.wasted
    const useSoon = data.useSoon.length === 0
      ? `<p class="fd-muted">${data.tracked === 0
        ? 'Open a food in your fridge and set when you bought it. ShelfLife will count down the days for you.'
        : 'Nothing is close to its limit. Well done.'}</p>`
      : `<ul class="soon-list">${data.useSoon.map((food) => `
          <li><img src="${escapeHtml(food.image)}" alt="" width="48" height="48">
            <a href="/food?id=${encodeURIComponent(food.id)}">${escapeHtml(food.name)}</a>${expiryTag(food)}</li>`).join('')}</ul>
         <a href="/recipes" class="btn btn-primary btn-sm">Get recipe ideas for these</a>`

    panel.innerHTML = `
      <div class="container kitchen-panel">
        <div class="insight-grid">
          <section class="insight">
            <h2>Last ${data.days} days</h2>
            ${total === 0
              ? '<p class="fd-muted">Nothing logged yet. When you finish a food, tell ShelfLife whether you used it or threw it away and your stats appear here.</p>'
              : `<p class="insight-big"><span class="num" data-count="${data.usedShare}" data-suffix="%">${data.usedShare}%</span> of your food was used</p>
                 <span class="meter" data-value="${data.usedShare}" data-color="var(--r-unripe)"><span></span></span>
                 <dl class="fd-facts">
                   <div><dt>Used</dt><dd class="num" data-count="${data.used}">${data.used}</dd></div>
                   <div><dt>Thrown away</dt><dd class="num" data-count="${data.wasted}">${data.wasted}</dd></div>
                 </dl>`}
            ${data.mostWasted.length ? `<p class="insight-note">Most thrown away: ${data.mostWasted.map((food) => `${escapeHtml(food.name)} (${food.times})`).join(', ')}. Try buying a little less of ${data.mostWasted.length > 1 ? 'these' : 'this'}.</p>` : ''}
          </section>
          <section class="insight">
            <h2>Use these up first</h2>
            ${useSoon}
          </section>
        </div>
      </div>`
    applyDataStyles(panel)
    animateNumbers(panel)
  } catch (error) {
    panel.innerHTML = `<div class="container">${emptyStateHtml('Could not load your insights', error.message)}</div>`
  }
}
