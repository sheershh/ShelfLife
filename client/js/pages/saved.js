// "Your shelf": saved foods and scan history, shown as two tabs.

import { api } from '../api.js'
import { initLayout } from '../layout.js'
import { scanHistoryHtml } from '../scan-ui.js'
import { session } from '../session.js'
import { applyDataStyles, emptyStateHtml, foodListHtml, handleSaveButtons, showToast } from '../ui.js'

const savedResults = document.getElementById('saved-results')
const scanResults = document.getElementById('scan-results')
const tabs = [...document.querySelectorAll('[role="tab"]')]

const noSavedHtml = () =>
  emptyStateHtml('Nothing saved yet', 'Save foods from the guide to keep their storage advice one tap away.',
    '<a href="/foods" class="btn btn-primary">Open the food guide</a>')
const noScansHtml = () =>
  emptyStateHtml('No scans yet', 'Photos you check with the scanner will appear here with their results.',
    '<a href="/scan" class="btn btn-primary">Scan a photo</a>')

// Accessible tabs: click or arrow keys switch panels.
function selectTab(tab) {
  for (const other of tabs) {
    const selected = other === tab
    other.setAttribute('aria-selected', String(selected))
    other.tabIndex = selected ? 0 : -1
    document.getElementById(other.getAttribute('aria-controls')).hidden = !selected
  }
  history.replaceState(null, '', tab.id === 'tab-scans' ? '#scans' : '#saved')
  if (tab.id === 'tab-scans' && !scanResults.dataset.loaded) loadScans()
}

function setupTabs() {
  for (const tab of tabs) {
    tab.addEventListener('click', () => selectTab(tab))
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
      const next = tabs[(tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]
      next.focus()
      selectTab(next)
    })
  }
  if (window.location.hash === '#scans') selectTab(tabs[1])
}

async function loadSaved() {
  try {
    const { foods } = await api.get('/api/saved')
    savedResults.innerHTML = foods.length > 0 ? foodListHtml(foods, { removable: true }) : noSavedHtml()
  } catch (error) {
    savedResults.innerHTML = emptyStateHtml('Could not load your saved foods', error.message)
  }
}

async function loadScans() {
  scanResults.dataset.loaded = 'true'
  scanResults.innerHTML = '<div class="skeleton guide-skeleton"></div>'
  try {
    const { scans } = await api.get('/api/scans')
    scanResults.innerHTML = scans.length > 0
      ? `${scanHistoryHtml(scans)}<button type="button" class="btn btn-ghost btn-sm" data-clear-scans>Clear scan history</button>`
      : noScansHtml()
    applyDataStyles(scanResults)
  } catch (error) {
    scanResults.innerHTML = emptyStateHtml('Could not load your scans', error.message)
  }
}

await initLayout()

if (!session.user) {
  document.querySelector('.tabs').hidden = true
  savedResults.innerHTML = emptyStateHtml('Log in to see your shelf', 'Saved foods and scans are kept in your account.',
    '<a href="/login?next=/saved" class="btn btn-primary">Log in</a><a href="/signup" class="btn btn-secondary">Create account</a>')
} else {
  setupTabs()
  handleSaveButtons(savedResults, {
    onRemoved: (foodId) => {
      // Remove the row from the page without another request.
      savedResults.querySelector(`[data-food-id="${CSS.escape(foodId)}"]`)?.closest('.food-row')?.remove()
      if (!savedResults.querySelector('.food-row')) savedResults.innerHTML = noSavedHtml()
    },
  })
  scanResults.addEventListener('click', async (event) => {
    if (!event.target.closest('[data-clear-scans]')) return
    try {
      await api.delete('/api/scans')
      scanResults.innerHTML = noScansHtml()
      showToast('Scan history cleared.')
    } catch (error) {
      showToast(error.message)
    }
  })
  await loadSaved()
}
