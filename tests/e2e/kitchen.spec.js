// Browser checks of the kitchen features: use-by clock, used / wasted insights, shopping list,
// add groceries, recipes for what you have, guide filters and the installable app files.
import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const photo = fileURLToPath(new URL('../../client/images/banana.jpg', import.meta.url))
const daysAgo = (days) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)

async function logIn(page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill('user@test.com')
  await page.getByLabel('Password').fill('password123')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

// Desktop and mobile runs share one server, so each test starts from an empty fridge and list.
async function reset(page) {
  await page.evaluate(async () => {
    const { foods } = await (await fetch('/api/saved')).json()
    for (const food of foods) await fetch(`/api/saved/${food.id}`, { method: 'DELETE' })
    await fetch('/api/shopping', { method: 'DELETE' })
  })
}

async function openFridge(page) {
  await page.goto('/saved')
  await expect(page.locator('#fridge')).toHaveAttribute('data-state', 'open')
}

test('guide filters: storage, keeps-for and sorting', async ({ page }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/foods')
  await expect(page.locator('.food-row').first()).toBeVisible()
  const all = await page.locator('.food-row').count()

  await page.locator('#storage-filter').selectOption('Refrigerator')
  await expect(page.locator('#result-count-visible')).toContainText('of 50 foods')
  const fridge = await page.locator('.food-row').count()
  expect(fridge).toBeGreaterThan(0)
  expect(fridge).toBeLessThan(all)
  await expect(page.locator('.food-row-store').first()).toContainText('Refrigerator')

  await page.locator('#sort-by').selectOption('name')
  // The list reloads from the API after each change, so wait for the sorted order to arrive.
  await expect.poll(async () => {
    const names = await page.locator('.food-row-name strong').allTextContents()
    return JSON.stringify(names) === JSON.stringify([...names].sort((a, b) => a.localeCompare(b)))
  }).toBe(true)

  await page.locator('#storage-filter').selectOption('')
  await page.locator('#lasting-filter').selectOption('Highly Perishable')
  await expect(page.locator('.food-row-lasting').first()).toContainText('Highly Perishable')
  expect(errors).toEqual([])
})

test('use-by clock, then "I used it" shows up in the insights', async ({ page }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await logIn(page)
  await reset(page)
  await page.evaluate(() => fetch('/api/saved/spinach', { method: 'POST' }))
  await openFridge(page)

  await page.locator('.fridge-item[data-food-id="spinach"]').click()
  const dialog = page.locator('#fridge-dialog')
  await expect(dialog).toContainText('Tell ShelfLife when you bought spinach')
  await dialog.getByLabel('Bought on').fill(daysAgo(3))
  await dialog.getByRole('button', { name: 'Start the clock' }).click()
  await expect(dialog.locator('.expiry')).toBeVisible()
  await expect(dialog.locator('.fd-clock-line')).toContainText('use by')

  await dialog.getByRole('button', { name: 'I used it' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.fridge-item')).toHaveCount(0)

  await page.getByRole('tab', { name: 'Insights' }).click()
  await expect(page.locator('#panel-insights')).toContainText(/\d+% of your food was used/)
  expect(errors).toEqual([])
})

test('the fridge warns about food close to its limit', async ({ page }) => {
  await logIn(page)
  await reset(page)
  await page.evaluate(async (date) => {
    await fetch('/api/saved/spinach', { method: 'POST' })
    await fetch('/api/saved/spinach', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boughtOn: date }),
    })
  }, daysAgo(30))
  await openFridge(page)
  await expect(page.locator('#use-soon')).toContainText('Spinach')
  await expect(page.locator('#use-soon .expiry-expired')).toBeVisible()
  await expect(page.locator('.fridge-item[data-food-id="spinach"]')).toHaveAttribute('data-expiry', 'expired')
  await reset(page)
})

test('shopping list: add a guide food, tick it off, find it in the fridge', async ({ page }) => {
  await logIn(page)
  await reset(page)
  await page.goto('/saved#shopping')
  const panel = page.locator('#panel-shopping')
  await expect(panel.getByRole('heading', { name: 'Your list is empty' })).toBeVisible()

  await panel.getByLabel('Add something to your shopping list').fill('Milk')
  await panel.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(panel.locator('.shop-item')).toContainText('Milk')
  await panel.getByLabel('Add something to your shopping list').fill('Candles')
  await panel.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(panel.locator('.shop-item')).toHaveCount(2)

  await panel.getByRole('button', { name: 'Mark Milk as bought' }).click()
  await expect(panel.locator('.shop-item')).toHaveCount(1)
  await page.getByRole('tab', { name: 'Saved foods' }).click()
  const milk = page.locator('.fridge-item[data-food-id="milk"]')
  await expect(milk).toBeVisible()
  await expect(milk).toHaveAttribute('data-expiry', /fresh|soon|today/)
  await reset(page)
})

test('add groceries: read a receipt and put the foods in the fridge', async ({ page }) => {
  await logIn(page)
  await reset(page)
  await page.goto('/add')
  await expect(page.locator('#add-login')).toBeHidden() // the log-in box is for visitors only
  await page.locator('#receipt-input').setInputFiles(photo)
  const result = page.locator('#receipt-result')
  await expect(result).toContainText('Found 1 food')
  await expect(result).toContainText('Banana')
  await expect(result).toContainText('BIN BAGS')
  await result.getByRole('button', { name: 'Add to my fridge' }).click()
  await expect(result).toContainText('added to your fridge')

  await openFridge(page)
  await expect(page.locator('.fridge-item[data-food-id="banana"]')).toBeVisible()
  await reset(page)
})

test('add groceries asks visitors to log in, and rejects a bad barcode', async ({ page, context }) => {
  await context.clearCookies()
  await page.goto('/add')
  await expect(page.getByRole('heading', { name: 'Log in to add groceries' })).toBeVisible()
  await logIn(page)
  await page.goto('/add')
  await page.getByLabel('Barcode number').fill('12')
  await page.getByRole('button', { name: 'Look up' }).click()
  await expect(page.locator('#barcode-error')).toContainText('6 to 14 digits')
})

test('recipes for what you have', async ({ page }) => {
  await logIn(page)
  await reset(page)
  await page.evaluate(() => fetch('/api/saved/spinach', { method: 'POST' }))
  await page.goto('/recipes')
  const panel = page.locator('#cook-panel')
  await expect(panel).toBeVisible()
  await expect(panel.getByLabel('Spinach')).toBeChecked()
  await panel.getByRole('button', { name: 'Suggest recipes' }).click()
  await expect(page.locator('#cook-results')).toContainText('Quick saag')
  await reset(page)
})

test('installable app files are served and the service worker registers', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
  const manifest = await (await page.request.get('/manifest.webmanifest')).json()
  expect(manifest.name).toBe('ShelfLife')
  expect(manifest.display).toBe('standalone')
  const ready = await page.evaluate(async () => Boolean((await navigator.serviceWorker.ready).active))
  expect(ready).toBe(true)
})
