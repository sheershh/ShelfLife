// Freshness scanner: a chat where the user sends a photo (or a question) and the assistant replies.
//
// Flow for a photo:
//   1. preparePhoto() shrinks it in the browser (image.js)
//   2. POST /api/scans sends it to our server, which asks Gemini and checks the answer
//   3. the verdict card is drawn from the response (scan-ui.js)
// Follow-up questions go to POST /api/assistant with the recent conversation and the scan id,
// so the server can ground the answer in that scan and our food records.

import { api, ApiError } from '../api.js'
import { preparePhoto } from '../image.js'
import { initLayout } from '../layout.js'
import { verdictHtml } from '../scan-ui.js'
import { session } from '../session.js'
import { applyDataStyles, escapeHtml } from '../ui.js'

const log = document.getElementById('chat-log')
const chat = document.getElementById('chat')
const dropzone = document.getElementById('dropzone')
const composer = document.getElementById('composer')
const input = document.getElementById('composer-input')
const sendButton = document.getElementById('composer-send')
const suggestions = document.getElementById('suggestions')

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

// ---------- Drawing messages ----------

function addMessage(role, html, extraClass = '') {
  const item = document.createElement('li')
  item.className = `msg msg-${role} ${extraClass}`
  item.innerHTML = `<div class="msg-body">${html}</div>`
  log.append(item)
  item.scrollIntoView({ behavior: 'smooth', block: 'end' })
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

async function handlePhoto(file) {
  if (busy || !file) return
  setBusy(true)
  dropzone.hidden = true
  suggestions.innerHTML = ''

  let photo
  try {
    photo = await preparePhoto(file)
  } catch (error) {
    addError(error.message)
    setBusy(false)
    return
  }

  // The user's photo, with a scan line over it while we wait.
  const userMessage = addMessage('user', `
    <figure class="msg-photo is-scanning">
      <img src="${photo.previewUrl}" alt="Your photo">
      <span class="demo-sweep" aria-hidden="true"></span>
    </figure>`)
  const thinking = addMessage('assistant', '<p class="msg-thinking"><span class="dots" aria-hidden="true"><span></span><span></span><span></span></span>Reading the photo…</p>')

  const send = async () => {
    try {
      const { scan, food, message } = await api.post('/api/scans', { image: photo.image, thumbnail: photo.thumbnail })
      thinking.remove()
      if (!scan) {
        addMessage('assistant', textHtml(message))
        dropzone.hidden = false
        return
      }
      currentScanId = scan.id
      history.length = 0 // a new photo starts a new topic
      history.push({ role: 'assistant', text: `Scan result: ${scan.item}, ${scan.ripeness}, recommendation ${scan.recommendation}. ${scan.summary || ''}` })
      const card = addMessage('assistant', verdictHtml(scan, food), 'msg-verdict')
      applyDataStyles(card)
      showSuggestions(AFTER_SCAN_QUESTIONS)
    } catch (error) {
      thinking.remove()
      addError(errorText(error), () => {
        log.append(thinking)
        send()
      })
    } finally {
      userMessage.querySelector('.msg-photo').classList.remove('is-scanning')
      setBusy(false)
    }
  }
  await send()
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
      handlePhoto(fileInput.files[0])
      fileInput.value = '' // allow choosing the same file again
    })
  }

  // Drag and drop anywhere on the chat.
  chat.addEventListener('dragover', (event) => {
    event.preventDefault()
    chat.classList.add('is-dragging')
  })
  chat.addEventListener('dragleave', (event) => {
    if (!chat.contains(event.relatedTarget)) chat.classList.remove('is-dragging')
  })
  chat.addEventListener('drop', (event) => {
    event.preventDefault()
    chat.classList.remove('is-dragging')
    handlePhoto(event.dataTransfer.files[0])
  })

  // Pasting an image (e.g. a screenshot) also works.
  document.addEventListener('paste', (event) => {
    const file = [...(event.clipboardData?.files || [])].find((item) => item.type.startsWith('image/'))
    if (file) handlePhoto(file)
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
  for (const id of ['dropzone', 'composer-wrap']) document.getElementById(id).hidden = true
  document.getElementById('scan-login').hidden = false
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
