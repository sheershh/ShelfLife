// HTML builders for scan results, used by the scanner page and the scan history tab.

import { icon } from './icons.js'
import {
  escapeHtml, listHtml, RECOMMENDATION_LABELS, RIPENESS_LABELS, recommendationTag, scaleHtml, storageHtml,
} from './ui.js'

// Meter colour follows the score: green when fresh, through yellow and amber, to brown.
function scoreColor(score) {
  if (score >= 70) return 'var(--r-unripe)'
  if (score >= 45) return 'var(--r-peak)'
  if (score >= 20) return 'var(--r-over)'
  return 'var(--r-spoiled)'
}

const confidenceText = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence: try a closer, brighter photo for a better reading',
}

// The main result card shown in the chat after a photo is analysed.
// `food` is the matching ShelfLife record (grounding), or null if the food isn't in the guide.
export function verdictHtml(scan, food) {
  const score = scan.freshnessScore ?? 0
  const mould = scan.mould?.detected
    ? `<dd class="verdict-alert">${icon('alert')}Yes${scan.mould.where ? `, ${escapeHtml(scan.mould.where)}` : ''}</dd>`
    : '<dd>None seen</dd>'

  const guide = food ? `
    <div class="verdict-guide">
      <h4>From the ShelfLife guide</h4>
      <p class="verdict-guide-store">Best kept: ${storageHtml(food.storageLocation)} <span class="num">${escapeHtml(food.shelfLifePreview)}</span></p>
      <p>${escapeHtml(food.storageMethod)}</p>
      <a class="text-link" href="/food?id=${encodeURIComponent(food.id)}">Full guide for ${escapeHtml(food.name.toLowerCase())}</a>
    </div>` : `
    <div class="verdict-guide">
      <h4>Not in the ShelfLife guide yet</h4>
      <p>We don't have a storage record for this food, so ask a question below for general advice.</p>
    </div>`

  return `
    <article class="verdict" aria-label="Scan result for ${escapeHtml(scan.item)}">
      <header class="verdict-head">
        <div>
          <h3>${escapeHtml(scan.item)}</h3>
          <p class="verdict-confidence">${escapeHtml(confidenceText[scan.confidence] || '')}</p>
        </div>
        ${recommendationTag(scan.recommendation)}
      </header>

      ${scan.ripeness !== 'unknown' ? scaleHtml(scan.ripeness, score) : ''}

      <dl class="verdict-facts">
        <div>
          <dt>Freshness</dt>
          <dd><span class="num">${score}</span> / 100
            <span class="meter" data-value="${score}" data-color="${scoreColor(score)}"><span></span></span></dd>
        </div>
        <div><dt>Time left</dt><dd>${escapeHtml(scan.estimatedDaysLeft || 'Unclear')}</dd></div>
        <div><dt>Mould</dt>${mould}</div>
      </dl>

      ${scan.summary ? `<p class="verdict-summary">${escapeHtml(scan.summary)}</p>` : ''}
      ${scan.visibleSigns?.length ? `<div class="verdict-signs"><h4>What the scanner noticed</h4><ul>${listHtml(scan.visibleSigns)}</ul></div>` : ''}
      ${guide}
      <p class="verdict-disclaimer">Based on how it looks only. A photo can't show smell or bacteria: when in doubt, throw it out.</p>
    </article>`
}

// A compact list of past scans (Saved page, Scan history tab).
export function scanHistoryHtml(scans) {
  const rows = scans.map((scan) => {
    const when = new Date(scan.createdAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    const thumb = scan.thumbnail
      ? `<img src="${escapeHtml(scan.thumbnail)}" alt="" width="64" height="64">`
      : `<span class="scan-row-noimg">${icon('image')}</span>`
    const name = scan.matchedFood
      ? `<a href="/food?id=${encodeURIComponent(scan.matchedFood)}">${escapeHtml(scan.item)}</a>`
      : escapeHtml(scan.item)
    return `
      <li class="scan-row">
        ${thumb}
        <div class="scan-row-main">
          <strong>${name}</strong>
          <span>${escapeHtml(RIPENESS_LABELS[scan.ripeness] || 'Ripeness unclear')}${scan.mould?.detected ? ', mould seen' : ''}</span>
        </div>
        <span class="scan-row-score num" title="Freshness score">${scan.freshnessScore ?? '–'}</span>
        ${recommendationTag(scan.recommendation)}
        <time class="scan-row-time" datetime="${escapeHtml(scan.createdAt)}">${escapeHtml(when)}</time>
      </li>`
  }).join('')
  return `<ul class="scan-history">${rows}</ul>`
}

export { RECOMMENDATION_LABELS }
