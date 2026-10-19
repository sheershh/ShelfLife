// Shared pieces of the nutrition feature: number formatting, meal names, and the "nutrition facts"
// block shown on the food page. Figures are general estimates per 100 g from the food's own record.

import { escapeHtml } from './ui.js'

export const MEALS = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snack', label: 'Snacks' },
]

// Macro colours are brand colours, not the ripeness-scale colours (those mean freshness only).
export const MACROS = [
  { key: 'carbs', label: 'Carbs', color: 'var(--citrus)', kcalPerGram: 4 },
  { key: 'fat', label: 'Fat', color: 'var(--orange)', kcalPerGram: 9 },
  { key: 'protein', label: 'Protein', color: 'var(--botanical)', kcalPerGram: 4 },
]

// 1234.5 -> "1,235"; 26.94 -> "26.9"; 0 -> "0"
export const fmt = (value, decimals = 0) =>
  Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: decimals })

// The numbers for `grams` of a food (same rounding as the server).
export function scale(per100g, grams) {
  const f = grams / 100
  const r1 = (value) => Math.round((value || 0) * f * 10) / 10
  return { calories: Math.round((per100g.calories || 0) * f), carbs: r1(per100g.carbs), fat: r1(per100g.fat), protein: r1(per100g.protein), fibre: r1(per100g.fibre) }
}

// Share of calories from each macro, as whole percentages: { carbs, fat, protein } or null if there is nothing yet.
export function macroSplit(totals) {
  const kcal = Object.fromEntries(MACROS.map((m) => [m.key, (totals[m.key] || 0) * m.kcalPerGram]))
  const sum = kcal.carbs + kcal.fat + kcal.protein
  if (sum <= 0) return null
  const split = Object.fromEntries(MACROS.map((m) => [m.key, Math.round((kcal[m.key] / sum) * 100)]))
  return split
}

// "Nutrition facts" for the food page: per serving and per 100 g, with a link to log it.
export function nutritionFactsHtml(food) {
  const n = food.nutrition
  if (!n?.per100g) return ''
  const serving = n.serving?.grams ? scale(n.per100g, n.serving.grams) : null
  const cell = (values, key, unit = ' g') => `<td class="num">${fmt(values[key], key === 'calories' ? 0 : 1)}${key === 'calories' ? '' : unit}</td>`
  const rows = [['calories', 'Calories'], ['carbs', 'Carbohydrates'], ['fat', 'Fat'], ['protein', 'Protein'], ['fibre', 'Fibre']]
    .map(([key, label]) => `
      <tr><th scope="row">${label}${key === 'calories' ? ' <span class="nutri-unit">kcal</span>' : ''}</th>
        ${serving ? cell(serving, key) : ''}${cell(n.per100g, key)}</tr>`).join('')
  return `
    <section class="detail-section" aria-labelledby="nutrition-heading">
      <h2 id="nutrition-heading">Nutrition</h2>
      <div class="nutri-facts">
        <table class="nutri-table">
          <caption class="visually-hidden">Estimated nutrition for ${escapeHtml(food.name)}</caption>
          <thead><tr><th scope="col"><span class="visually-hidden">Nutrient</span></th>
            ${serving ? `<th scope="col">Per serving<span>${escapeHtml(n.serving.label)}</span></th>` : ''}
            <th scope="col">Per 100 g</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="nutri-side">
          ${n.basis ? `<p class="nutri-basis">Figures are for: ${escapeHtml(n.basis.toLowerCase())}.</p>` : ''}
          <p class="nutri-basis">General estimates. Real values vary with variety, ripeness and how it is cooked.</p>
          <a href="/nutrition?add=${encodeURIComponent(food.id)}" class="btn btn-primary">Log it in my diary</a>
        </div>
      </div>
    </section>`
}
