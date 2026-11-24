const { test, expect } = require('@playwright/test')

test('un reembolso de dos tercios de 100 muestra el monto que se devuelve', async ({ page }) => {
  await page.goto('/pedidos/demo-100/reembolso?parte=2/3')
  await expect(page.getByTestId('reembolso')).toHaveText('$ 66,66')
})
