// End-to-end checks of the main user journeys in a real browser.
import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const photo = fileURLToPath(new URL('../../client/images/banana.jpg', import.meta.url))

async function logIn(page, who) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(`${who}@test.com`)
  await page.getByLabel('Password').fill('password123')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

// Desktop and mobile runs share one server, so tests that save foods start from an empty list.
async function clearSaved(page) {
  await page.evaluate(async () => {
    const { foods } = await (await fetch('/api/saved')).json()
    for (const food of foods) await fetch(`/api/saved/${food.id}`, { method: 'DELETE' })
  })
}

async function openMenuIfMobile(page) {
  const toggle = page.locator('#menu-toggle')
  if (await toggle.isVisible()) await toggle.click()
}

test('home page shows the scanner demo and real food data, no console errors', async ({ page }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/One scan\s*closer to a\s*smarter\s*kitchen\./)
  await expect(page.locator('#scanner-demo')).toHaveClass(/is-done/, { timeout: 5000 })
  await expect(page.locator('#hero-food-count')).toHaveText('50 everyday')

  // The stage reader: pick a food, then drag through its real stages from the guide.
  await expect(page.locator('.stage-readout-body')).toContainText('Banana')
  await page.getByRole('button', { name: 'Tomato', exact: true }).click()
  await expect(page.locator('#stage-strip')).toContainText('Ripening')
  await page.locator('#stage-range').fill('3')
  await expect(page.locator('#stage-strip')).toContainText('Check Quality')
  await expect(page.locator('.spectrum-stage.is-active')).toHaveAttribute('data-stage', '3')

  await expect(page.locator('#aisles .aisle')).toHaveCount(4)
  await expect(page.locator('#aisles .aisle').first()).toContainText('18 foods')
  await expect(page.locator('#guide-index a')).toHaveCount(50)
  expect(errors).toEqual([])
})

test('food guide search and category filter work together', async ({ page }) => {
  await page.goto('/foods')
  await expect(page.locator('.food-row')).toHaveCount(50)
  await page.getByRole('button', { name: 'Dairy' }).click()
  await expect(page.locator('.food-row')).toHaveCount(6)
  await page.getByLabel('Search foods by name').fill('mil')
  await expect(page.locator('.food-row')).toHaveCount(1)
  await page.getByLabel('Search foods by name').fill('banana')
  await expect(page.getByText('No foods match')).toBeVisible()
  await page.getByRole('button', { name: 'Clear search and filters' }).click()
  await expect(page.locator('.food-row')).toHaveCount(50)
})

test('saving while logged out goes to login and comes back', async ({ page }) => {
  await page.goto('/food?id=milk')
  await page.getByRole('button', { name: 'Save Milk' }).click()
  await expect(page).toHaveURL(/\/login\?reason=save/)
  await expect(page.getByText('Log in to save foods')).toBeVisible()
  await page.getByLabel('Email').fill('user@test.com')
  await page.getByLabel('Password').fill('password123')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/food\?id=milk/)
})

test('save a food, see it in the fridge, inspect it, remove it and undo', async ({ page }) => {
  await logIn(page, 'user')
  await clearSaved(page)
  await page.goto('/food?id=spinach')
  await page.getByRole('button', { name: 'Save Spinach' }).click()
  await expect(page.getByRole('button', { name: 'Remove Spinach from saved foods' })).toHaveAttribute('aria-pressed', 'true')

  await page.goto('/saved')
  await expect(page.locator('#fridge')).toHaveAttribute('data-state', 'open')
  const item = page.locator('.fridge-item[data-food-id="spinach"]')
  await expect(item).toBeVisible()
  await item.click()
  const dialog = page.locator('#fridge-dialog')
  await expect(dialog.getByRole('heading', { name: 'Spinach' })).toBeVisible()
  await expect(dialog).toContainText("You haven't scanned spinach yet")

  await dialog.getByRole('button', { name: 'Remove from saved' }).click()
  await dialog.getByRole('button', { name: 'Yes, remove it' }).click()
  await expect(dialog).toBeHidden()
  await expect(item).toHaveCount(0)
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('.fridge-item[data-food-id="spinach"]')).toBeVisible()

  await page.reload()
  await expect(page.locator('.fridge-item[data-food-id="spinach"]')).toBeVisible()
  await clearSaved(page)
})

test('the fridge is keyboard friendly and shows an empty state', async ({ page }) => {
  await logIn(page, 'admin')
  await clearSaved(page)
  await page.goto('/saved')
  await expect(page.locator('.fridge-empty')).toContainText('Nothing saved yet')
  await page.goto('/food?id=milk')
  await page.getByRole('button', { name: 'Save Milk' }).click()
  await page.goto('/saved')
  const item = page.locator('.fridge-item[data-food-id="milk"]')
  await item.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#fridge-dialog').getByRole('heading', { name: 'Milk' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(item).toBeFocused()
  await clearSaved(page)
})

test('scanner: upload a photo, get a grounded verdict, ask a follow-up', async ({ page }) => {
  await logIn(page, 'user')
  await page.goto('/scan')
  await page.locator('#file-input').setInputFiles(photo)
  const verdict = page.locator('.verdict')
  await expect(verdict).toBeVisible()
  await expect(verdict).toContainText('Banana')
  await expect(verdict).toContainText('Cook or blend today')
  await expect(verdict).toContainText('From the ShelfLife guide')
  await page.getByRole('button', { name: 'Can I still cook with it?' }).click()
  await expect(page.locator('.msg-assistant').last()).toContainText('Fake answer to: Can I still cook with it?')
  await page.getByLabel('Ask a question').fill('How do I store it?')
  await page.getByRole('button', { name: 'Send question' }).click()
  await expect(page.locator('.msg-assistant').last()).toContainText('Fake answer to: How do I store it?')

  await page.goto('/saved#scans')
  await expect(page.locator('.scan-row').first()).toContainText('Banana')
})

test('scanner asks visitors to log in', async ({ page }) => {
  await page.goto('/scan')
  await expect(page.getByRole('heading', { name: 'Log in to start scanning' })).toBeVisible()
  await expect(page.locator('#composer-wrap')).toBeHidden()
})

test('admin console: regular users are refused', async ({ page }) => {
  await logIn(page, 'user')
  await page.goto('/admin')
  await expect(page.getByText('Admins only')).toBeVisible()
})

test('admin console: add, edit and delete a food', async ({ page }) => {
  await logIn(page, 'admin')
  await page.goto('/admin')
  await expect(page.locator('.kpis')).toContainText('Foods in the guide')
  await page.getByRole('tab', { name: 'Foods' }).click()
  await page.getByRole('button', { name: 'Add a food' }).click()

  const dialog = page.locator('#food-dialog')
  await dialog.getByLabel('Name', { exact: true }).fill('Jackfruit')
  await expect(dialog.getByLabel('Id (used in the URL)')).toHaveValue('jackfruit')
  await dialog.getByLabel('Shelf-life summary').fill('Room temp: 2–4 days')
  await dialog.getByLabel('Short description').fill('A huge, fragrant fruit that softens as it ripens.')
  await dialog.getByLabel('Room temperature').fill('About 2–4 days once ripe')
  await dialog.getByLabel('Storage method').fill('Ripen at room temperature, then refrigerate.')
  await dialog.getByLabel('Freshness stages').fill('Ripe: Strong sweet smell, gives slightly when pressed.')
  await dialog.getByLabel('Storage tips').fill('Refrigerate cut pods in a sealed box.')
  await dialog.getByLabel('Ways to use it up').fill('Jackfruit curry')
  await dialog.getByLabel("Signs it's fresh").fill('Sweet smell')
  await dialog.getByLabel("Signs it's spoiling").fill('Dark mushy patches')
  await dialog.getByRole('button', { name: 'Save food' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('#foods-table')).toContainText('Jackfruit')

  await page.locator('[data-edit="jackfruit"]').click()
  await dialog.getByLabel('Name', { exact: true }).fill('Kerala Jackfruit')
  await dialog.getByRole('button', { name: 'Save food' }).click()
  await expect(page.locator('#foods-table')).toContainText('Kerala Jackfruit')

  await page.goto('/foods')
  await expect(page.locator('.food-row', { hasText: 'Kerala Jackfruit' })).toBeVisible()

  await page.goto('/admin#foods')
  await page.locator('[data-delete-food="jackfruit"]').click()
  await page.locator('[data-delete-food="jackfruit"]').click()
  await expect(page.locator('#foods-table')).not.toContainText('Kerala Jackfruit')
})

test('admin form shows server validation errors next to fields', async ({ page }) => {
  await logIn(page, 'admin')
  await page.goto('/admin#foods')
  await page.getByRole('button', { name: 'Add a food' }).click()
  await page.locator('#food-dialog').getByRole('button', { name: 'Save food' }).click()
  await expect(page.locator('#food-dialog .form-error')).toBeVisible()
  await expect(page.locator('#food-dialog .field-error:not([hidden])').first()).toBeVisible()
})

test('navigation works on every screen size', async ({ page }) => {
  await page.goto('/')
  await openMenuIfMobile(page)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Food guide' }).click()
  await expect(page).toHaveURL(/\/foods/)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
