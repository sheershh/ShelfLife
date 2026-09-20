// Keeps track of who is logged in and which foods they have saved.
// The truth lives on the server (MongoDB); this is just a copy for the current page.

import { api, ApiError } from './api.js'

export const session = { user: null, savedIds: new Set() }

let loading = null

// Loads the session once per page; every caller gets the same promise.
export function initSession() {
  if (!loading) loading = loadSession()
  return loading
}

async function loadSession() {
  try {
    const { user } = await api.get('/api/auth/me')
    session.user = user
    if (user) {
      const { foods } = await api.get('/api/saved')
      session.savedIds = new Set(foods.map((food) => food.id))
    }
  } catch {
    session.user = null
    session.savedIds = new Set()
  }
}

// Saves or unsaves a food on the server. Returns true if it is now saved.
export async function toggleSaved(foodId) {
  const wasSaved = session.savedIds.has(foodId)
  const data = wasSaved ? await api.delete(`/api/saved/${foodId}`) : await api.post(`/api/saved/${foodId}`)
  setSavedIds(data.savedIds)
  return !wasSaved
}

export async function removeSaved(foodId) {
  const data = await api.delete(`/api/saved/${foodId}`)
  setSavedIds(data.savedIds)
}

function setSavedIds(ids) {
  session.savedIds = new Set(ids)
  document.dispatchEvent(new CustomEvent('saved-changed'))
}

export async function logout() {
  await api.post('/api/auth/logout')
  window.location.assign('/')
}

export { ApiError }
