# PR #1311 — Precio de variante al editar un pedido

1 archivo, +3 −1. Sin aprobaciones todavía. Rama `feature/edit-order-variant-price`.

## Descripción del PR

Al editar un pedido, las líneas con variante mostraban el precio base del producto. Ahora toman el
precio de su variante del catálogo. Las líneas sin variante siguen con el precio base.

## El diff

```diff
--- a/src/orders/edit-order.component.ts
+++ b/src/orders/edit-order.component.ts
@@ -22,9 +22,11 @@ export class EditOrderComponent {
   loadLines(order: Order, catalog: CatalogVariant[]): void {
+    const filtered = catalog.filter((v) => order.items.some((item) => item.productId === v.productId))
     this.lines = order.items.map((item, i) => {
       const line = new OrderLine(item)
-      line.unitPrice = item.basePrice
+      const variant = filtered[i]
+      line.unitPrice = variant ? variant.price : item.basePrice
       line.variantId = this.variants.idFor(item.sku)
       return line
     })
   }
```

## El archivo, como queda en la rama

`src/orders/edit-order.component.ts`:

```ts
 1  import { Component } from '@angular/core'
 2  import { CatalogVariant } from '../catalog/catalog-variant'
 3  import { VariantIndex } from '../catalog/variant-index'
 4  import { Order } from './order'
 5  import { OrderLine } from './order-line'
 6
 7  @Component({ selector: 'app-edit-order', templateUrl: './edit-order.component.html' })
 8  export class EditOrderComponent {
 9    lines: OrderLine[] = []
10
11    constructor(private readonly variants: VariantIndex) {}
12
13    save(): void {
14      // envía this.lines al endpoint de edición
15    }
16
17    total(): number {
18      return this.lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
19    }
20
21    // Arma las líneas editables a partir del pedido y del catálogo vigente.
22    loadLines(order: Order, catalog: CatalogVariant[]): void {
23      const filtered = catalog.filter((v) => order.items.some((item) => item.productId === v.productId))
24      this.lines = order.items.map((item, i) => {
25        const line = new OrderLine(item)
26        const variant = filtered[i]
27        line.unitPrice = variant ? variant.price : item.basePrice
28        line.variantId = this.variants.idFor(item.sku)
29        return line
30      })
31    }
32  }
```

`src/orders/order-line.ts`:

```ts
export class OrderLine {
  productId: number
  quantity: number
  unitPrice = 0
  variantId?: number

  constructor(item: { productId: number; quantity: number }) {
    this.productId = item.productId
    this.quantity = item.quantity
  }
}
```

`src/catalog/variant-index.ts`:

```ts
export class VariantIndex {
  // sku → id de variante; undefined si el producto no tiene variantes
  idFor(sku: string): number | undefined { /* … */ }
}
```

`CatalogVariant` es `{ id: number; productId: number; price: number }`.

## El ejemplo con el que lo probó el autor

Pedido:

```json
{ "items": [
  { "productId": 10, "sku": "TAZA-01", "quantity": 1, "basePrice": 15000 },
  { "productId": 20, "sku": "REM-M-AZUL", "quantity": 2, "basePrice": 40000 }
] }
```

Catálogo, en su orden:

```json
[
  { "id": 101, "productId": 10, "price": 15000 },
  { "id": 201, "productId": 20, "price": 42000 },
  { "id": 202, "productId": 20, "price": 45000 },
  { "id": 203, "productId": 20, "price": 48000 }
]
```

`idFor("TAZA-01")` devuelve `101` y `idFor("REM-M-AZUL")` devuelve `202`.

El autor abrió el pedido y vio la taza en 15000. No miró la remera.

## Tests

`src/orders/edit-order.component.spec.ts`, como queda en la rama:

```ts
import { EditOrderComponent } from './edit-order.component'

const variants = { idFor: (sku: string) => ({ 'TAZA-01': 101, 'REM-M-AZUL': 202 } as Record<string, number>)[sku] }

describe('EditOrderComponent.loadLines', () => {
  it('usa el precio de la variante', () => {
    const component = new EditOrderComponent(variants as any)
    const order = { items: [{ productId: 20, sku: 'REM-M-AZUL', quantity: 1, basePrice: 40000 }] } as any
    component.loadLines(order, [{ id: 202, productId: 20, price: 45000 }])
    expect(component.lines[0].unitPrice).toBe(45000)
  })

  it('usa el precio base si el producto no está en el catálogo', () => {
    const component = new EditOrderComponent(variants as any)
    const order = { items: [{ productId: 30, sku: 'LIBRO-01', quantity: 1, basePrice: 22000 }] } as any
    component.loadLines(order, [])
    expect(component.lines[0].unitPrice).toBe(22000)
  })

  it('calcula el total', () => {
    const component = new EditOrderComponent(variants as any)
    const order = { items: [{ productId: 10, sku: 'TAZA-01', quantity: 3, basePrice: 15000 }] } as any
    component.loadLines(order, [{ id: 101, productId: 10, price: 15000 }])
    expect(component.total()).toBe(45000)
  })
})
```

Salida de la corrida de CI:

```
PASS  src/orders/edit-order.component.spec.ts   (3 tests)
Test Suites: 1 passed, 1 total
```
