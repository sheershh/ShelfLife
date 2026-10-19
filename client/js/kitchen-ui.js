// Small HTML builders for the use-by countdown, shared by the fridge, the insights tab and the recipes page.
// `tracking` is the object the API returns for a saved food that has a purchase date (or null).

import { escapeHtml } from './ui.js'

export function expiryText(tracking) {
  const { state, daysLeft } = tracking
  if (state === 'expired') return daysLeft === -1 ? 'Past its best since yesterday' : `Past its best by ${-daysLeft} days`
  if (state === 'today') return 'Use today'
  return daysLeft === 1 ? '1 day left' : `${daysLeft} days left`
}

export const expiryTag = (tracking) =>
  tracking ? `<span class="expiry expiry-${tracking.state}">${escapeHtml(expiryText(tracking))}</span>` : ''

export const STORAGE_LABELS = { roomTemperature: 'Room temperature', refrigerator: 'Refrigerator', pantry: 'Pantry', freezer: 'Freezer' }

// "2026-10-14" -> "14 Oct"
export const shortDate = (isoDate) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })

export const todayIso = () => new Date().toISOString().slice(0, 10)
