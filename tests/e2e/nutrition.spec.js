// Browser checks of the nutrition diary: logging foods, totals, undo, goals, days, and the food page facts.
import { expect, test } from '@playwright/test'

const pad = (n) => String(n).padStart(2, '0')
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

async function logIn(page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill('user@test.com')
  await page.getByLabel('Password').fill('password123')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

// Desktop and mobile runs share one server, so every test starts with an empty diary for today and default goals.
async function reset(page) {
  await page.evaluate(async (date) => {
    const { entries } = await (await fetch(`/api/nutrition/day?date=${date}`)).json()
    for (const entry of entries) await fetch(`/api/nutrition/entries/${entry.id}`, { method: 'DELETE' })
    await fetch('/api/nutrition/goals', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ calories: 2000, carbs: 250, fat: 65, protein: 50 }) })
  }, todayIso())
}

test('log a food from the guide, see the totals, remove it and undo', async ({ page }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await logIn(page)
  await reset(page)
  await page.goto('/nutrition')
  await expect(page.locator('#day-title')).toHaveText('Today')
  await expect(page.locator('.ring-left')).toContainText('2,000 left')

  await page.locator('[data-add="breakfast"]').click()
  const dialog = page.locator('#add-dialog')
  await dialog.getByLabel('Search foods').fill('banana')
  await dialog.locator('[data-pick="banana"]').click()
  await expect(dialog.locator('#grams')).toHaveValue('118')
  await expect(dialog.locator('.preview-kcal')).toContainText('105')
  await dialog.getByRole('button', { name: 'Add to diary' }).click()
  await expect(dialog).toBeHidden()

  const breakfast = page.locator('section.meal', { has: page.locator('#meal-breakfast') })
  await expect(breakfast.locator('.entry')).toHaveCount(1)
  await expect(breakfast.locator('.entry')).toContainText('105')
  await expect(page.locator('.ring-left')).toContainText('1,895 left')
  await expect(page.locator('.nutri-macros')).toContainText('26.9')

  await breakfast.getByRole('button', { name: 'Remove Banana' }).click()
  await expect(breakfast.locator('.entry')).toHaveCount(0)
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click()
  await expect(breakfast.locator('.entry')).toHaveCount(1)
  await reset(page)
  expect(errors).toEqual([])
})

test('a custom entry, a different amount, and going over the goal', async ({ page }) => {
  await logIn(page)
  await reset(page)
  await page.goto('/nutrition')

  await page.locator('[data-add="snack"]').click()
  const dialog = page.locator('#add-dialog')
  await dialog.getByRole('button', { name: 'Custom entry' }).click()
  await dialog.getByLabel('Name').fill('Big pizza')
  await dialog.getByLabel('Calories (kcal)').fill('2300')
  await dialog.getByLabel('Carbs (g)').fill('260')
  await dialog.getByRole('button', { name: 'Add to diary' }).click()
  await expect(page.locator('.ring-left')).toContainText('300 over')
  await expect(page.locator('.ring-left.is-over')).toBeVisible()

  await page.locator('[data-add="lunch"]').click()
  await dialog.locator('[data-pick="rice"]').click()
  await dialog.getByRole('button', { name: '2 servings (320 g)' }).click()
  await expect(dialog.locator('#grams')).toHaveValue('320')
  await expect(dialog.locator('.preview-kcal')).toContainText('416')
  await page.keyboard.press('Escape')
  await reset(page)
})

test('form errors are shown, and goals can be changed', async ({ page }) => {
  await logIn(page)
  await reset(page)
  await page.goto('/nutrition')

  await page.locator('[data-add="dinner"]').click()
  const dialog = page.locator('#add-dialog')
  await dialog.getByRole('button', { name: 'Custom entry' }).click()
  await dialog.getByRole('button', { name: 'Add to diary' }).click()
  await expect(dialog.locator('.field-error:visible').first()).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Edit daily goals' }).click()
  const goals = page.locator('#goals-dialog')
  await goals.getByLabel('Calories (kcal)').fill('1500')
  await goals.getByRole('button', { name: 'Save goals' }).click()
  await expect(goals).toBeHidden()
  await expect(page.locator('.ring-of')).toContainText('of 1,500 kcal')
  await reset(page)
})

test('moving between days and opening a food from a link', async ({ page }) => {
  await logIn(page)
  await reset(page)
  await page.goto('/nutrition')
  await page.getByRole('button', { name: 'Previous day' }).click()
  await expect(page.locator('#day-title')).toHaveText('Yesterday')
  await expect(page.locator('.meal-empty').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next day' })).toBeEnabled()
  await page.getByRole('button', { name: 'Next day' }).click()
  await expect(page.getByRole('button', { name: 'Next day' })).toBeDisabled()

  await page.goto('/nutrition?add=mango')
  await expect(page.locator('#add-dialog')).toBeVisible()
  await expect(page.locator('#add-dialog h2')).toHaveText('Mango')
  await expect(page).toHaveURL(/\/nutrition$/)
})

test('the food page shows nutrition facts and links to the diary', async ({ page }) => {
  await page.goto('/food?id=banana')
  const section = page.locator('section', { has: page.locator('#nutrition-heading') })
  await expect(section.locator('table')).toContainText('105')
  await expect(section.locator('table')).toContainText('89')
  await section.getByRole('link', { name: 'Log it in my diary' }).click()
  await expect(page).toHaveURL(/\/(nutrition|login)/)
})

test('visitors are asked to log in', async ({ page, context }) => {
  await context.clearCookies()
  await page.goto('/nutrition')
  await expect(page.getByRole('heading', { name: 'Log in to keep a diary' })).toBeVisible()
  await expect(page.locator('#nutri-app')).toBeHidden()
})
