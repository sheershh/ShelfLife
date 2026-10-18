// Admin console: overview charts, food editor, user management and the scan log.
// The server checks the admin role on every /api/admin request; hiding the page here is only for convenience.

import { api } from '../api.js'
import { preparePhoto } from '../image.js'
import { initLayout } from '../layout.js'
import { session } from '../session.js'
import {
  applyDataStyles, emptyStateHtml, escapeHtml, lastingHtml, RECOMMENDATION_LABELS, recommendationTag, showToast,
} from '../ui.js'

const panels = {
  overview: document.getElementById('panel-overview'),
  foods: document.getElementById('foods-table'),
  users: document.getElementById('users-table'),
  scans: document.getElementById('scans-table'),
}
const tabs = [...document.querySelectorAll('[role="tab"]')]
const loaded = new Set()
let foods = []
let users = []
let categories = []

const dateLabel = (iso, options = { day: 'numeric', month: 'short' }) => new Date(iso).toLocaleDateString(undefined, options)
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

// ---------- Tabs ----------

function selectTab(tab) {
  for (const other of tabs) {
    const selected = other === tab
    other.setAttribute('aria-selected', String(selected))
    other.tabIndex = selected ? 0 : -1
    document.getElementById(other.getAttribute('aria-controls')).hidden = !selected
  }
  const name = tab.id.replace('tab-', '')
  history.replaceState(null, '', `#${name}`)
  if (!loaded.has(name)) {
    loaded.add(name)
    loaders[name]()
  }
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
  selectTab(tabs.find((tab) => `#${tab.id.replace('tab-', '')}` === window.location.hash) || tabs[0])
}

// ---------- Overview (charts are plain HTML bars, one hue, labelled with text) ----------

// Fills in the days with no scans so the chart always shows the full 14 days.
function lastDays(perDay, days = 14) {
  const counts = Object.fromEntries(perDay.map((row) => [row.day, row.count]))
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.now() - (days - 1 - index) * 86_400_000)
    const day = date.toISOString().slice(0, 10)
    return { day, count: counts[day] || 0 }
  })
}

function columnChartHtml(perDay) {
  const days = lastDays(perDay)
  const max = Math.max(1, ...days.map((d) => d.count))
  const peak = days.reduce((best, d) => (d.count > best.count ? d : best), days[0])
  const columns = days.map((d) => {
    const tip = `${dateLabel(d.day)}: ${plural(d.count, 'scan')}`
    const label = d.count > 0 && (d === peak || d === days.at(-1)) ? `<span class="col-value num">${d.count}</span>` : ''
    return `<div class="col" data-tip="${escapeHtml(tip)}" tabindex="0" aria-label="${escapeHtml(tip)}">
      ${label}<span class="col-bar" data-value="${((d.count / max) * 100).toFixed(1)}"></span></div>`
  }).join('')
  const rows = days.map((d) => `<tr><td>${escapeHtml(dateLabel(d.day))}</td><td>${d.count}</td></tr>`).join('')
  return `
    <div class="columns" role="group" aria-label="Scans per day, last 14 days">${columns}</div>
    <div class="columns-axis" aria-hidden="true"><span>${dateLabel(days[0].day)}</span><span>Today</span></div>
    <table class="visually-hidden"><caption>Scans per day</caption><thead><tr><th>Day</th><th>Scans</th></tr></thead><tbody>${rows}</tbody></table>`
}

// Horizontal bars: label on the left, bar, value at the tip.
function barListHtml(rows) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  return `<ul class="bar-list">${rows.map((row) => `
    <li data-tip="${escapeHtml(`${row.text}: ${row.value}`)}">
      <span class="bar-label">${row.labelHtml}</span>
      <span class="bar-track"><span class="bar-fill" data-value="${((row.value / max) * 100).toFixed(1)}"></span></span>
      <span class="bar-value num">${row.value}</span>
    </li>`).join('')}</ul>`
}

async function loadOverview() {
  const panel = panels.overview
  panel.innerHTML = '<div class="skeleton guide-skeleton"></div>'
  try {
    const stats = await api.get('/api/admin/stats')
    const { totals } = stats
    const recommendationRows = Object.keys(RECOMMENDATION_LABELS)
      .map((key) => ({ labelHtml: recommendationTag(key), text: RECOMMENDATION_LABELS[key], value: stats.scansByRecommendation[key] || 0 }))
    const savedRows = stats.mostSaved.map((food) => ({ labelHtml: escapeHtml(food.name), text: food.name, value: food.saves }))

    panel.innerHTML = `
      <dl class="kpis">
        <div><dt>Accounts</dt><dd class="num">${totals.users}</dd><p>${plural(totals.admins, 'admin')}</p></div>
        <div><dt>Foods in the guide</dt><dd class="num">${totals.foods}</dd><p>Editable in Foods</p></div>
        <div><dt>Photos scanned</dt><dd class="num">${totals.scans}</dd><p>All time</p></div>
        <div><dt>Foods saved</dt><dd class="num">${totals.saves}</dd><p>Across all users</p></div>
      </dl>
      <div class="chart-grid">
        <section class="chart-card chart-wide">
          <h2>Scans per day</h2>
          <p class="chart-sub">Last 14 days</p>
          ${columnChartHtml(stats.scansPerDay)}
        </section>
        <section class="chart-card">
          <h2>Scanner recommendations</h2>
          <p class="chart-sub">What the scanner told people to do, all time</p>
          ${totals.scans ? barListHtml(recommendationRows) : '<p class="status-text">No scans yet.</p>'}
        </section>
        <section class="chart-card">
          <h2>Most saved foods</h2>
          <p class="chart-sub">Number of users who saved each food</p>
          ${savedRows.length ? barListHtml(savedRows) : '<p class="status-text">No foods saved yet.</p>'}
        </section>
      </div>`
    applyDataStyles(panel)
  } catch (error) {
    panel.innerHTML = emptyStateHtml('Could not load the overview', error.message)
  }
}

// Tooltip for chart marks (hover or keyboard focus).
function setupTooltip() {
  const tooltip = document.getElementById('chart-tooltip')
  const show = (target, x, y) => {
    tooltip.textContent = target.dataset.tip
    tooltip.hidden = false
    tooltip.style.left = `${x}px`
    tooltip.style.top = `${y}px`
  }
  panels.overview.addEventListener('pointermove', (event) => {
    const target = event.target.closest('[data-tip]')
    if (target) show(target, event.clientX, event.clientY)
    else tooltip.hidden = true
  })
  panels.overview.addEventListener('pointerleave', () => { tooltip.hidden = true })
  panels.overview.addEventListener('focusin', (event) => {
    const target = event.target.closest('[data-tip]')
    if (!target) return
    const box = target.getBoundingClientRect()
    show(target, box.left + box.width / 2, box.top)
  })
  panels.overview.addEventListener('focusout', () => { tooltip.hidden = true })
}

// ---------- Foods ----------

function foodsTableHtml(list) {
  if (list.length === 0) return emptyStateHtml('No foods match', 'Try a different name.')
  const rows = list.map((food) => `
    <tr>
      <td><div class="cell-food"><span class="food-frame cell-thumb"><img src="${escapeHtml(food.image)}" alt="" width="40" height="40" loading="lazy"></span>
        <div><a href="/food?id=${encodeURIComponent(food.id)}" target="_blank" rel="noopener"><strong>${escapeHtml(food.name)}</strong></a><span>${escapeHtml(food.id)}</span></div></div></td>
      <td>${escapeHtml(food.category)}</td>
      <td>${escapeHtml(food.storageLocation)}</td>
      <td>${lastingHtml(food.freshnessStatus)}</td>
      <td class="actions">
        <button type="button" class="btn btn-secondary btn-sm" data-edit="${escapeHtml(food.id)}">Edit</button>
        <button type="button" class="btn btn-danger btn-sm" data-delete-food="${escapeHtml(food.id)}">Delete</button>
      </td>
    </tr>`).join('')
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th>Food</th><th>Category</th><th>Best kept</th><th>Keeps for</th><th><span class="visually-hidden">Actions</span></th></tr></thead>
    <tbody>${rows}</tbody></table></div>`
}

function renderFoods() {
  const text = document.getElementById('food-filter').value.trim().toLowerCase()
  panels.foods.innerHTML = foodsTableHtml(foods.filter((food) => !text || food.name.toLowerCase().includes(text) || food.id.includes(text)))
}

async function loadFoods() {
  panels.foods.innerHTML = '<div class="skeleton guide-skeleton"></div>'
  try {
    ;({ foods } = await api.get('/api/foods'))
    renderFoods()
  } catch (error) {
    panels.foods.innerHTML = emptyStateHtml('Could not load foods', error.message)
  }
}

// Two-step delete: the first click asks, the second click (within 4 seconds) deletes.
function confirmClick(button, label, action) {
  if (button.dataset.confirming) {
    action()
    return
  }
  const original = button.textContent
  button.dataset.confirming = 'true'
  button.textContent = label
  setTimeout(() => {
    delete button.dataset.confirming
    button.textContent = original
  }, 4000)
}

// ----- Food form (dialog) -----

const dialog = document.getElementById('food-dialog')
const form = document.getElementById('food-form')
const formError = form.querySelector('.form-error')
let editingId = null

const lines = (text) => text.split('\n').map((line) => line.trim()).filter(Boolean)

function fillForm(food) {
  const el = form.elements
  el.name.value = food?.name || ''
  el.slug.value = food?.id || ''
  el.slug.disabled = Boolean(food)
  el.category.value = food?.category || categories[0]
  el.storageLocation.value = food?.storageLocation || 'Refrigerator'
  el.freshnessStatus.value = food?.freshnessStatus || 'Moderately Perishable'
  el.shelfLifePreview.value = food?.shelfLifePreview || ''
  el.shortDescription.value = food?.shortDescription || ''
  el.image.value = food?.image || '/images/placeholder.svg'
  document.getElementById('f-image-preview').src = el.image.value
  for (const condition of ['roomTemperature', 'refrigerator', 'pantry', 'freezer']) {
    el[`sl-${condition}`].value = food?.shelfLife?.[condition] || ''
  }
  el.storageMethod.value = food?.storageMethod || ''
  el.freshnessStages.value = (food?.freshnessStages || []).map((stage) => `${stage.label}: ${stage.description}`).join('\n')
  for (const field of ['storageTips', 'usageIdeas', 'freshnessSigns', 'spoilageSigns']) {
    el[field].value = (food?.[field] || []).join('\n')
  }
}

function readForm() {
  const el = form.elements
  const shelfLife = {}
  for (const condition of ['roomTemperature', 'refrigerator', 'pantry', 'freezer']) {
    if (el[`sl-${condition}`].value.trim()) shelfLife[condition] = el[`sl-${condition}`].value.trim()
  }
  return {
    slug: el.slug.value.trim(),
    name: el.name.value,
    category: el.category.value,
    storageLocation: el.storageLocation.value,
    freshnessStatus: el.freshnessStatus.value,
    shelfLifePreview: el.shelfLifePreview.value,
    shortDescription: el.shortDescription.value,
    image: el.image.value.trim(),
    shelfLife,
    storageMethod: el.storageMethod.value,
    freshnessStages: lines(el.freshnessStages.value).map((line) => {
      const [label, ...rest] = line.split(':')
      return { label: label.trim(), description: rest.join(':').trim() }
    }),
    storageTips: lines(el.storageTips.value),
    usageIdeas: lines(el.usageIdeas.value),
    freshnessSigns: lines(el.freshnessSigns.value),
    spoilageSigns: lines(el.spoilageSigns.value),
  }
}

// Shows the server's per-field messages under the matching inputs.
function showFormErrors(errors = {}) {
  for (const message of form.querySelectorAll('.field-error')) {
    const name = message.dataset.errorFor || message.closest('.field')?.querySelector('[name]')?.name
    const text = errors[name]
    message.textContent = text || ''
    message.hidden = !text
  }
  formError.hidden = Object.keys(errors).length === 0
  formError.textContent = 'Please fix the highlighted fields.'
}

function openFoodForm(food = null) {
  editingId = food?.id || null
  document.getElementById('food-dialog-title').textContent = food ? `Edit ${food.name}` : 'Add a food'
  fillForm(food)
  showFormErrors()
  dialog.showModal()
  form.elements.name.focus()
}

function setupFoodForm() {
  document.getElementById('add-food').addEventListener('click', () => openFoodForm())
  for (const button of dialog.querySelectorAll('[data-close-dialog]')) button.addEventListener('click', () => dialog.close())

  // Suggest an id from the name while adding a new food.
  form.elements.name.addEventListener('input', () => {
    if (!editingId) form.elements.slug.value = form.elements.name.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  })
  form.elements.image.addEventListener('change', () => { document.getElementById('f-image-preview').src = form.elements.image.value })

  // Photo upload: shrink in the browser, send to the server, which saves it under a random name.
  const fileInput = document.getElementById('f-image-file')
  document.getElementById('f-image-upload').addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0]
    fileInput.value = ''
    if (!file) return
    try {
      const { image } = await preparePhoto(file)
      const { path } = await api.post('/api/admin/images', { image })
      form.elements.image.value = path
      document.getElementById('f-image-preview').src = path
    } catch (error) {
      showToast(error.message)
    }
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const submit = document.getElementById('food-submit')
    submit.disabled = true
    try {
      const data = readForm()
      const { food } = editingId
        ? await api.put(`/api/admin/foods/${encodeURIComponent(editingId)}`, data)
        : await api.post('/api/admin/foods', data)
      dialog.close()
      showToast(`${food.name} ${editingId ? 'updated' : 'added to the guide'}.`)
      await loadFoods()
    } catch (error) {
      showFormErrors(error.errors || {})
      if (!error.errors || Object.keys(error.errors).length === 0) {
        formError.textContent = error.message
        formError.hidden = false
      }
    } finally {
      submit.disabled = false
    }
  })
}

function setupFoodsTable() {
  document.getElementById('food-filter').addEventListener('input', renderFoods)
  panels.foods.addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit]')
    if (edit) openFoodForm(foods.find((food) => food.id === edit.dataset.edit))

    const del = event.target.closest('[data-delete-food]')
    if (del) {
      confirmClick(del, 'Click again to delete', async () => {
        try {
          const { message } = await api.delete(`/api/admin/foods/${encodeURIComponent(del.dataset.deleteFood)}`)
          showToast(message)
          await loadFoods()
        } catch (error) {
          showToast(error.message)
        }
      })
    }
  })
}

// ---------- Users ----------

function usersTableHtml(list) {
  if (list.length === 0) return emptyStateHtml('No users match', 'Try a different name or email.')
  const rows = list.map((user) => {
    const isMe = user.id === session.user.id
    const roleButton = user.role === 'admin'
      ? `<button type="button" class="btn btn-secondary btn-sm" data-role="user" data-user="${user.id}" ${isMe ? 'disabled title="You cannot remove your own admin role"' : ''}>Remove admin</button>`
      : `<button type="button" class="btn btn-secondary btn-sm" data-role="admin" data-user="${user.id}">Make admin</button>`
    return `
      <tr>
        <td><strong>${escapeHtml(user.name)}</strong>${isMe ? ' <span class="tag">You</span>' : ''}</td>
        <td>${escapeHtml(user.email)}</td>
        <td>${user.role === 'admin' ? '<span class="tag tag-admin">Admin</span>' : 'User'}</td>
        <td class="num">${user.savedCount}</td>
        <td>${escapeHtml(dateLabel(user.createdAt, { day: 'numeric', month: 'short', year: 'numeric' }))}</td>
        <td class="actions">${roleButton}
          <button type="button" class="btn btn-danger btn-sm" data-delete-user="${user.id}" ${isMe ? 'disabled' : ''}>Delete</button></td>
      </tr>`
  }).join('')
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Saved</th><th>Joined</th><th><span class="visually-hidden">Actions</span></th></tr></thead>
    <tbody>${rows}</tbody></table></div>`
}

function renderUsers() {
  const text = document.getElementById('user-filter').value.trim().toLowerCase()
  panels.users.innerHTML = usersTableHtml(users.filter((user) =>
    !text || user.name.toLowerCase().includes(text) || user.email.includes(text)))
}

async function loadUsers() {
  panels.users.innerHTML = '<div class="skeleton guide-skeleton"></div>'
  try {
    ;({ users } = await api.get('/api/admin/users'))
    renderUsers()
  } catch (error) {
    panels.users.innerHTML = emptyStateHtml('Could not load users', error.message)
  }
}

function setupUsersTable() {
  document.getElementById('user-filter').addEventListener('input', renderUsers)
  panels.users.addEventListener('click', async (event) => {
    const roleButton = event.target.closest('[data-role]')
    if (roleButton) {
      try {
        await api.patch(`/api/admin/users/${roleButton.dataset.user}`, { role: roleButton.dataset.role })
        showToast(roleButton.dataset.role === 'admin' ? 'User is now an admin.' : 'Admin role removed.')
        await loadUsers()
      } catch (error) {
        showToast(error.message)
      }
    }
    const del = event.target.closest('[data-delete-user]')
    if (del) {
      confirmClick(del, 'Click again to delete', async () => {
        try {
          await api.delete(`/api/admin/users/${del.dataset.deleteUser}`)
          showToast('User deleted.')
          await loadUsers()
        } catch (error) {
          showToast(error.message)
        }
      })
    }
  })
}

// ---------- Scans ----------

async function loadScans() {
  panels.scans.innerHTML = '<div class="skeleton guide-skeleton"></div>'
  try {
    const { scans } = await api.get('/api/admin/scans')
    if (scans.length === 0) {
      panels.scans.innerHTML = emptyStateHtml('No scans yet', 'Scans appear here as soon as people use the scanner.')
      return
    }
    const rows = scans.map((scan) => `
      <tr>
        <td><div class="cell-food">${scan.thumbnail ? `<img src="${escapeHtml(scan.thumbnail)}" alt="" width="40" height="40">` : ''}
          <div><strong>${escapeHtml(scan.item)}</strong><span>${escapeHtml(scan.matchedFood || 'Not in guide')}</span></div></div></td>
        <td>${escapeHtml(scan.user?.name || 'Deleted user')}</td>
        <td>${recommendationTag(scan.recommendation)}</td>
        <td class="num">${scan.freshnessScore ?? '–'}</td>
        <td>${scan.mould?.detected ? 'Yes' : 'No'}</td>
        <td>${escapeHtml(scan.confidence)}</td>
        <td>${escapeHtml(new Date(scan.createdAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }))}</td>
      </tr>`).join('')
    panels.scans.innerHTML = `<div class="table-wrap"><table class="table">
      <thead><tr><th>Item</th><th>User</th><th>Recommendation</th><th>Score</th><th>Mould</th><th>Confidence</th><th>When</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`
  } catch (error) {
    panels.scans.innerHTML = emptyStateHtml('Could not load scans', error.message)
  }
}

const loaders = { overview: loadOverview, foods: loadFoods, users: loadUsers, scans: loadScans }

// ---------- Start ----------

await initLayout()

if (!session.user) {
  window.location.replace('/login?reason=admin&next=/admin')
} else if (session.user.role !== 'admin') {
  document.getElementById('admin-gate').innerHTML = emptyStateHtml('Admins only',
    'Your account does not have access to the admin console. Ask an admin to give you the admin role.',
    '<a href="/" class="btn btn-secondary">Go to the home page</a>')
} else {
  document.getElementById('admin-app').hidden = false
  try {
    ;({ categories } = await api.get('/api/meta'))
  } catch {
    categories = ['Fruits', 'Vegetables', 'Dairy', 'Pantry & Grains']
  }
  form.elements.category.innerHTML = categories.map((c) => `<option>${escapeHtml(c)}</option>`).join('')
  setupTooltip()
  setupFoodForm()
  setupFoodsTable()
  setupUsersTable()
  setupTabs()
}
