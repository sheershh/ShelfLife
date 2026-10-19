// HTML builders for scan results, used by the scanner page, the scan history tab and the fridge.
// Everything shown comes from the scan the server returned; nothing is filled in when a value is missing.

import { icon } from './icons.js'
import { fmt, scale } from './nutrition-ui.js'
import {
  escapeHtml, listHtml, RECOMMENDATION_LABELS, RIPENESS_LABELS, recommendationTag, scaleHtml, storageHtml,
} from './ui.js'

// Meter colour follows the score: green when fresh, through yellow and amber, to brown.
export function scoreColor(score) {
  if (score >= 70) return 'var(--r-unripe)'
  if (score >= 45) return 'var(--r-peak)'
  if (score >= 20) return 'var(--r-over)'
  return 'var(--r-spoiled)'
}

const confidenceText = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
}
const confidenceLevel = { low: 1, medium: 2, high: 3 }

// Three pips plus words, and a next step when the reading is not firm. `photos` is how many angles were sent.
function confidenceHtml(confidence, photos = 1) {
  const level = confidenceLevel[confidence] || 0
  const advice = level === 3 ? ''
    : photos < 3
      ? 'Add a second or third photo from other sides, in brighter light, for a firmer reading.'
      : 'Try a closer, brighter photo for a firmer reading.'
  return `
    <p class="confidence" data-level="${level}">
      <span class="confidence-pips" aria-hidden="true"><span></span><span></span><span></span></span>
      ${escapeHtml(confidenceText[confidence] || 'Confidence not given')}
    </p>
    ${advice ? `<p class="confidence-advice">${advice}</p>` : ''}`
}

// What the recommendation means in practice, shown under the call.
const recommendationAdvice = {
  eat: 'It looks fine to eat as it is.',
  'use-soon': 'Fine now, but plan to use it within a day or two.',
  'cook-today': 'Past its best raw. Cook, bake or blend it today.',
  discard: 'Throw it out. Do not cut around mould on soft food.',
  unsure: 'The photo was not clear enough for a firm call. Check it yourself.',
}

export function mouldHtml(mould) {
  return mould?.detected
    ? `<span class="verdict-alert">${icon('alert')}Yes${mould.where ? `, ${escapeHtml(mould.where)}` : ''}</span>`
    : 'None seen'
}

// "About 105 kcal in a medium banana" with a link to log it. Empty if the food has no nutrition record.
function nutritionLineHtml(food) {
  const n = food.nutrition
  if (!n?.per100g || !n.serving?.grams) return ''
  const v = scale(n.per100g, n.serving.grams)
  return `<p class="nutri-line">About <strong>${fmt(v.calories)} kcal</strong> per ${escapeHtml(n.serving.label)}: carbs ${fmt(v.carbs, 1)} g, fat ${fmt(v.fat, 1)} g, protein ${fmt(v.protein, 1)} g.
    <a class="text-link" href="/nutrition?add=${encodeURIComponent(food.id)}">Log it in your diary</a></p>`
}

// The main result card shown in the log after a photo is analysed.
// `food` is the matching ShelfLife record (grounding), or null if the food isn't in the guide.
export function verdictHtml(scan, food, { photos = 1 } = {}) {
  const score = scan.freshnessScore ?? 0

  const guide = food ? `
    <section class="verdict-block verdict-guide">
      <h4>From the ShelfLife guide</h4>
      <p class="verdict-guide-store">Best kept: ${storageHtml(food.storageLocation)} <span class="num">${escapeHtml(food.shelfLifePreview)}</span></p>
      <p>${escapeHtml(food.storageMethod)}</p>
      ${nutritionLineHtml(food)}
      <a class="text-link" href="/food?id=${encodeURIComponent(food.id)}">Full guide for ${escapeHtml(food.name.toLowerCase())}</a>
    </section>` : `
    <section class="verdict-block verdict-guide">
      <h4>Not in the ShelfLife guide yet</h4>
      <p>We don't have a storage record for this food, so ask a question below for general advice.</p>
    </section>`

  return `
    <article class="verdict" data-rec="${escapeHtml(scan.recommendation)}" aria-label="Scan result for ${escapeHtml(scan.item)}" data-ui>
      <header class="verdict-head">
        <p class="label">Reading${photos > 1 ? ` &nbsp;·&nbsp; ${photos} photos` : ''}</p>
        <h3>${escapeHtml(scan.item)}</h3>
        ${recommendationTag(scan.recommendation)}
        ${confidenceHtml(scan.confidence, photos)}
      </header>

      <div class="verdict-measure">
        <div class="verdict-score">
          <span class="verdict-score-num num" data-count="${score}">${score}</span>
          <span class="verdict-score-unit">/ 100<br>freshness</span>
          <span class="meter" data-value="${score}" data-color="${scoreColor(score)}"><span></span></span>
        </div>
        ${scan.ripeness !== 'unknown' ? scaleHtml(scan.ripeness, score) : '<p class="verdict-muted">Ripeness could not be judged from this photo.</p>'}
      </div>

      <section class="verdict-block">
        <h4>What the scanner saw</h4>
        ${scan.summary ? `<p class="verdict-summary">${escapeHtml(scan.summary)}</p>` : ''}
        ${scan.visibleSigns?.length ? `<ul class="verdict-signs">${listHtml(scan.visibleSigns)}</ul>` : ''}
        <dl class="verdict-facts">
          <div><dt>Mould</dt><dd>${mouldHtml(scan.mould)}</dd></div>
          <div><dt>Ripeness</dt><dd>${escapeHtml(RIPENESS_LABELS[scan.ripeness] || 'Unclear')}</dd></div>
        </dl>
      </section>

      <section class="verdict-block verdict-advice">
        <h4>What to do</h4>
        <p class="verdict-call">${escapeHtml(RECOMMENDATION_LABELS[scan.recommendation] || scan.recommendation)}</p>
        <p>${escapeHtml(recommendationAdvice[scan.recommendation] || '')}</p>
        <dl class="verdict-facts"><div><dt>Time left</dt><dd>${escapeHtml(scan.estimatedDaysLeft || 'Unclear')}</dd></div></dl>
      </section>

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
