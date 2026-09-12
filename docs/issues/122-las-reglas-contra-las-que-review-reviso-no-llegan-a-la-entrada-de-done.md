---
caso: 122
titulo: Las reglas contra las que Review revisó quedan en el journal y no llegan a la línea review= de la entrada de DONE
estado: resuelto
resuelto-en: 0.84.0
prioridad: baja
version-detectada: 0.82.0
---

# 122 — `reviewFact` no incluye `review.rules`

**🟢 resuelto en 0.84.0**

## Resumen

El caso 105 hizo que cada fase reciba las reglas vigentes del proyecto y que Review tenga que nombrar
contra cuáles revisó —si no las nombra, la corrida para con `review-unbacked`—. Esa lista queda en el
journal de la corrida y **no llega a la entrada de `DONE.md`**, que es el registro que sobrevive a la
corrida y el que alguien lee tres meses después.

El daño es de trazabilidad, no de conducta: la revisión ocurrió y fue contra las reglas correctas. Lo que
no se puede reconstruir desde `DONE.md` es **contra cuáles**, que es justo lo que el 105 vino a arreglar.

## Reproducción

```bash
# En una instancia con una tarea cerrada por autobuild:
grep '^- ' planning/DONE.md | tail -1
```

## Síntoma

La línea trae el veredicto y quién revisó, y no las reglas:

```
review=aprobado por security-engineer, sobre engine/hooks/chat.js, engine/hooks/run.js; fases=…
```

Mientras que el journal de esa misma corrida sí las tiene:

```
rules: ["planning/rules/process.md", "planning/rules/security.md", …]
```

## Causa raíz

`automatization/workflows/autobuild.js`:

- `:763` — `let reviewFact = 'no corrió (el carril express no convoca revisor)'`
- `:793` — `reviewFact = \`${review.verdict} por ${cast.review}, sobre ${review.consulted.join(', ')}\``
- `:808` — se le anexa el conteo de lo no volcado al INBOX
- `:904` — `review=${reviewFact}; fases=…` entra en la entrada de DONE

`review.rules` existe en el objeto que Review devuelve —es lo que `review-unbacked` comprueba— y nunca se
lee en `:793`.

## Fix propuesto

Sumarlo donde ya se arma el hecho, en `:793`:

```diff
-    reviewFact = `${review.verdict} por ${cast.review}, sobre ${review.consulted.join(', ')}`
+    reviewFact = `${review.verdict} por ${cast.review}, sobre ${review.consulted.join(', ')}`
+      + (review.rules?.length ? ` · reglas: ${review.rules.join(', ')}` : '')
```

## Tradeoffs

- **La entrada de DONE se alarga**, y es una línea que se lee entera. Con cinco reglas son ~120 caracteres
  más. Si molesta, la alternativa es el conteo (`· 5 reglas`) y perder los nombres — que es la mitad que
  importa, así que no la recomiendo.
- El tope de la línea del INBOX no aplica acá; `DONE.md` no tiene tope. Conviene comprobar que ninguna
  puerta mida el ancho de esa línea antes de darlo por gratis.

## Prioridad

**Baja.** No hay pérdida de conducta: la revisión fue contra las reglas correctas y el journal lo prueba.
Sube a media el día que alguien tenga que auditar una entrega vieja y el journal ya no esté.

## Contexto de descubrimiento

El cierre del **105** lo dejó anotado como seguimiento: «*No se sumó a la línea `review=` de la entrada de
DONE: está pegada al volcado a INBOX que otro cambio está tocando en paralelo, y queda como seguimiento —se
cierra agregando `review.rules` a `reviewFact`—.*»

El bloqueo que justificaba diferirlo era el 101/115, y los dos se cerraron en 0.82.0 y 0.83.0. O sea que la
razón para no hacerlo ya no existe y el ítem no tenía quien lo levantara: «seguimiento» no es un número.
Lo encontró la auditoría de 0.79→0.83 del 2026-09-12.

## Relacionados

- **105** — de donde salió.
- **115** — la procedencia en el INBOX, el cambio que bloqueaba a éste y ya está cerrado.
- **121** y **123** — los otros dos ítems del mismo contraste.

## Cierre

**🟢 resuelto en 0.84.0** · `automatization/workflows/autobuild.js`, `test/workflows/autobuild-review.test.js`

### Contra lo que el caso enumeró

**El fix propuesto** — hecho donde el caso decía, en `:793`: `reviewFact` suma `· reglas: <lista>` cuando
Review declaró contra cuáles revisó, y no suma nada cuando no hay.

**Tradeoff «la entrada de DONE se alarga»** — asumido: se eligió nombrar las reglas y no contarlas, porque
el conteo pierde justo la mitad que importa —cuáles—.

**Tradeoff «comprobar que ninguna puerta mida el ancho de esa línea»** — comprobado, que era el ítem que
pedía mirar antes de darlo por gratis: la puerta completa quedó en 767 de 767 y `DONE.md` no tiene tope de
ancho.

### Qué se corrió

- **Rojo previo**: la prueba nueva sobre el motor sin tocar — `tests 17, pass 16, fail 1`, con
  `la entrada de DONE nombra contra qué regla se revisó` en `autobuild-review.test.js:36`.
- **Verde**: 115 de 115 en las dos suites; `npm run ci` y `npm test` en 0, **767 de 767**.
- **Mutación** (M2, en copia desechable, R23): quitar el sufijo de reglas pone la prueba en rojo.
- **La prueba lleva las dos mitades**: que la línea nombre la regla y que **siga** trayendo el veredicto y
  lo inspeccionado. Sin la segunda, reemplazar la línea entera por la lista daría el mismo verde.
