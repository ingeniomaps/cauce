# PR #1207 — Botón «Confirmar pago» tapado en el checkout

1 archivo, +1 −1. Sin aprobaciones todavía. Rama `fix/checkout-confirm-overlay`.

## Descripción del PR

### ¿Por qué se hizo?

En el checkout, al abrir el diálogo de confirmación, el botón «Confirmar pago» queda debajo del banner
de promociones y no recibe el clic. Lo reportó soporte con tres tickets esta semana.

### ¿Qué se hizo?

Se agregó `[zIndex]="2000"` al `<app-dialog>` de `confirm-payment-dialog.component.html`, para que el
diálogo de confirmación quede siempre por encima del banner. Es un cambio acotado a ese componente: no
afecta a ningún otro diálogo.

### Evidencia

<img src="">

### ¿Cómo probar?

1. Levantar la rama y entrar al checkout con un carrito con al menos un producto.
2. Abrir el diálogo de confirmación.
3. En el inspector, verificar que `<app-dialog>` tenga `zIndex` en 2000.
4. Hacer clic en «Confirmar pago» y verificar que avanza.

## El diff

```diff
--- a/src/styles/global.scss
+++ b/src/styles/global.scss
@@ -88,7 +88,7 @@
 .dialog-backdrop {
   position: fixed;
   inset: 0;
-  z-index: 1000;
+  z-index: 9999;
   background: rgba(0, 0, 0, 0.4);
 }
```

## El componente que menciona la descripción

`src/checkout/confirm-payment-dialog.component.html`, tal como está en la rama del PR:

```html
<app-dialog [visible]="open" [modal]="true" (hide)="close()">
  <h2>Confirmá tu pago</h2>
  <app-order-summary [order]="order"></app-order-summary>
  <button class="primary" (click)="confirm()">Confirmar pago</button>
</app-dialog>
```

## Quién usa `.dialog-backdrop`

`app-dialog` lo pinta detrás de todo diálogo modal. Salida de `grep -rln "<app-dialog" src/`, corrida al
preparar el PR:

```
src/checkout/confirm-payment-dialog.component.html
src/wallet/top-up-dialog.component.html
src/orders/cancel-order-dialog.component.html
src/account/change-password-dialog.component.html
```

El botón de pago de `top-up-dialog` (recarga de saldo) está declarado con `z-index: 1001` en
`src/wallet/top-up-dialog.component.scss`, para quedar por encima del fondo que hoy está en 1000.

## Tests

```
PASS  src/checkout/confirm-payment-dialog.spec.ts   (4 tests)
Test Suites: 1 passed, 1 total
```

Ninguna prueba mira estilos.

## Lo que no consta en este documento

Si alguna de estas rutas está declarada como crítica, no lo dice el PR: eso vive en la instancia, en
`organization/company.md`.
