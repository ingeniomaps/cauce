---
caso: 220
titulo: un rojo preexistente se aprueba commit por commit
estado: abierto
prioridad: media
version-detectada: 0.99.2
---

# 220 — Un repositorio con un gate en rojo heredado pide una aprobación en cada commit

**🔴 abierto** · detectado en 0.99.2 · prioridad **media**.

**Prioridad media**: no rompe nada, pero en un repositorio con lint heredado en rojo cada commit se frena y pide aprobación, y eso empuja a apagar el guard entero (219).

## Resumen

`verify` sólo distingue verde de rojo. Un rojo que ya estaba antes del cambio —errores de lint ajenos, una suite rota en otro módulo— frena todos los commits hasta que alguien lo arregle, y la única salida es aprobar operación por operación (`.ops-approval`). Las dos instancias resolvieron lo mismo con un archivo `automatization/gate-known-red`: el rojo se declara por raíz y gate, con su motivo; si el gate falla sólo en lo declarado pasa con aviso, y un rojo nuevo sigue frenando.

## Reproducción

Pendiente de correr al tomar el caso: un repositorio con `"lint": "exit 1"` y dos commits seguidos; se espera que los dos se frenen y cada uno pida su aprobación.

## Síntoma

En roax-ops el archivo tiene 3 entradas vivas (lint de ESLint 9) y reemplazó un worktree de baseline que duplicaba la carga. En conorbi está vacío: el mecanismo existe y todavía no se usó.

## Causa raíz

`engine/hooks/verify.js`, `verifyGates`: cualquier gate con `!result.ok` va a `failures` y bloquea salvo aprobación de la operación (`engine/hooks/approval.js`).

## Fix propuesto

Un archivo declarado (o un campo de `ops.config.json`) con `<raíz> <gate> — <motivo>`, leído por `verify`. Lo declarado pasa y se avisa mientras exista, igual que hoy se avisa una exención. Hay que decidir qué se compara para saber si el rojo es «el mismo»: el gate entero (simple, deja pasar un rojo nuevo en el mismo gate) o la línea de error.

## Tradeoffs

- Choca con la idea de `approval.js` de que una llave que dura no es por operación: es una decisión de producto, no un detalle.
- Por gate entero es más simple y más permisivo.

## Contexto de descubrimiento

Relevamiento de roax-ops y conorbi-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala.

## Relacionados

- 219 — lo que hizo que las dos apagaran `verify`.
