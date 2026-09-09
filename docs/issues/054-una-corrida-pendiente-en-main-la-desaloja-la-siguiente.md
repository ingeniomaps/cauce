---
caso: 054
titulo: Una corrida pendiente en `main` la desaloja la siguiente, y `cancel-in-progress` no gobierna eso
estado: resuelto
resuelto-en: 0.72.0
prioridad: baja
version-detectada: 0.70.0
---

# 054 — Sólo una corrida puede esperar por grupo, y la que llega desaloja a la que esperaba

**🟢 resuelto en 0.72.0** · detectado en 0.70.0 · prioridad **baja** — el título original culpaba al
mecanismo equivocado; abajo, medido

## Resumen

`ci.yml` agrupa las corridas por `ref` y decide cancelar según la rama:

```yaml
concurrency:
  group: ci-${{ github.ref }}
  # Cancelar en `main` dejaba una release sin señal cuando el commit siguiente llegaba antes.
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}
```

En un push a `main` esa expresión debería dar `false`, y el comentario dice para qué: que una release no
se quede sin su propia señal cuando el commit siguiente llega antes de que termine.

**Cancela a veces.** El 2026-09-08 se mergearon los veinte PR de la tanda semanal y quince corridas de
`main` quedaron en `cancelled`. Ese mismo día, dos merges separados por once segundos no cancelaron
ninguna de las dos.

> **Corregido el 2026-09-09.** El bloque de arriba y el título de este caso culpaban a
> `cancel-in-progress`, y **no es**: esa expresión hace exactamente lo que dice. Lo que cancela es la
> regla por defecto de los grupos de concurrencia, que `cancel-in-progress` no gobierna. La sección
> «Causa raíz» tiene el mecanismo y la medición; lo de abajo se conserva porque los datos son correctos
> y la lectura no.

Esa intermitencia es la primera cosa que hay que saber del caso, y por eso está acá arriba: quien lo
tome esperando un fallo determinista va a mergear dos PR seguidos, ver los dos en verde y concluir que
ya no ocurre.

Conviene decir con precisión qué es y qué no es este caso, porque la primera lectura fue más alarmista de
lo que los hechos sostienen. **Acá no hubo daño, y no por suerte**: cada uno de esos veinte cambios es un
archivo de un directorio distinto, su CI ya había pasado en el PR, y una re-corrida de la suite completa
sobre el merge commit era redundante. Cancelarla no perdió información. El caso no es «main se quedó sin
señal»; es que el código no hace lo que su comentario declara, y que el escenario donde eso sí importa
—una release— es exactamente el que el comentario nombra.

## Reproducción

No se reproduce con un comando: hace falta que dos pushes a `main` se solapen. Ocurre solo al mergear
varios PR seguidos, que es como se cierra una tanda semanal.

**Y solaparlos no alcanza.** Dos merges a once segundos de distancia terminaron los dos en verde, así que
una corrida que no cancela no dice nada: no distingue «no ocurre» de «esta vez no tocó». Para afirmar que
dejó de pasar hace falta una tanda del tamaño de la que lo mostró, no un par de merges.

Lo que sí se comprueba después, sobre una tanda ya mergeada:

```bash
set -a; . ./.env; set +a
GH_TOKEN="$GITHUB_PAT_CAUCE" gh api "repos/ingeniomaps/cauce/actions/runs?branch=main&per_page=100" \
  -q '[.workflow_runs[]|select(.name=="CI")]|group_by(.conclusion)|.[]|"\(.[0].conclusion): \(length)"'
```

## Síntoma

```
cancelled: 15
success: 34
```

Las quince canceladas son todas del 2026-09-08 entre las 22:24 y las 22:5x. Antes de esa fecha no hay
ninguna: el repositorio nunca había mergeado tantos PR seguidos, y con merges espaciados las corridas no
se solapan.

Detalle de los primeros siete merges, por commit:

```
73646f7  #262  ci: success
8fe8210  #263  SIN CHECKS      ← cancelada
bd3db46  #264  SIN CHECKS      ← cancelada
470a6f8  #265  SIN CHECKS      ← cancelada
00b98ca  #266  SIN CHECKS      ← cancelada
5397ce5  #267  SIN CHECKS      ← cancelada
ef9cbf3  #268  ci: success
```

Cuando cancela, el patrón es nítido: **cada corrida muere aproximadamente un segundo después de que se
crea la siguiente**, y la última de la tanda sobrevive.

```
d97f8e8  creada 22:34:16  muere 22:34:24   (98b7594 nace 22:34:23)
98b7594  creada 22:34:23  muere 22:34:31   (6049d50 nace 22:34:30)
6049d50  creada 22:34:30  muere 22:34:40   (ec1d75f nace 22:34:39)
ec1d75f  creada 22:34:39  muere 22:34:55   (1219dc6 nace 22:34:54)
1219dc6  creada 22:34:54  termina 22:36:48 — sobrevive
```

**Y el contraejemplo, del mismo día y el mismo repositorio:**

```
499cac0  creada 22:50:43  termina 22:52:04 en verde   (2b69c8c nace 22:50:54)
2b69c8c  creada 22:50:54  termina en verde
```

Once segundos de separación —dentro del rango de siete a dieciséis que sí canceló arriba— y `499cac0`
no se canceló. La diferencia entre las dos tandas no es el intervalo, y no se sabe cuál es.

## Causa raíz

**Encontrada el 2026-09-09, y no es `cancel-in-progress`.** Esa expresión funciona: en las tres tandas del
2026-09-08, la corrida que estaba **en curso** sobrevivió cada vez. Lo que muere es otra cosa.

Sólo una corrida puede estar **pendiente** por grupo de concurrencia, y la que llega desaloja a la que
esperaba. Es el comportamiento por defecto y está documentado, literal:

> «By default, any existing `pending` job or workflow in the same concurrency group will be canceled and
> the new queued job or workflow will take its place.»
>
> — docs.github.com, «Workflow syntax for GitHub Actions», `concurrency`

`cancel-in-progress` no gobierna eso: gobierna la que está corriendo. Con `group: ci-${{ github.ref }}`,
los pushes a `main` comparten grupo, así que en una tanda sobreviven **la primera** —que ya está
corriendo— y **la última** —que se queda pendiente y nadie la desaloja—, y mueren todas las del medio.

Eso explica también la intermitencia, que era el enigma del caso: hacen falta **tres** corridas
solapadas para que exista una pendiente que desalojar. Con dos nunca pasa, y por eso los merges de las
22:50 salieron los dos en verde. El intervalo no tenía nada que ver.

Los tres racimos del 2026-09-08 tienen la misma forma:

```
22:24:05  ef9cbf3  success    ← en curso, sobrevive
22:24:17  5397ce5  cancelled
22:24:23  00b98ca  cancelled
22:24:29  470a6f8  cancelled
22:24:37  bd3db46  cancelled
22:24:45  8fe8210  cancelled
22:24:55  73646f7  success    ← última, nadie la desaloja
```

**Medido, no deducido.** Se montó el workflow de prueba que este caso pedía, en una rama de descarte de
este mismo repositorio, con dos brazos y la misma cadencia de pushes:

```
grupo por rama   (5 corridas, ~10 s)  primera ✓  · tres canceladas ·  última ✓
grupo por commit (4 corridas, ~10 s)  las cuatro ✓, solapándose entre sí
```

El segundo brazo es el que podía refutar el arreglo y no lo hizo.

## Fix propuesto

~~Ninguno mientras la causa no esté establecida.~~ Con la causa establecida, ninguna de las dos formas que
este caso enumeraba servía: las dos apuntaban a `cancel-in-progress`, que no es el mecanismo.

Lo que hace falta es que las corridas de `main` **no compartan grupo**, para que ninguna quede pendiente
detrás de otra:

```diff
-  group: ci-${{ github.ref }}
+  group: ci-${{ github.ref }}${{ github.ref == 'refs/heads/main' && format('-{0}', github.sha) || '' }}
```

En una rama el grupo sigue siendo por `ref` y `cancel-in-progress` sigue cancelando la corrida vieja, que
ahí es lo que se quiere.

## Tradeoffs

- **Arreglarlo cuesta corridas.** La tanda del 2026-09-08 consumió cinco corridas completas de la suite
  —quince canceladas de veinte—; con la cancelación desactivada habrían sido veinte, y quince de ellas no
  pueden encontrar nada que la corrida del PR no haya encontrado ya. El ahorro varía con la
  intermitencia, así que el número es de esa tanda y no un promedio. Verificado: `sourceFiles()`
  (`test/repo/repo.test.js:17-28`) sólo recorre `.js` y `.sh` bajo `engine`, `automatization`, `test` y
  `template`, así que la prueba de razones repetidas no ve los informes; y la de rutas absolutas evalúa
  línea por línea, sin interacción entre archivos. No hay puerta que pueda ponerse roja por la
  combinación de dos informes que pasaron por separado.
- O sea que **la conducta actual es la deseable para esta tanda y la indeseable para una release**, y una
  sola expresión decide las dos. Separarlas por evento es probablemente lo correcto, y es más código.
- Lo que se pierde hoy no es cobertura sino **atribución**: si el último merge se hubiera puesto rojo, no
  habría forma de saber cuál de los veinte lo rompió. Con cambios en directorios disjuntos eso es barato
  de averiguar a mano; con cambios que se tocan, es una tarde de bisect.

## Contexto de descubrimiento

Mergeando los veinte PR de la tanda del 2026-09-07. La pregunta que lo destapó fue por qué algunos merges
«quedaban en cola» — que resultó ser otra cosa, y sin relación: los PR abiertos pasan a `UNKNOWN` mientras
GitHub recalcula su mergeabilidad cada vez que `main` avanza, y vuelven a `CLEAN` solos. Verificado en
vivo sobre los trece que quedaban.

## Cierre

**Resuelto en 0.72.0.** El recorrido de lo que enumeró:

- **El experimento que el caso pedía se hizo, con los dos brazos y no uno.** Una rama de descarte, un
  workflow con el mismo bloque `concurrency`, y tandas de pushes a diez segundos. El primer brazo
  reprodujo el defecto —cinco corridas, tres canceladas, la primera y la última vivas—; el segundo, con
  el grupo por commit, terminó las cuatro en verde y solapadas. Sin el segundo brazo no habría medición:
  reproducir el fallo no prueba que el arreglo lo cierre (R20).
- **La causa quedó establecida y no era la que el caso nombraba.** El título culpaba a
  `cancel-in-progress` y esa expresión funciona: la corrida **en curso** sobrevivió en las tres tandas
  del 2026-09-08. El caso, el archivo y el encabezado se corrigieron; los datos que traía eran correctos
  y se conservan.
- **Las dos formas de arreglo que el caso enumeraba no servían, y decirlo importa.** «Que la expresión
  funcione» y «partir el `concurrency` por evento» apuntan las dos a `cancel-in-progress`. La segunda
  incluso parecía la robusta —«no depende de cómo se evalúe una expresión»— y habría dejado el defecto
  intacto: el grupo habría seguido siendo uno solo para todo `main`.
- **La intermitencia dejó de ser un enigma y no hizo falta ninguna tanda de veinte.** Hacen falta
  **tres** corridas solapadas para que exista una pendiente que desalojar, y con dos nunca ocurre. El
  «contraejemplo» de las 22:50 —dos merges a once segundos, los dos en verde— no contradecía nada: eran
  dos.
- **Tradeoff «arreglarlo cuesta corridas» — se paga, y ahora se puede dimensionar.** Con el grupo por
  commit, una tanda de veinte merges corre las veinte suites en vez de cinco. El caso ya había
  establecido que ninguna de las quince canceladas podía encontrar algo que la corrida de su PR no
  hubiera encontrado; lo que se compra es la **atribución**, que era el otro tradeoff que enumeraba: si
  el merge número doce rompe `main`, ahora se sabe cuál fue.
- **Tradeoff «la conducta actual es la deseable para esta tanda y la indeseable para una release» — se
  resolvió sin elegir entre las dos.** No hacía falta separar por evento: separando el **grupo** por
  commit, cada corrida de `main` es su propia release en lo que a concurrencia respecta.
- **`cancel-in-progress` se queda, y ya no decide lo mismo.** En `main` el grupo tiene un solo miembro,
  así que no hay otro push que cancelar; lo que cuida es un `workflow_dispatch` lanzado sobre el commit
  de una release mientras su corrida va. Se dice en el comentario para que nadie lo lea como la línea que
  arregla esto.

**Lo que apareció y el enunciado no preveía:** el caso proponía montar el experimento «en un repositorio
de descarte». No hizo falta, y es mejor así — se hizo en **una rama** de este repositorio, que es donde
la pregunta vive: un repositorio distinto habría medido otro plan de Actions y otra cola. La rama y su
workflow se borraron al terminar.

**La prueba es de configuración y no de corrida, y eso es deliberado.** Ninguna corrida puede ver este
defecto: hacen falta tres pushes solapados para que exista una pendiente, y con dos siempre sale verde.
Por eso la invariante se fija en `test/repo/ci.test.js` —el grupo de `main` lleva el `sha`—, donde una
simplificación se ve en el diff en vez de esperar a la próxima tanda semanal. Mutación comprobada:
devolver el grupo a `ci-${{ github.ref }}` la pone en rojo.

## Relacionados

- Ninguno. El caso 052, del mismo día y también sobre CI, es un defecto distinto y sin relación.
