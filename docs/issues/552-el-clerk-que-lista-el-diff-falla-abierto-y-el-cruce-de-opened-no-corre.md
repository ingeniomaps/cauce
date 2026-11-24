---
caso: 552
titulo: el clerk que lista el diff falla abierto, y el cruce de `opened` no corre sin que nada lo diga
estado: resuelto
resuelto-en: 0.124.0
prioridad: alta
version-detectada: 0.124.0
---

# 552 — el clerk que lista el diff falla abierto, y el cruce de `opened` no corre sin que nada lo diga

**🟢 resuelto en 0.124.0** · detectado en 0.124.0 · prioridad **alta**: la puerta del 485 se apagó en 4 de 7 corridas reales, y la
corrida se leyó igual que una revisada.

## Resumen

Review le pide a un clerk la lista de archivos del diff (`automatization/workflows/autobuild.js:1974-1979`), y la cruza
contra lo que el revisor declara en `opened` (`:1985-1987`). El esquema de la respuesta, `DIFFED` (`:543-546`), sólo
tiene `files`: no tiene cómo decir «no pude correr el comando». Cuando el comando se deniega, el clerk devuelve
`files: []`, el recorrido sólo frena si no hubo respuesta (`:1980`), `required` queda vacío y el cruce no pide nada.

La foto de antes de Build (`review-baseline`, `:1783`) usa el mismo esquema y falla igual: una lista vacía de antes hace
que lo que ya estaba sucio cuente como del diff, que es el lado seguro, pero tampoco lo dice.

## Reproducción

Medido por el caso 549 en las transcripciones de las 7 corridas reales de `/autobuild` del 2026-11-22 (Claude Code
2.1.330, bancos `/var/tmp/cauce-run-*`), sin gastar modelo:

- En 538a, 538d, 533a y 535 el clerk `review-diff` corrió `cd <banco>/app && git status --porcelain
  --untracked-files=all` y la llamada se denegó (`toolDenialKind: user-rejected`). En 538a reintentó con `git -C` y
  también se denegó. Las cuatro devolvieron `files: []`.
- El diff no estaba vacío: el `consulted` del revisor de 533a dice `M src/sum.js, ?? test/`.
- En las otras tres el clerk reintentó con `git -C` y sacó la lista bien.

## Síntoma

El revisor de esas cuatro corridas recibió un prompt sin «El diff toca estos archivos», y su `opened` no se cruzó con
nada. El hecho de revisión en `done/` no dice que el cruce no corrió.

## Causa raíz

`DIFFED` no distingue «el diff está vacío» de «no pude mirarlo», y el recorrido toma la lista vacía como la primera.

## Fix propuesto

- `DIFFED` suma `ran`: `true` si el comando corrió y su salida es la lista; `false` si no pudo, con `why`. El pedido
  (`DIFF_FILES`) lo nombra y pide `git -C <raíz>` en vez de `cd … &&`.
- En `review-diff`, `ran: false` frena con `halt` nombrando el comando y el motivo, igual que la falta de respuesta. En
  `review-baseline`, `ran: false` deja la foto vacía, que ya es el lado seguro, y se anota.

## Tradeoffs

- Un clerk que dice `ran: true` sin haber corrido nada sigue pasando: es otra autodeclaración, y el 549 es el que
  contrasta contra la transcripción. Lo que este caso cierra es que la falla, cuando el clerk la ve, deje de callarse.
- Frenar Review por un clerk que no pudo cuesta una corrida en un banco con permisos estrechos; sin el freno, la
  corrida sale con la revisión sin cruzar, que es peor.

## Contexto de descubrimiento

Medición del caso 549, el 2026-11-22, buscando si `opened` coincidía con lo leído.

## Relacionados

- 485: el cruce de `opened` contra el diff, que esto apaga.
- 549: el contraste de `opened` con la transcripción, que depende de esta lista.

## Cierre

Se recorrió el caso entero:

- **Fix, `DIFFED` suma `ran` y `why`**: se hizo, con `ran` obligatorio. El pedido (`DIFF_FILES`) lo nombra y pide
  `git -C` en vez de `cd … &&`.
- **Fix, `ran: false` en `review-diff` frena**: se hizo; frena con `agent-unavailable` también si `ran` no es `true`,
  nombrando el motivo.
- **Fix, `ran: false` en `review-baseline` deja la foto vacía y se anota**: se hizo; la foto no le resta nada a lo que
  se exige, y el recorrido lo dice con `log`.
- **Tradeoff, un `ran: true` sin haber corrido sigue pasando**: es así; lo contrasta el 549 contra la transcripción.
- **Tradeoff, frenar cuesta una corrida en un banco con permisos estrechos**: se midió, abajo: USD 4,58 hasta la parada.
- **Lo que el enunciado no preveía**: los mensajes de `log` del recorrido no quedan ni en el journal ni en la
  transcripción de la sesión, así que la nota de la foto fallida se ve en vivo y no después.

Lo que se corrió:

- **Dos corridas reales de `/autobuild`** en un banco sidecar con el motor del cambio:
  - Con los permisos de siempre (USD 9,64): el clerk del diff tuvo un comando denegado, reintentó con `git -C` y devolvió
    `{"ran":true,"files":["src/sum.js","test/sum.test.js"]}`; Review cruzó `opened` contra esa lista y la tarea cerró.
  - Sin permiso de `git` (USD 4,58), que es la forma del defecto: `review-baseline` y `review-diff` devolvieron
    `"ran":false` con el motivo («El comando no corrió. El sistema de permisos lo frenó…»), y el recorrido paró con
    `"reason":"agent-unavailable","detail":"la lista de archivos del diff no se pudo sacar (El comando no corrió…"`. El
    agente `review` no llegó a correr y no quedó ningún commit. Antes, ese mismo clerk devolvía `files: []` y Review
    aprobaba sin cruce (las cuatro corridas de «Reproducción»).
- Las pruebas nuevas contra HEAD: 3 en rojo en `autobuild-review-coverage`; después, en verde.
- 4 mutaciones en una copia, las 4 rojas: no frenar con `ran` falso, restar una foto que no corrió, un pedido que no
  nombra `ran` y callar la foto fallida. La del pedido sobrevivió primero y sumó la aserción entera.
- Dos pasadas de revisión independiente; la segunda, nada que impida entregar.
- `npm run ci` con los archivos nuevos stageados: 1962 de 1962, exit 0.

**Sin probar:** la nota de la foto fallida en una sesión real, porque el `log` no queda en disco; la cubre el arnés. Y el
pedido en otros runners, donde el clerk es otro agente.

### Lista de cierre

1. hecho: las cuatro corridas de «Reproducción», medidas por el 549 sobre sus transcripciones.
2. hecho: rama `fix/cases-from-an-instance-audit`.
3. hecho: las pruebas nuevas, 3 en rojo contra HEAD y en verde después.
4. hecho: 4 mutaciones en una copia, las 4 rojas; la que sobrevivió sumó su aserción.
5. hecho: deja de aceptar una lista vacía como diff; antes (`files: []` y Review sin cruce) y después (`ran:false` y parada) en la misma forma de banco.
6. hecho: dos corridas reales, sin dobles; se midió que la lista vacía ya no pasa y que la parada nombra el motivo.
7. hecho: las dos corridas de `/autobuild` en Claude Code, USD 9,64 y USD 4,58.
8. hecho: las dos corridas fueron con el motor final del 552; corrieron `ran:true` tras reintentar y `ran:false` sin permiso.
9. hecho: dos corridas con permisos distintos y los dos clerks (la foto de antes y la lista del diff).
10. hecho: dependían el arnés y las pruebas de cobertura de la revisión, que se actualizaron.
11. hecho: dos pasadas de revisión independiente; la segunda, sin nada que impida entregar.
12. hecho: pasada de comentarios sobre el diff entero.
13. hecho: `npm run ci` con los archivos nuevos stageados, 1962 de 1962, exit 0.
14. hecho: este cierre recorre el Fix propuesto y los Tradeoffs.
15. hecho: nombra lo corrido con su salida, lo que el enunciado no preveía, y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.124.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.124.0.
