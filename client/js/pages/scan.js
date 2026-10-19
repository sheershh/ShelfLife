// Freshness scanner: the "instrument" on the left shows the photo being read and its state;
// the log on the right holds the readings and the conversation about them.
//
// Flow for a photo:
//   1. preparePhoto() shrinks it in the browser (image.js)            -> stage state "preparing"
//   2. POST /api/scans sends it to our server, which asks Gemini        -> stage state "analysing"
//      and checks the answer
//   3. the verdict card is drawn from the response (scan-ui.js)         -> stage state "done"
//   Any failure                                                         -> stage state "error" (with retry)
// Follow-up questions go to POST /api/assistant with the recent conversation and the scan id,
// so the server can ground the answer in that scan and our food records.

import { api, ApiError } from '../api.js'
import { preparePhoto } from '../image.js'
import { initLayout } from '../layout.js'
import { RECOMMENDATION_LABELS, verdictHtml } from '../scan-ui.js'
import { session } from '../session.js'
import { animateNumbers, applyDataStyles, escapeHtml } from '../ui.js'

const log = document.getElementById('chat-log')
const chat = document.getElementById('chat')
const stage = document.getElementById('stage')
const stagePhoto = document.getElementById('stage-photo')
const stageStatus = document.getElementById('stage-status-text')
const stageErrorText = document.getElementById('stage-error-text')
const composer = document.getElementById('composer')
const input = document.getElementById('composer-input')
const sendButton = document.getElementById('composer-send')
const suggestions = document.getElementById('suggestions')
const ticker = document.getElementById('stage-ticker')

const STARTER_QUESTIONS = [
  'How do I keep spinach fresh for longer?',
  'Is bread with a small spot of mould okay?',
  'How long does milk last once opened?',
]
const AFTER_SCAN_QUESTIONS = ['Can I still cook with it?', 'How should I store it now?', 'How will I know when it has gone bad?']

// Conversation state for this page. Only the last few turns are sent to the server.
const history = []
let currentScanId = null
let busy = false
let lastPhotos = [] // kept so "Try again" can resend the same photos
const MAX_PHOTOS = 3 // angles of the same item per scan

// ---------- The instrument stage ----------

// One place decides what the stage shows. CSS reads data-state (idle | preparing | analysing | done | error).
function setStage(state, statusText) {
  stage.dataset.state = state
  stageStatus.textContent = statusText
  if (state === 'analysing') startTicker()
  else stopTicker()
}

// While a photo is being read, short phrases fade through on the photo itself. They are decoration
// (aria-hidden): the calm status line below is what screen readers announce.
const TICKER_MESSAGES = ['Checking the colour…', 'Looking for mould…', 'Judging ripeness…', 'Matching it to the guide…']
let tickerTimer = null

function startTicker() {
  stopTicker()
  let index = 0
  ticker.textContent = TICKER_MESSAGES[0]
  tickerTimer = setInterval(() => {
    ticker.classList.add('is-swapping')
    setTimeout(() => {
      index = (index + 1) % TICKER_MESSAGES.length
      ticker.textContent = TICKER_MESSAGES[index]
      ticker.classList.remove('is-swapping')
    }, 300)
  }, 1900)
}

function stopTicker() {
  clearInterval(tickerTimer)
  tickerTimer = null
}

// ---------- Drawing messages ----------

function addMessage(role, html, extraClass = '') {
  const item = document.createElement('li')
  item.className = `msg msg-${role} ${extraClass}`
  item.innerHTML = `<div class="msg-body">${html}</div>`
  log.append(item)
  item.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  return item
}

// Plain text from the assistant: escape it, then split into paragraphs.
const textHtml = (text) => text.split(/\n{2,}/).map((part) => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`).join('')

function addError(message, retry) {
  const item = addMessage('assistant', `<p>${escapeHtml(message)}</p>${retry ? '<button type="button" class="btn btn-secondary btn-sm" data-retry>Try again</button>' : ''}`, 'msg-error')
  if (retry) item.querySelector('[data-retry]').addEventListener('click', () => { item.remove(); retry() }, { once: true })
}

function showSuggestions(questions) {
  suggestions.innerHTML = questions
    .map((question) => `<button type="button" class="chip" data-question="${escapeHtml(question)}">${escapeHtml(question)}</button>`)
    .join('')
}

function setBusy(value) {
  busy = value
  sendButton.disabled = value
  chat.classList.toggle('is-busy', value)
}

function errorText(error) {
  if (error instanceof ApiError && error.status === 401) {
    window.location.assign('/login?reason=scan&next=/scan')
    return 'Please log in again.'
  }
  return error.message
}

// ---------- Photos ----------

// One to three photos of the same item, read together as one scan.
async function handlePhotos(fileList) {
  const files = [...fileList].filter((file) => file.type.startsWith('image/'))
  if (busy || files.length === 0) return
  setBusy(true)
  suggestions.innerHTML = ''
  setStage('preparing', files.length > 1 ? 'Preparing photos…' : 'Preparing photo…')

  lastPhotos = []
  try {
    lastPhotos = await Promise.all(files.slice(0, MAX_PHOTOS).map(preparePhoto))
  } catch (error) {
    // The file could not be read as a photo: back to the start, with the reason in the log.
    setStage('idle', 'Ready for a photo')
    addError(error.message)
    setBusy(false)
    return
  }
  if (files.length > MAX_PHOTOS) addMessage('assistant', `<p>Only the first ${MAX_PHOTOS} photos are used.</p>`)
  stagePhoto.src = lastPhotos[0].previewUrl
  // Restart the "photo develops" wipe for every new photo.
  stagePhoto.classList.remove('is-new')
  void stagePhoto.offsetWidth
  stagePhoto.classList.add('is-new')
  addMessage('user', lastPhotos.map((photo, index) =>
    `<figure class="msg-photo"><img src="${photo.previewUrl}" alt="Your photo${lastPhotos.length > 1 ? ` ${index + 1}` : ''}"></figure>`).join(''))
  await sendPhoto()
}

async function sendPhoto() {
  setBusy(true)
  setStage('analysing', 'Analysing ripeness and mould… usually a few seconds')
  const thinking = addMessage('assistant', '<p class="msg-thinking"><span class="dots" aria-hidden="true"><span></span><span></span><span></span></span>Reading the photo…</p>')

  try {
    const { scan, food, message } = await api.post('/api/scans', {
      images: lastPhotos.map((photo) => photo.image),
      thumbnail: lastPhotos[0].thumbnail,
    })
    thinking.remove()
    if (!scan) {
      // Not food: nothing is saved, and the server says why.
      setStage('done', 'No food found in this photo')
      addMessage('assistant', textHtml(message))
      return
    }
    currentScanId = scan.id
    history.length = 0 // a new photo starts a new topic
    history.push({ role: 'assistant', text: `Scan result: ${scan.item}, ${scan.ripeness}, recommendation ${scan.recommendation}. ${scan.summary || ''}` })
    setStage('done', `Read complete: ${scan.item}, ${RECOMMENDATION_LABELS[scan.recommendation] || scan.recommendation}`)
    const card = addMessage('assistant', verdictHtml(scan, food, { photos: lastPhotos.length }), 'msg-verdict')
    applyDataStyles(card)
    setTimeout(() => animateNumbers(card, 1300), 450) // the score counts up as the card builds in
    showSuggestions(AFTER_SCAN_QUESTIONS)
  } catch (error) {
    thinking.remove()
    const text = errorText(error)
    stageErrorText.textContent = text
    setStage('error', `Not read: ${text}`)
  } finally {
    setBusy(false)
  }
}

// ---------- Questions ----------

async function ask(question) {
  const message = question.trim()
  if (busy || !message) return
  setBusy(true)
  suggestions.innerHTML = ''
  addMessage('user', `<p>${escapeHtml(message)}</p>`)
  const thinking = addMessage('assistant', '<p class="msg-thinking"><span class="dots" aria-hidden="true"><span></span><span></span><span></span></span>Thinking…</p>')

  try {
    const { reply } = await api.post('/api/assistant', { message, history: history.slice(-8), scanId: currentScanId })
    thinking.remove()
    addMessage('assistant', textHtml(reply))
    history.push({ role: 'user', text: message }, { role: 'assistant', text: reply })
  } catch (error) {
    thinking.remove()
    addError(errorText(error), () => ask(message))
  } finally {
    setBusy(false)
  }
}

// ---------- Wiring ----------

function setupInputs() {
  for (const button of document.querySelectorAll('[data-pick]')) {
    button.addEventListener('click', () => document.getElementById(button.dataset.pick).click())
  }
  for (const fileInput of [document.getElementById('file-input'), document.getElementById('camera-input')]) {
    fileInput.addEventListener('change', () => {
      handlePhotos([...fileInput.files]) // copy first: clearing the input empties its list
      fileInput.value = '' // allow choosing the same file again
    })
  }
  document.getElementById('stage-retry').addEventListener('click', () => {
    if (!busy && lastPhotos.length) sendPhoto()
  })

  // Drag and drop onto the instrument or the conversation.
  for (const zone of [stage, chat]) {
    zone.addEventListener('dragover', (event) => {
      event.preventDefault()
      stage.classList.add('is-dragging')
    })
    zone.addEventListener('dragleave', (event) => {
      if (!zone.contains(event.relatedTarget)) stage.classList.remove('is-dragging')
    })
    zone.addEventListener('drop', (event) => {
      event.preventDefault()
      stage.classList.remove('is-dragging')
      handlePhotos([...event.dataTransfer.files])
    })
  }

  // Pasting an image (e.g. a screenshot) also works.
  document.addEventListener('paste', (event) => {
    const file = [...(event.clipboardData?.files || [])].find((item) => item.type.startsWith('image/'))
    if (file) handlePhotos([file])
  })

  composer.addEventListener('submit', (event) => {
    event.preventDefault()
    const text = input.value
    input.value = ''
    ask(text)
  })

  suggestions.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-question]')
    if (chip) ask(chip.dataset.question)
  })
}

await initLayout()

if (!session.user) {
  document.getElementById('dropzone').hidden = true
  document.getElementById('composer-wrap').hidden = true
  document.getElementById('scan-login').hidden = false
  setStage('idle', 'Log in to use the scanner')
} else {
  setupInputs()
  showSuggestions(STARTER_QUESTIONS)
  try {
    const { ai } = await api.get('/api/health')
    if (!ai) document.getElementById('scan-setup-notice').hidden = false
  } catch {
    // Health check failing is not fatal; real errors show when the user scans.
  }
}
