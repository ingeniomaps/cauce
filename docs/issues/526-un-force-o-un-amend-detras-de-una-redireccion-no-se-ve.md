---
caso: 526
titulo: un --force o un --amend escrito detrás de una redirección no lo ve la regla que los prohíbe
estado: abierto
prioridad: alta
version-detectada: 0.123.0
---

# 526 — un `--force` o un `--amend` escrito detrás de una redirección no lo ve la regla que los prohíbe

**🔴 abierto** · detectado en 0.123.0 · prioridad **alta**: la reescritura de historia publicada es de las reglas sin
salida de R8, y se esquiva sin proponérselo, con la forma en que un agente escribe sus comandos (`… 2>&1`).

## Resumen

Las reglas que prohíben el force-push y el `--amend` (`engine/hooks/shell.js:234` y `:151`) buscan la bandera dentro del
tramo del comando, y el tramo se corta en el primer `;`, `&`, `|` o salto (`MISMO`, `shell.js:52`). El `&` de `2>&1`
también corta, así que una bandera escrita después de la redirección queda afuera y la regla no la ve. Lo que la deja
pasar es lo que autorice el push en sí: `runner.allowPush`, la orden del chat o un «dale».

## Reproducción

Desde la raíz de Cauce, por la entrada real de los hooks (`run.js destructive`, JSON de `PreToolUse` sin chat), sobre un
banco propio con `{ "mode": "embedded", "runner": { "allowPush": true } }`, con el motor de `origin/main` (0.123.0) y con
la rama `fix/519-523-chat-y-historias`:

```bash
git push --force origin feat/x
git push origin feat/x --force
git push origin feat/x 2>&1 --force
git push origin feat/x 2>&1 +feat/x
git commit --amend -m x
git commit -m x 2>&1 --amend
```

## Síntoma

Igual en las dos versiones, antes del arreglo del 525:

```
frena  git push --force origin feat/x
frena  git push origin feat/x --force
pasa   git push origin feat/x 2>&1 --force
pasa   git push origin feat/x 2>&1 +feat/x
frena  git commit --amend -m x
pasa   git commit -m x 2>&1 --amend
```

Con el arreglo del 525 (un push con algo detrás de una redirección frena entero, sin salida), el force-push quedó
cubierto por el guard de push, aunque la regla del force siga sin verlo. Lo que queda, medido con el árbol de la rama el
2026-11-20:

```
frena  git push origin feat/x 2>&1 --force
frena  git push origin feat/x 2>&1 +feat/x
pasa   git commit -m x 2>&1 --amend
pasa   git 2>&1 push --force origin feat/x
```

## Causa raíz

- `engine/hooks/shell.js:52`: `MISMO = [^;&|\n]`, el carácter que sigue dentro del mismo comando. No distingue el `&` de
  una redirección del de un `&&` o un fondo.
- `engine/hooks/shell.js:234`: el force-push se busca como `\bgit\s+push\b${MISMO}*\s(?:-f|--force…|\+\S)`; con `2>&1`
  antes, la bandera no está en el tramo.
- `engine/hooks/shell.js:151`: el `--amend`, igual.

Para el push, desde el 525 lo frena el guard de push. Quedan el `--amend` y la redirección entre `git` y su subcomando,
que ninguna regla reconoce porque buscan `\bgit\s+push` o `\bgit\s+commit`.

## Fix propuesto

Que `MISMO` no corte en el `&` ni en el `|` de una redirección (`>&N`, `&>`, `>|`), como hizo el 525 con `PUSH`. Es un
cambio en lo que leen todas las reglas de `shell.js` que usan `MISMO`, así que hay que recorrerlas una por una. La
alternativa más angosta es buscar la bandera en todo el comando hasta el próximo separador real (`;`, `&&`, `||`, `|`
sin `>` antes, salto).

Prueba: con `allowPush: true`, `git push origin feat/x 2>&1 --force` y `git commit -m x 2>&1 --amend` frenan; rojas hoy.

## Tradeoffs

- `MISMO` lo usan varias reglas (`git clean`, `checkout`/`restore`, `dd`): ampliarlo cambia lo que ven todas, en la
  dirección que frena más.
- Queda afuera, y es otro hueco preexistente que anotó la misma revisión: una redirección entre `git` y su subcomando
  (`git 2>&1 push …`) no la reconoce ninguna regla, porque buscan `\bgit\s+push`.

## Contexto de descubrimiento

Revisión independiente del caso 525, 2026-11-20: al leer el push entero después de una redirección, quedó a la vista que
la regla del force seguía cortando en ella.

## Relacionados

- **525** — la redirección en el push, que este caso completa del lado de las reglas sin salida.
- **103** — el push por chat y `allowPush`.
