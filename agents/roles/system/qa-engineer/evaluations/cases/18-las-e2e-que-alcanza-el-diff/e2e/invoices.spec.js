const { test, expect } = require('@playwright/test')

test('el comprobante lleva el punto de venta con cuatro dígitos', async ({ page }) => {
  await page.goto('/comprobantes/demo')
  await expect(page.getByTestId('numero')).toHaveText('0003-00000127')
})
