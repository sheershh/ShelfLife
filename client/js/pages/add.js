// Add groceries: read a receipt photo, or look up a barcode, then put the foods on the fridge shelves.
//   POST /api/receipts        photo -> foods found (nothing is saved yet)
//   GET  /api/barcode/:code   barcode -> product and the matching guide food
//   POST /api/saved/bulk      saves the chosen foods as bought today

import { api, ApiError } from '../api.js'
import { preparePhoto } from '../image.js'
import { initLayout } from '../layout.js'
import { setSavedIds, session } from '../session.js'
import { escapeHtml, goToLogin, showToast } from '../ui.js'

const receiptInput = document.getElementById('receipt-input')
const receiptError = document.getElementById('receipt-error')
const receiptResult = document.getElementById('receipt-result')
const barcodeError = document.getElementById('barcode-error')
const barcodeResult = document.getElementById('barcode-result')
const cameraBox = document.getElementById('barcode-camera')
const video = document.getElementById('barcode-video')
const startButton = document.getElementById('barcode-start')

const showError = (box, error) => {
  if (error instanceof ApiError && error.status === 401) return goToLogin('scan')
  box.textContent = error.message
  box.hidden = false
}

async function addToFridge(foodIds) {
  const data = await api.post('/api/saved/bulk', { foodIds })
  setSavedIds(data.savedIds)
  showToast(data.message)
  return data
}

const doneHtml = (message) => `
  <p class="add-done">${escapeHtml(message)}</p>
  <div class="button-row"><a href="/saved" class="btn btn-primary btn-sm">Open my fridge</a></div>`

// ---------- Receipt ----------

function receiptHtml({ found, unmatched }) {
  if (found.length === 0) {
    return '<p class="fd-muted">No foods from the guide were found. Try a flatter, brighter photo, or add foods from the <a href="/foods">guide</a>.</p>'
  }
  return `
    <form id="receipt-form">
      <p class="add-found-title">Found ${found.length} ${found.length === 1 ? 'food' : 'foods'}. Untick anything you did not buy.</p>
      <ul class="add-found">${found.map((item) => `
        <li><label><input type="checkbox" name="food" value="${escapeHtml(item.foodId)}" checked>
          <span><strong>${escapeHtml(item.name)}</strong>${item.text ? ` <span class="shop-guide">${escapeHtml(item.text)}</span>` : ''}</span></label></li>`).join('')}</ul>
      ${unmatched.length ? `<p class="fd-muted">Not in the guide: ${unmatched.map(escapeHtml).join(', ')}</p>` : ''}
      <button type="submit" class="btn btn-primary">Add to my fridge</button>
    </form>`
}

async function readReceipt(file) {
  receiptError.hidden = true
  receiptResult.innerHTML = '<p class="msg-thinking"><span class="dots" aria-hidden="true"><span></span><span></span><span></span></span>Reading the receipt…</p>'
  try {
    const photo = await preparePhoto(file)
    const data = await api.post('/api/receipts', { image: photo.image })
    receiptResult.innerHTML = receiptHtml(data)
  } catch (error) {
    receiptResult.innerHTML = ''
    showError(receiptError, error)
  }
}

// ---------- Barcode ----------

function productHtml({ found, product, food }, code) {
  if (!found) {
    return `<p class="fd-muted">Barcode ${escapeHtml(code)} is not in the product database. Add the food from the <a href="/foods">guide</a> instead.</p>`
  }
  const head = `<p class="add-product"><strong>${escapeHtml(product.name)}</strong>${product.brand ? `, ${escapeHtml(product.brand)}` : ''}</p>`
  if (!food) {
    return `${head}<p class="fd-muted">ShelfLife's guide does not have this kind of food yet. You can still add it to your shopping list.</p>
      <button type="button" class="btn btn-secondary btn-sm" data-list-name="${escapeHtml(product.name)}">Add to shopping list</button>`
  }
  return `${head}
    <p class="fd-muted">Matches <a href="/food?id=${encodeURIComponent(food.id)}">${escapeHtml(food.name)}</a> in the guide: ${escapeHtml(food.shelfLifePreview)}</p>
    <div class="button-row">
      <button type="button" class="btn btn-primary btn-sm" data-add-food="${escapeHtml(food.id)}">Add to my fridge</button>
      <button type="button" class="btn btn-secondary btn-sm" data-list-food="${escapeHtml(food.id)}">Add to shopping list</button>
    </div>`
}

async function lookup(code) {
  barcodeError.hidden = true
  if (!/^\d{6,14}$/.test(code)) {
    barcodeError.textContent = 'A barcode is 6 to 14 digits.'
    barcodeError.hidden = false
    return
  }
  barcodeResult.innerHTML = '<p class="msg-thinking">Looking it up…</p>'
  try {
    barcodeResult.innerHTML = productHtml(await api.get(`/api/barcode/${code}`), code)
  } catch (error) {
    barcodeResult.innerHTML = ''
    showError(barcodeError, error)
  }
}

let stream = null
let scanTimer = null

function stopCamera() {
  clearInterval(scanTimer)
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
  video.srcObject = null
  cameraBox.hidden = true
  startButton.hidden = false
}

// Uses the browser's own BarcodeDetector (Chrome and Edge, Android and desktop). Where it is missing the
// camera button is hidden and the typed number still works.
async function startCamera() {
  barcodeError.hidden = true
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
  } catch {
    showError(barcodeError, new Error('The camera is not available. Type the barcode number instead.'))
    return
  }
  const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
  video.srcObject = stream
  await video.play()
  cameraBox.hidden = false
  startButton.hidden = true
  scanTimer = setInterval(async () => {
    try {
      const [hit] = await detector.detect(video)
      if (!hit) return
      stopCamera()
      document.getElementById('barcode-input').value = hit.rawValue
      lookup(hit.rawValue)
    } catch {
      // A frame that cannot be read is skipped.
    }
  }, 350)
}

// ---------- Wiring ----------

await initLayout()

if (!session.user) {
  document.getElementById('add-tools').hidden = true
  document.getElementById('add-login').hidden = false
} else {
  document.getElementById('receipt-pick').addEventListener('click', () => receiptInput.click())
  receiptInput.addEventListener('change', () => {
    if (receiptInput.files[0]) readReceipt(receiptInput.files[0])
    receiptInput.value = ''
  })

  receiptResult.addEventListener('submit', async (event) => {
    event.preventDefault()
    const ids = [...event.target.querySelectorAll('input[name="food"]:checked')].map((input) => input.value)
    if (ids.length === 0) return showError(receiptError, new Error('Tick at least one food.'))
    receiptError.hidden = true
    try {
      const data = await addToFridge(ids)
      receiptResult.innerHTML = doneHtml(data.message)
    } catch (error) {
      showError(receiptError, error)
    }
  })

  document.getElementById('barcode-form').addEventListener('submit', (event) => {
    event.preventDefault()
    lookup(document.getElementById('barcode-input').value.trim())
  })

  barcodeResult.addEventListener('click', async (event) => {
    const add = event.target.closest('[data-add-food]')
    const listFood = event.target.closest('[data-list-food]')
    const listName = event.target.closest('[data-list-name]')
    try {
      if (add) {
        const data = await addToFridge([add.dataset.addFood])
        barcodeResult.innerHTML = doneHtml(data.message)
      } else if (listFood || listName) {
        await api.post('/api/shopping', listFood ? { foodId: listFood.dataset.listFood } : { name: listName.dataset.listName.slice(0, 60) })
        showToast('Added to your shopping list.')
      }
    } catch (error) {
      showError(barcodeError, error)
    }
  })

  if ('BarcodeDetector' in window && navigator.mediaDevices?.getUserMedia) {
    startButton.hidden = false
    startButton.addEventListener('click', startCamera)
    document.getElementById('barcode-stop').addEventListener('click', stopCamera)
  }

  try {
    const { ai } = await api.get('/api/health')
    if (!ai) document.getElementById('add-setup-notice').hidden = false
  } catch {
    // Not fatal: real errors show when the receipt is read.
  }
}
