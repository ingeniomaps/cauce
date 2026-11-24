const { test, expect } = require('@playwright/test')

test('el total del carrito suma precio por cantidad', async ({ page }) => {
  await page.goto('/carrito?demo=2x10')
  await expect(page.getByTestId('total')).toHaveText('$ 20,00')
})
