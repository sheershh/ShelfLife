// End-to-end checks of the main user journeys in a real browser.
import { expect, test } from '@playwright/test'

const photo = new URL('../../client/images/banana.jpg', import.meta.url).pathname

async function logIn(page, who) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(`${who}@test.com`)
  await page.getByLabel('Password').fill('password123')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

async function openMenuIfMobile(page) {
  const toggle = page.locator('#menu-toggle')
  if (await toggle.isVisible()) await toggle.click()
}

test('home page shows the scanner demo and real food data, no console errors', async ({ page }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("Know what's still good.")
  await expect(page.locator('#scanner-demo')).toHaveClass(/is-done/, { timeout: 5000 })
  await expect(page.locator('.stage-cell').first()).toBeVisible()
  await page.getByRole('button', { name: 'Tomato', exact: true }).click()
  await expect(page.locator('#stage-strip')).toContainText('tomato')
  await expect(page.locator('#guide-preview .food-row')).toHaveCount(5)
  expect(errors).toEqual([])
})

test('food guide search and category filter work together', async ({ page }) => {
  await page.goto('/foods')
  await expect(page.locator('.food-row')).toHaveCount(12)
  await page.getByRole('button', { name: 'Dairy' }).click()
  await expect(page.locator('.food-row')).toHaveCount(3)
  await page.getByLabel('Search foods by name').fill('mil')
  await expect(page.locator('.food-row')).toHaveCount(1)
  await page.getByLabel('Search foods by name').fill('banana')
  await expect(page.getByText('No foods match')).toBeVisible()
  await page.getByRole('button', { name: 'Clear search and filters' }).click()
  await expect(page.locator('.food-row')).toHaveCount(12)
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

test('save a food, see it on the shelf, remove it', async ({ page }) => {
  await logIn(page, 'user')
  await page.goto('/food?id=spinach')
  await page.getByRole('button', { name: 'Save Spinach' }).click()
  await expect(page.getByRole('button', { name: 'Remove Spinach from saved foods' })).toHaveAttribute('aria-pressed', 'true')
  await page.goto('/saved')
  await expect(page.locator('.food-row', { hasText: 'Spinach' })).toBeVisible()
  await page.getByRole('button', { name: 'Remove Spinach from saved foods' }).click()
  await expect(page.locator('.food-row', { hasText: 'Spinach' })).toHaveCount(0)
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
  await dialog.getByLabel('Name', { exact: true }).fill('Guava')
  await expect(dialog.getByLabel('Id (used in the URL)')).toHaveValue('guava')
  await dialog.getByLabel('Shelf-life summary').fill('Room temp: 2–4 days')
  await dialog.getByLabel('Short description').fill('A fragrant fruit that softens as it ripens.')
  await dialog.getByLabel('Room temperature').fill('About 2–4 days once ripe')
  await dialog.getByLabel('Storage method').fill('Ripen at room temperature, then refrigerate.')
  await dialog.getByLabel('Freshness stages').fill('Ripe: Yellow-green and slightly soft.')
  await dialog.getByLabel('Storage tips').fill('Keep away from bananas.')
  await dialog.getByLabel('Ways to use it up').fill('Guava juice')
  await dialog.getByLabel("Signs it's fresh").fill('Sweet smell')
  await dialog.getByLabel("Signs it's spoiling").fill('Dark mushy patches')
  await dialog.getByRole('button', { name: 'Save food' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('#foods-table')).toContainText('Guava')

  await page.locator('[data-edit="guava"]').click()
  await dialog.getByLabel('Name', { exact: true }).fill('Pink Guava')
  await dialog.getByRole('button', { name: 'Save food' }).click()
  await expect(page.locator('#foods-table')).toContainText('Pink Guava')

  await page.goto('/foods')
  await expect(page.locator('.food-row', { hasText: 'Pink Guava' })).toBeVisible()

  await page.goto('/admin#foods')
  await page.locator('[data-delete-food="guava"]').click()
  await page.locator('[data-delete-food="guava"]').click()
  await expect(page.locator('#foods-table')).not.toContainText('Pink Guava')
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
