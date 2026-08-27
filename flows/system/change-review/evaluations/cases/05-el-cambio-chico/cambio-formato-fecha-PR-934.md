# PR #934 — Formato de fecha en el listado de pedidos

1 archivo, +1 −1. Sin aprobaciones todavía. Descripción del PR: «lo pidió datos para el export».

## El diff

```diff
--- a/src/shared/format.ts
+++ b/src/shared/format.ts
@@ -12,7 +12,7 @@ export function formatDate(value: Date): string {
-  return `${dd}/${mm}/${yyyy}`
+  return `${yyyy}-${mm}-${dd}`
 }
```

## Quién importa `formatDate`

Salida de `grep -rn "from '@/shared/format'" src/`, corrida al preparar el PR:

```
src/pages/orders/list.tsx:4          import { formatDate } from '@/shared/format'
src/pages/orders/summary.tsx:7       import { formatDate } from '@/shared/format'
src/checkout/order-payload.ts:11     import { formatDate } from '@/shared/format'
src/reports/monthly.tsx:3            import { formatDate } from '@/shared/format'
```

`order-payload.ts:44` usa el resultado para el campo `deliveryDate` del cuerpo que se manda al crear un
pedido. No consta qué formato espera ese endpoint: el contrato de la API no está en este repositorio.

## Tests

```
PASS  src/pages/orders/list.test.tsx   (6 tests)
Test Suites: 1 passed, 1 total
```

`format.ts` no tiene test propio. `order-payload.ts` tampoco. Los seis que pasaron son del listado.

## Lo que no consta en este documento

Si alguna de estas rutas está declarada como crítica, no lo dice el PR: eso vive en la instancia, en
`organization/company.md`. Quien revise tiene que ir a mirarlo — acá no está.
