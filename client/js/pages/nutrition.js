// Nutrition diary: pick a day, log foods by meal, and see calories, carbs, fat and protein against goals.
//   GET    /api/nutrition/day?date=      the day's entries, totals and goals
//   GET    /api/nutrition/week?end=      the 7 days ending on that date
//   POST   /api/nutrition/entries        log a guide food (grams) or a custom entry
//   DELETE /api/nutrition/entries/:id    remove an entry
//   PUT    /api/nutrition/goals          save daily goals
// A ?add=banana link (from the food page or the scanner) opens the add dialog on that food.

import { api, ApiError } from '../api.js'
import { initLayout } from '../layout.js'
import { fmt, macroSplit, MACROS, MEALS, scale } from '../nutrition-ui.js'
import { session } from '../session.js'
import { animateNumbers, applyDataStyles, emptyStateHtml, escapeHtml, goToLogin, showToast } from '../ui.js'

const DEFAULT_GOALS = { calories: 2000, carbs: 250, fat: 65, protein: 50 }

const app = document.getElementById('nutri-app')
const dayTitle = document.getElementById('day-title')
const dayPicker = document.getElementById('day-picker')
const nextButton = document.getElementById('day-next')
const statusEl = document.getElementById('nutri-status')
const ringEl = document.getElementById('nutri-ring')
const macrosEl = document.getElementById('nutri-macros')
const mealList = document.getElementById('meal-list')
const weekEl = document.getElementById('nutri-week')
const addDialog = document.getElementById('add-dialog')
const addBody = document.getElementById('add-body')
const goalsDialog = document.getElementById('goals-dialog')
const goalsForm = document.getElementById('goals-form')

// ---------- Dates (the person's own calendar day) ----------

const pad = (n) => String(n).padStart(2, '0')
const toIso = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const today = () => toIso(new Date())
const fromIso = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const shift = (iso, days) => {
  const date = fromIso(iso)
  date.setDate(date.getDate() + days)
  return toIso(date)
}

function dayLabel(iso) {
  if (iso === today()) return 'Today'
  if (iso === shift(today(), -1)) return 'Yesterday'
  return fromIso(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

// A sensible meal for "now", used when a food is added from another page.
function guessMeal() {
  const hour = new Date().getHours()
  return hour < 11 ? 'breakfast' : hour < 16 ? 'lunch' : hour < 21 ? 'dinner' : 'snack'
}

// ---------- State ----------

let date = today()
let day = null // { goals, customGoals, entries, totals }
let week = null
let foods = [] // guide foods that have nutrition figures
let latest = 0
let opener = null

const fail = (error) => {
  if (error instanceof ApiError && error.status === 401) return goToLogin('nutrition')
  showToast(error.message)
}

// ---------- Summary: calorie ring and macro bars ----------

function ringHtml({ totals, goals }) {
  const pct = Math.min(100, (totals.calories / goals.calories) * 100)
  const over = totals.calories > goals.calories
  const left = goals.calories - totals.calories
  return `
    <svg class="ring" viewBox="0 0 120 120" role="img" aria-label="${fmt(totals.calories)} of ${fmt(goals.calories)} calories">
      <circle class="ring-track" cx="60" cy="60" r="52" pathLength="100" />
      <circle class="ring-fill ${over ? 'is-over' : ''}" cx="60" cy="60" r="52" pathLength="100"
        stroke-dasharray="${pct.toFixed(1)} 100" transform="rotate(-90 60 60)" />
    </svg>
    <div class="ring-center">
      <span class="ring-num num" data-count="${totals.calories}">${fmt(totals.calories)}</span>
      <span class="ring-of">of ${fmt(goals.calories)} kcal</span>
      <strong class="ring-left ${over ? 'is-over' : ''}">${over ? `${fmt(-left)} over` : `${fmt(left)} left`}</strong>
    </div>`
}

function macrosHtml({ totals, goals }) {
  const rows = MACROS.map((macro) => {
    const value = totals[macro.key]
    const goal = goals[macro.key]
    const pct = goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0
    return `
      <div class="macro">
        <div class="macro-head">
          <span class="macro-name"><i class="macro-dot" data-color="${macro.color}"></i>${macro.label}</span>
          <span class="num"><strong>${fmt(value, 1)}</strong> / ${fmt(goal)} g</span>
        </div>
        <span class="meter" data-value="${pct}" data-color="${macro.color}"><span></span></span>
      </div>`
  }).join('')

  const split = macroSplit(totals)
  const splitHtml = split ? `
    <div class="split" role="img" aria-label="Calories from carbs ${split.carbs} percent, fat ${split.fat} percent, protein ${split.protein} percent">
      ${MACROS.map((m) => `<span data-value="${split[m.key]}" data-color="${m.color}"></span>`).join('')}
    </div>
    <p class="split-legend">Where today's calories come from: ${MACROS.map((m) => `${m.label.toLowerCase()} <strong>${split[m.key]}%</strong>`).join(' · ')}</p>` : `
    <p class="split-legend">Log a food to see where your calories come from.</p>`
  return `${rows}${splitHtml}<p class="split-legend">Fibre <strong>${fmt(totals.fibre, 1)} g</strong></p>`
}

// ---------- Meals ----------

function entryHtml(entry) {
  const thumb = entry.image
    ? `<span class="food-frame entry-thumb"><img src="${escapeHtml(entry.image)}" alt="" loading="lazy" width="48" height="48"></span>`
    : '<span class="entry-thumb entry-custom" aria-hidden="true">✎</span>'
  return `
    <li class="entry">
      ${thumb}
      <div class="entry-main">
        <strong>${entry.foodId ? `<a href="/food?id=${encodeURIComponent(entry.foodId)}">${escapeHtml(entry.name)}</a>` : escapeHtml(entry.name)}</strong>
        <span>${entry.grams ? `${fmt(entry.grams, 1)} g · ` : ''}C ${fmt(entry.carbs, 1)} · F ${fmt(entry.fat, 1)} · P ${fmt(entry.protein, 1)}</span>
      </div>
      <span class="entry-kcal num">${fmt(entry.calories)}<small> kcal</small></span>
      <button type="button" class="entry-remove" data-remove="${escapeHtml(entry.id)}" aria-label="Remove ${escapeHtml(entry.name)}">×</button>
    </li>`
}

function mealsHtml(entries) {
  return MEALS.map((meal) => {
    const list = entries.filter((entry) => entry.meal === meal.id)
    const kcal = list.reduce((sum, entry) => sum + entry.calories, 0)
    return `
      <section class="meal" aria-labelledby="meal-${meal.id}">
        <header class="meal-head">
          <h2 id="meal-${meal.id}">${meal.label}</h2>
          <span class="meal-kcal num">${list.length ? `${fmt(kcal)} kcal` : ''}</span>
          <button type="button" class="btn btn-secondary btn-sm" data-add="${meal.id}">+ Add food</button>
        </header>
        ${list.length ? `<ul class="entries">${list.map(entryHtml).join('')}</ul>` : '<p class="meal-empty">Nothing logged yet.</p>'}
      </section>`
  }).join('')
}

// ---------- The last 7 days ----------

function weekHtml({ days, goals, averages }) {
  const max = Math.max(goals.calories * 1.25, ...days.map((d) => d.calories))
  const goalAt = Math.round((goals.calories / max) * 100)
  const bars = days.map((d) => {
    const pct = Math.round((d.calories / max) * 100)
    const letter = fromIso(d.date).toLocaleDateString(undefined, { weekday: 'short' })
    return `
      <li>
        <button type="button" class="week-bar ${d.date === date ? 'is-selected' : ''} ${d.calories > goals.calories * 1.1 ? 'is-over' : ''}" data-date="${d.date}"
          aria-label="${escapeHtml(dayLabel(d.date))}: ${d.logged ? `${fmt(d.calories)} calories` : 'nothing logged'}" aria-pressed="${d.date === date}">
          <span class="week-kcal num">${d.logged ? fmt(d.calories) : ''}</span>
          <span class="week-track"><span class="week-fill" data-value="${pct}"></span></span>
          <span class="week-day">${letter}</span>
        </button>
      </li>`
  }).join('')
  return `
    <div class="week-chart">
      <span class="week-goal" data-goal="${goalAt}"><span>Goal ${fmt(goals.calories)}</span></span>
      <ol class="week-bars">${bars}</ol>
    </div>
    <p class="split-legend">${averages.loggedDays
      ? `Average on the ${averages.loggedDays} ${averages.loggedDays === 1 ? 'day' : 'days'} you logged: <strong>${fmt(averages.calories)} kcal</strong> · carbs <strong>${fmt(averages.carbs)} g</strong> · fat <strong>${fmt(averages.fat)} g</strong> · protein <strong>${fmt(averages.protein)} g</strong>`
      : 'Log a few days and your averages appear here.'}</p>`
}

// ---------- Loading and drawing ----------

function renderDay() {
  dayTitle.textContent = dayLabel(date)
  dayPicker.value = date
  dayPicker.max = today()
  nextButton.disabled = date >= today()
  ringEl.innerHTML = ringHtml(day)
  macrosEl.innerHTML = macrosHtml(day)
  mealList.innerHTML = mealsHtml(day.entries)
  applyDataStyles(app)
  animateNumbers(ringEl)
  statusEl.textContent = `${dayLabel(date)}: ${fmt(day.totals.calories)} of ${fmt(day.goals.calories)} calories.`
}

const renderWeek = () => {
  weekEl.innerHTML = weekHtml(week)
  applyDataStyles(weekEl)
  const goal = weekEl.querySelector('[data-goal]')
  goal.style.setProperty('--goal', goal.dataset.goal) // a plain number: CSS turns it into a height
}

async function load({ keepScroll = true } = {}) {
  const request = ++latest
  try {
    const [dayData, weekData] = await Promise.all([
      api.get(`/api/nutrition/day?date=${date}`),
      api.get(`/api/nutrition/week?end=${date}`),
    ])
    if (request !== latest) return // a newer day was chosen meanwhile
    day = dayData
    week = weekData
    const y = window.scrollY
    renderDay()
    renderWeek()
    if (keepScroll) window.scrollTo(0, y)
  } catch (error) {
    if (request === latest) mealList.innerHTML = emptyStateHtml('Could not load your diary', error.message)
    fail(error)
  }
}

function goTo(iso) {
  if (!iso || iso > today()) return
  date = iso
  load({ keepScroll: false })
}

// ---------- Add food dialog ----------

const mealOptions = (selected) => MEALS.map((m) => `<option value="${m.id}" ${m.id === selected ? 'selected' : ''}>${m.label}</option>`).join('')

function pickHtml({ meal, tab = 'guide', query = '' }) {
  const saved = session.savedIds
  const list = foods
    .filter((food) => food.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => Number(saved.has(b.id)) - Number(saved.has(a.id)))
  return `
    <button type="button" class="fd-close" data-close aria-label="Close">×</button>
    <h2 id="add-title">Add food</h2>
    <div class="field"><label for="add-meal">Meal</label><select id="add-meal" data-meal>${mealOptions(meal)}</select></div>
    <div class="chips" role="group" aria-label="What to add">
      <button type="button" class="chip" data-tab="guide" aria-pressed="${tab === 'guide'}">Guide foods</button>
      <button type="button" class="chip" data-tab="custom" aria-pressed="${tab === 'custom'}">Custom entry</button>
    </div>
    ${tab === 'guide' ? `
      <div class="search-input">
        <label for="add-search" class="visually-hidden">Search foods</label>
        <input id="add-search" type="search" placeholder="Search foods…" value="${escapeHtml(query)}" autocomplete="off" />
      </div>
      <ul class="pick-list" id="pick-list">${list.length ? list.map((food) => `
        <li><button type="button" class="pick" data-pick="${escapeHtml(food.id)}">
          <span class="food-frame pick-thumb"><img src="${escapeHtml(food.image)}" alt="" loading="lazy" width="44" height="44"></span>
          <span class="pick-name"><strong>${escapeHtml(food.name)}</strong>${saved.has(food.id) ? '<span class="shop-guide">in your fridge</span>' : ''}</span>
          <span class="pick-kcal num">${fmt(scale(food.nutrition.per100g, food.nutrition.serving.grams).calories)} kcal<small>${escapeHtml(food.nutrition.serving.label)}</small></span>
        </button></li>`).join('') : '<li class="meal-empty">No foods match.</li>'}</ul>` : `
      <form id="custom-form" novalidate>
        <p class="form-error" data-error role="alert" hidden></p>
        <div class="field"><label for="c-name">Name</label><input id="c-name" name="name" maxlength="60" placeholder="e.g. Samosa" required /><p class="field-error" hidden></p></div>
        <div class="custom-grid">
          <div class="field"><label for="c-cal">Calories (kcal)</label><input id="c-cal" name="calories" type="number" inputmode="decimal" min="0" required /><p class="field-error" hidden></p></div>
          <div class="field"><label for="c-carbs">Carbs (g)</label><input id="c-carbs" name="carbs" type="number" inputmode="decimal" min="0" /><p class="field-error" hidden></p></div>
          <div class="field"><label for="c-fat">Fat (g)</label><input id="c-fat" name="fat" type="number" inputmode="decimal" min="0" /><p class="field-error" hidden></p></div>
          <div class="field"><label for="c-protein">Protein (g)</label><input id="c-protein" name="protein" type="number" inputmode="decimal" min="0" /><p class="field-error" hidden></p></div>
        </div>
        <button type="submit" class="btn btn-primary">Add to diary</button>
      </form>`}`
}

function amountHtml(food, meal) {
  const n = food.nutrition
  const sGrams = n.serving.grams
  const quick = [
    [n.serving.label, sGrams], ['½ serving', Math.round(sGrams / 2)], ['2 servings', sGrams * 2], ['100 g', 100],
  ]
  return `
    <button type="button" class="fd-close" data-close aria-label="Close">×</button>
    <button type="button" class="back-link" data-back>‹ Back to the list</button>
    <div class="amount-head">
      <span class="food-frame pick-thumb"><img src="${escapeHtml(food.image)}" alt="" width="64" height="64"></span>
      <div><h2 id="add-title">${escapeHtml(food.name)}</h2><p class="fd-muted">${n.basis ? `${escapeHtml(n.basis)} · ` : ''}${fmt(n.per100g.calories)} kcal per 100 g</p></div>
    </div>
    <form id="amount-form" data-food="${escapeHtml(food.id)}" novalidate>
      <p class="form-error" data-error role="alert" hidden></p>
      <div class="field"><label for="add-meal">Meal</label><select id="add-meal" name="meal">${mealOptions(meal)}</select></div>
      <div class="field"><label for="grams">Amount (grams)</label><input id="grams" name="grams" type="number" inputmode="decimal" min="1" max="5000" step="any" value="${sGrams}" required /><p class="field-error" hidden></p></div>
      <div class="chips" role="group" aria-label="Quick amounts">
        ${quick.map(([label, grams]) => `<button type="button" class="chip" data-grams="${grams}">${escapeHtml(label)}${label === n.serving.label || label === '100 g' ? '' : ` (${grams} g)`}</button>`).join('')}
      </div>
      <div class="preview" id="amount-preview" aria-live="polite"></div>
      <button type="submit" class="btn btn-primary">Add to diary</button>
    </form>`
}

function previewHtml(food, grams) {
  if (!(grams > 0)) return '<p class="fd-muted">Enter an amount to see the numbers.</p>'
  const v = scale(food.nutrition.per100g, grams)
  return `
    <p class="preview-kcal"><span class="num">${fmt(v.calories)}</span> kcal</p>
    <dl class="preview-macros">
      ${MACROS.map((m) => `<div><dt><i class="macro-dot" data-color="${m.color}"></i>${m.label}</dt><dd class="num">${fmt(v[m.key], 1)} g</dd></div>`).join('')}
    </dl>`
}

function openAdd({ meal = guessMeal(), foodId = null, trigger = null } = {}) {
  opener = trigger
  const food = foodId ? foods.find((item) => item.id === foodId) : null
  if (foodId && !food) showToast("That food isn't available to log.")
  addBody.dataset.meal = meal
  if (food) showAmount(food, meal)
  else addBody.innerHTML = pickHtml({ meal })
  applyDataStyles(addBody)
  if (!addDialog.open) addDialog.showModal()
  addBody.querySelector('#add-search, #grams, input')?.focus()
}

function showAmount(food, meal) {
  addBody.innerHTML = amountHtml(food, meal)
  const input = addBody.querySelector('#grams')
  const update = () => {
    addBody.querySelector('#amount-preview').innerHTML = previewHtml(food, Number(input.value))
    applyDataStyles(addBody)
  }
  input.addEventListener('input', update)
  update()
  input.focus()
  input.select()
}

function showFieldErrors(form, errors, message) {
  const box = form.querySelector('[data-error]')
  box.hidden = !message
  box.textContent = message || ''
  for (const field of form.querySelectorAll('.field')) {
    const input = field.querySelector('input')
    const error = field.querySelector('.field-error')
    const text = input && errors?.[input.name]
    error.hidden = !text
    error.textContent = text || ''
    input?.toggleAttribute('aria-invalid', Boolean(text))
  }
}

async function submitEntry(form, body, label) {
  const button = form.querySelector('[type=submit]')
  button.disabled = true
  try {
    const { entry } = await api.post('/api/nutrition/entries', { date, ...body })
    addDialog.close()
    await load()
    showToast(`Added ${label} to ${MEALS.find((m) => m.id === body.meal).label.toLowerCase()}.`, {
      label: 'Undo',
      onClick: async () => {
        try { await api.delete(`/api/nutrition/entries/${entry.id}`); await load() } catch (error) { fail(error) }
      },
    })
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return goToLogin('nutrition')
    showFieldErrors(form, error.errors, error.errors && Object.keys(error.errors).length ? 'Please fix the highlighted fields.' : error.message)
    button.disabled = false
  }
}

// ---------- Removing an entry (with undo) ----------

async function removeEntry(id) {
  const entry = day.entries.find((item) => item.id === id)
  if (!entry) return
  try {
    await api.delete(`/api/nutrition/entries/${id}`)
    await load()
    showToast(`${entry.name} removed.`, {
      label: 'Undo',
      onClick: async () => {
        const custom = { name: entry.name, calories: entry.calories, carbs: entry.carbs, fat: entry.fat, protein: entry.protein }
        try {
          // A guide food is restored by food and amount; if the food is gone it comes back as a custom entry.
          try {
            if (!entry.foodId) throw new Error('custom')
            await api.post('/api/nutrition/entries', { date: entry.date, meal: entry.meal, foodId: entry.foodId, grams: entry.grams })
          } catch {
            await api.post('/api/nutrition/entries', { date: entry.date, meal: entry.meal, ...custom })
          }
          await load()
        } catch (error) {
          fail(error)
        }
      },
    })
  } catch (error) {
    fail(error)
  }
}

// ---------- Goals ----------

function openGoals() {
  for (const key of Object.keys(DEFAULT_GOALS)) goalsForm.elements[key].value = day.goals[key]
  showFieldErrors(goalsForm, {}, '')
  goalsDialog.showModal()
  goalsForm.elements.calories.focus()
}

// ---------- Wiring ----------

await initLayout()

if (!session.user) {
  document.getElementById('nutri-login').hidden = false
} else {
  app.hidden = false

  document.getElementById('day-prev').addEventListener('click', () => goTo(shift(date, -1)))
  nextButton.addEventListener('click', () => goTo(shift(date, 1)))
  document.getElementById('day-today').addEventListener('click', () => goTo(today()))
  dayPicker.addEventListener('change', () => goTo(dayPicker.value))
  weekEl.addEventListener('click', (event) => {
    const bar = event.target.closest('[data-date]')
    if (bar) goTo(bar.dataset.date)
  })
  document.getElementById('goals-open').addEventListener('click', openGoals)

  mealList.addEventListener('click', (event) => {
    const add = event.target.closest('[data-add]')
    const remove = event.target.closest('[data-remove]')
    if (add) openAdd({ meal: add.dataset.add, trigger: add })
    if (remove) removeEntry(remove.dataset.remove)
  })

  // One listener for everything inside the add dialog.
  addDialog.addEventListener('click', (event) => {
    if (event.target === addDialog || event.target.closest('[data-close]')) return addDialog.close()
    const meal = addBody.querySelector('#add-meal')?.value || addBody.dataset.meal
    const tab = event.target.closest('[data-tab]')
    const pick = event.target.closest('[data-pick]')
    const grams = event.target.closest('[data-grams]')
    if (tab) {
      addBody.dataset.meal = meal
      addBody.innerHTML = pickHtml({ meal, tab: tab.dataset.tab })
      applyDataStyles(addBody)
      addBody.querySelector('input')?.focus()
    } else if (pick) {
      showAmount(foods.find((food) => food.id === pick.dataset.pick), meal)
    } else if (event.target.closest('[data-back]')) {
      addBody.innerHTML = pickHtml({ meal })
      applyDataStyles(addBody)
    } else if (grams) {
      const input = addBody.querySelector('#grams')
      input.value = grams.dataset.grams
      input.dispatchEvent(new Event('input'))
    }
  })
  addDialog.addEventListener('input', (event) => {
    if (event.target.id !== 'add-search') return
    const meal = addBody.querySelector('#add-meal').value
    const caret = event.target.selectionStart
    addBody.innerHTML = pickHtml({ meal, query: event.target.value })
    applyDataStyles(addBody)
    const input = addBody.querySelector('#add-search')
    input.focus()
    input.setSelectionRange(caret, caret)
  })
  addDialog.addEventListener('submit', (event) => {
    event.preventDefault()
    const form = event.target
    const data = Object.fromEntries(new FormData(form))
    const meal = data.meal || addBody.querySelector('#add-meal')?.value || addBody.dataset.meal
    if (form.id === 'amount-form') {
      const food = foods.find((item) => item.id === form.dataset.food)
      submitEntry(form, { meal, foodId: food.id, grams: data.grams }, food.name)
    } else if (form.id === 'custom-form') {
      const selected = addBody.querySelector('#add-meal').value
      submitEntry(form, { meal: selected, name: data.name, calories: data.calories, carbs: data.carbs || 0, fat: data.fat || 0, protein: data.protein || 0 }, data.name || 'your food')
    }
  })
  addDialog.addEventListener('close', () => {
    opener?.focus()
    opener = null
  })

  goalsDialog.addEventListener('click', (event) => {
    if (event.target === goalsDialog || event.target.closest('[data-close]')) goalsDialog.close()
  })
  document.getElementById('goals-defaults').addEventListener('click', () => {
    for (const [key, value] of Object.entries(DEFAULT_GOALS)) goalsForm.elements[key].value = value
  })
  goalsForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    const body = Object.fromEntries(new FormData(goalsForm))
    try {
      await api.put('/api/nutrition/goals', body)
      goalsDialog.close()
      await load()
      showToast('Daily goals saved.')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return goToLogin('nutrition')
      showFieldErrors(goalsForm, error.errors, error.message)
    }
  })

  try {
    const all = await api.get('/api/foods')
    foods = all.foods.filter((food) => food.nutrition?.per100g && food.nutrition?.serving?.grams)
  } catch {
    // Without the list, custom entries still work.
  }
  await load({ keepScroll: false })

  const wanted = new URLSearchParams(window.location.search).get('add')
  if (wanted) {
    history.replaceState(null, '', '/nutrition')
    openAdd({ foodId: wanted })
  }
}
