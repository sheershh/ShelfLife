// Talks to Google's Gemini API (free tier from Google AI Studio) using plain fetch, no SDK.
//
// Two jobs:
//   analyseImage()  - looks at one photo and returns a structured freshness verdict (JSON).
//   chat()          - answers follow-up questions in plain text.
//
// The model only *perceives*. The advice users see (storage method, shelf life, spoilage signs)
// comes from our own MongoDB food records, which the controller attaches to the answer and
// which we also paste into the chat prompt. This is called "grounding".
import { CONFIDENCE, RECOMMENDATIONS, RIPENESS } from '../models/Scan.js'
import { AppError } from '../utils/helpers.js'

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const TIMEOUT_MS = 25_000 // per attempt; with the fallback the user waits at most ~50 s

const model = () => process.env.GEMINI_MODEL || 'gemini-3.5-flash'
// Tried once if the main model is overloaded (503) or does not answer in time,
// which happens on the free tier at busy times.
const fallbackModel = () => process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.8-flash'

export const isConfigured = () => Boolean(process.env.GEMINI_API_KEY)

// Sends one generateContent request and returns the text of the first answer.
async function generate(body) {
  if (!isConfigured()) {
    throw new AppError(503, 'The freshness scanner is not set up yet (GEMINI_API_KEY is missing on the server).')
  }
  // Newer Gemini models "think" before answering. A low thinking level keeps answers to a few seconds.
  const request = { ...body, generationConfig: { ...body.generationConfig, thinkingConfig: { thinkingLevel: 'low' } } }

  let result
  try {
    result = await callModel(model(), request)
  } catch (error) {
    if (error.status !== 504) throw error // a timeout gets one more try on the fallback model below
    result = { status: 504 }
  }
  if ([503, 504].includes(result.status) && fallbackModel() !== model()) {
    console.warn(`Gemini ${model()} answered ${result.status}, trying ${fallbackModel()}`)
    result = await callModel(fallbackModel(), request)
  } else if (result.status === 504) {
    throw new AppError(504, 'The AI took too long to answer. Please try again.')
  }
  const { response, data } = result

  if (!response.ok) {
    // Log the provider's message for us, but give the user a clear, safe message.
    console.error(`Gemini error ${response.status}:`, data?.error?.message)
    if (response.status === 429) {
      throw new AppError(429, 'The free AI quota is used up for the moment. Please try again in a minute.')
    }
    if (response.status === 503) {
      throw new AppError(503, 'The AI service is very busy right now. Please try again in a moment.')
    }
    if ([400, 403, 404].includes(response.status)) {
      throw new AppError(502, 'The AI service rejected the request. Check GEMINI_API_KEY and GEMINI_MODEL.')
    }
    throw new AppError(502, 'The AI service had a problem. Please try again.')
  }

  const candidate = data.candidates?.[0]
  const text = candidate?.content?.parts?.filter((part) => !part.thought).map((part) => part.text || '').join('')
  if (!text) {
    // Gemini returns no text when its own safety filters block an answer.
    throw new AppError(422, 'The AI could not answer that. Try a clearer photo or a different question.')
  }
  return text
}

async function callModel(name, body) {
  try {
    const response = await fetch(`${API_BASE}/${name}:generateContent`, {
      method: 'POST',
      // The key goes in a header (not the URL) so it never appears in logs of requested URLs.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return { status: response.status, response, data: await response.json().catch(() => ({})) }
  } catch (error) {
    const timedOut = error.name === 'TimeoutError'
    throw new AppError(504, timedOut ? 'The AI took too long to answer. Please try again.' : 'Could not reach the AI service.')
  }
}

// ---------- 1. Image analysis ----------

// Describes the JSON we want back. Gemini is forced to follow this shape ("structured output").
function verdictSchema(foodIds) {
  return {
    type: 'OBJECT',
    properties: {
      isFood: { type: 'BOOLEAN', description: 'True only if the photo clearly shows a food item.' },
      item: { type: 'STRING', description: 'Short name of the food, e.g. "Banana". "Unknown" if not food.' },
      matchedFoodId: { type: 'STRING', enum: [...foodIds, 'none'] },
      ripeness: { type: 'STRING', enum: RIPENESS },
      freshnessScore: { type: 'INTEGER', description: '100 = just harvested, 0 = completely spoiled.' },
      mould: {
        type: 'OBJECT',
        properties: {
          detected: { type: 'BOOLEAN' },
          where: { type: 'STRING', description: 'Where the mould is, or empty if none.' },
        },
        required: ['detected', 'where'],
      },
      visibleSigns: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Up to 5 short observations.' },
      estimatedDaysLeft: { type: 'STRING', description: 'e.g. "About 1–2 days at room temperature".' },
      recommendation: { type: 'STRING', enum: RECOMMENDATIONS },
      confidence: { type: 'STRING', enum: CONFIDENCE },
      summary: { type: 'STRING', description: 'One or two plain sentences for a home cook.' },
    },
    required: ['isFood', 'item', 'matchedFoodId', 'ripeness', 'freshnessScore', 'mould', 'visibleSigns',
      'estimatedDaysLeft', 'recommendation', 'confidence', 'summary'],
  }
}

function analysisInstructions(catalog) {
  const list = catalog.map((food) => `${food.slug} (${food.name}, ${food.category})`).join('; ')
  return `You are the ShelfLife freshness inspector. You receive one photo of food (or up to three photos of the same item from different sides) and judge its visible quality.

Rules:
- Only describe what you can actually see. Do not guess about smell, taste or the inside of the food.
- If the photo does not clearly show food, set isFood false, item "Unknown", ripeness "unknown",
  recommendation "unsure", confidence "low", freshnessScore 0, and explain briefly in summary.
- matchedFoodId: if the food is one of these ShelfLife foods, use its id, otherwise "none": ${list}.
- ripeness: unripe (not ready yet), ripe (at its best), overripe (soft, browning, use now), spoiled (rotten).
- mould.detected is true only for visible fuzzy growth or white, green, blue, grey or black mould patches.
- recommendation: eat (good now), use-soon (within a day or two), cook-today (best cooked or blended today),
  discard (rotten or mouldy). Visible mould on soft fruit, vegetables, bread or dairy always means discard.
- confidence: lower it for blurry, dark, or partial photos. More than one angle of the same item raises it.
- You judge quality only, never safety. Do not say the food is "safe to eat".`
}

// images: one photo or up to three of the same item, each { mimeType: 'image/jpeg', data: '<base64>' }.
// catalog: [{ slug, name, category }]
export async function analyseImage(images, catalog) {
  const photos = Array.isArray(images) ? images : [images]
  const text = await generate({
    systemInstruction: { parts: [{ text: analysisInstructions(catalog) }] },
    contents: [{
      role: 'user',
      parts: [
        ...photos.map((photo) => ({ inlineData: { mimeType: photo.mimeType, data: photo.data } })),
        { text: photos.length > 1 ? 'These photos show the same item from different sides. Judge the worst visible side.' : 'Inspect this food and return the verdict.' },
      ],
    }],
    generationConfig: {
      temperature: 0.2, // low = more consistent answers for the same photo
      responseMimeType: 'application/json',
      responseSchema: verdictSchema(catalog.map((food) => food.slug)),
    },
  })

  try {
    return JSON.parse(text)
  } catch {
    throw new AppError(502, 'The AI answer could not be read. Please try again.')
  }
}

// ---------- 2. Follow-up chat ----------

function chatInstructions(context) {
  return `You are the ShelfLife kitchen assistant. You help people judge freshness, store food well and use it
before it is wasted.

How to answer:
- Plain text only, no markdown, no lists with symbols. 2 to 5 short sentences.
- Base storage and shelf-life advice on the ShelfLife records below when they are relevant, and say so
  ("ShelfLife's guide suggests..."). If the records do not cover the question, give general guidance.
- Food safety: when in doubt, throw it out. Never say mouldy soft food is fine. Mention that quality and
  safety are different when it matters. You are not a substitute for food-safety authorities.
- Politely decline questions that are not about food, cooking, storage or food waste.

${context}`
}

// history: [{ role: 'user' | 'assistant', text }], context: text block with scan result and food records.
export async function chat({ history, message, context }) {
  const contents = [
    ...history.map((turn) => ({ role: turn.role === 'assistant' ? 'model' : 'user', parts: [{ text: turn.text }] })),
    { role: 'user', parts: [{ text: message }] },
  ]
  const text = await generate({
    systemInstruction: { parts: [{ text: chatInstructions(context) }] },
    contents,
    generationConfig: { temperature: 0.5, maxOutputTokens: 600 },
  })
  return text.trim()
}

// ---------- 3. Recipe ideas ----------

// foods: [{ name, daysLeft }] where daysLeft is null when unknown. Returns { recipes: [...] }.
export async function suggestRecipes(foods) {
  const list = foods.map((food) => (food.daysLeft == null ? food.name : `${food.name} (${food.daysLeft} days left)`)).join(', ')
  const text = await generate({
    systemInstruction: {
      parts: [{ text: `You are the ShelfLife kitchen assistant. Suggest simple home recipes that use up the foods the
user has, putting the ones with the fewest days left first. Everyday ingredients only, Indian and international
home cooking both welcome. Each recipe: a short title, 3 to 6 short steps, and the foods from the list it uses.
Give 3 recipes. Only use foods from the list as the main ingredients; plain pantry items (oil, salt, spices,
water) may be assumed. Never suggest eating food that is described as expired.` }],
    },
    contents: [{ role: 'user', parts: [{ text: `My foods: ${list}` }] }],
    generationConfig: {
      temperature: 0.7,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          recipes: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING' },
                minutes: { type: 'INTEGER', description: 'Total time in minutes.' },
                uses: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Foods from the list used.' },
                steps: { type: 'ARRAY', items: { type: 'STRING' } },
              },
              required: ['title', 'minutes', 'uses', 'steps'],
            },
          },
        },
        required: ['recipes'],
      },
    },
  })
  try {
    return JSON.parse(text)
  } catch {
    throw new AppError(502, 'The AI answer could not be read. Please try again.')
  }
}

// ---------- 4. Receipt reading ----------

// Returns { items: [{ text, matchedFoodId }] } for the grocery lines on a receipt photo.
export async function readReceipt(image, catalog) {
  const list = catalog.map((food) => `${food.slug} (${food.name})`).join('; ')
  const text = await generate({
    systemInstruction: {
      parts: [{ text: `You read grocery receipts and shopping photos. List each food product you can see. For each,
give the text as written (text) and, if it is one of these ShelfLife foods, its id, otherwise "none": ${list}.
Skip non-food lines (bags, tax, totals, cleaning products). If the photo is not a receipt or groceries,
return an empty list.` }],
    },
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: image.mimeType, data: image.data } },
        { text: 'List the foods on this receipt.' },
      ],
    }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          items: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                text: { type: 'STRING' },
                matchedFoodId: { type: 'STRING', enum: [...catalog.map((food) => food.slug), 'none'] },
              },
              required: ['text', 'matchedFoodId'],
            },
          },
        },
        required: ['items'],
      },
    },
  })
  try {
    return JSON.parse(text)
  } catch {
    throw new AppError(502, 'The AI answer could not be read. Please try again.')
  }
}
