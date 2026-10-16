---
caso: 377
titulo: el escriba commitea el estado de planning sin el scope del proyecto
estado: resuelto
resuelto-en: 0.109.0
prioridad: baja
version-detectada: 0.106.1
---

# 377 — Dentro de una misma corrida, el escriba usa `docs(planning):` en unos commits de estado y `docs:` sin scope en otros, aunque la regla del proyecto fija el scope

**🟢 resuelto en 0.109.0** · detectado en 0.106.1 · prioridad **baja**.

## Resumen

La regla P1 de la instancia (`planning/rules/commits-and-release.md`) fija que el estado de planning en
`acme-ops` se commitea con scope `planning`. El agente `cauce-scribe` lo aplica en unos commits de una
corrida y en otros no, sin que cambie nada entre unos y otros: la regla le llega igual a todos.

## Reproducción

`git log --format='%h %s'` en `acme-ops`, sobre los commits de la corrida `wf_1412ea67-dd0`:

```
f973ebd docs: block cuenta-sesion-altas-de-investigacion-y-retiro-del-puente
708fa35 docs(planning): close cuenta-sesion-alta-de-integraciones
566a316 docs: close cuenta-sesion-altas-de-precios-y-catalogo-con-sesion
6e5edfe docs(planning): close cuenta-sesion-resolutores-traen-la-cuenta
04ecace docs(planning): close cuenta-acceso-canal-explicito
```

## Síntoma

Dos de cinco commits de estado sin scope, uno de ellos un cierre igual a los otros tres. No rompe nada, pero
el historial deja de poder filtrarse por scope, y la regla del proyecto se cumple a medias sin que nada lo
avise.

## Causa raíz

Localizada el 2026-10-14 leyendo `automatization/workflows/autobuild.js`. El recorrido **sí dicta el asunto
entero, con scope**: `"chore(planning): close ${task.id}"` en el commit del cierre (`scribeCommit`, junto a
`phase('Done')`), `"chore(planning): block ${slug}"` en el de una parada (`commitBlocked`), y lo mismo para la
reparación del cierre y el checkpoint. No hay ninguna plantilla `docs: close` en el motor: la hipótesis con la
que se abrió este caso era falsa.

Lo que pasa es otra cosa. Desde el caso 302 el commit de estado lo hace `cauce-scribe`, que carga las reglas
del proyecto, justamente para que una regla de la empresa pueda cambiar lo que el recorrido dicta —ahí fue el
idioma del asunto—. En esta instancia la regla P1 pide tipo `docs`, así que el escriba reescribe
`chore(planning)` a `docs(planning)`, y al reescribir a veces se lleva el scope puesto. Los cinco commits son
la misma consigna aplicada por un agente cinco veces: tres conservaron el scope y dos no. Nada lo comprueba
después, y no puede: el motor no declara cuál es el scope de planning de un proyecto.

## Fix propuesto

Que la consigna del escriba separe lo que una regla puede cambiar de lo que no: «el tipo y el idioma los fija
la regla del proyecto si la hay; el scope `planning` y el slug se conservan tal cual». Es una línea en los
prompts que dictan `chore(planning): …`, con una prueba de arnés que la asierta en cada uno. No arregla la
varianza del agente —nada lo hace—, pero le quita la ambigüedad de qué parte del asunto era suya.

Lo que no conviene es un guard: compararía el scope contra un valor que el proyecto no declara en ningún
lado, y declararlo es una configuración nueva para un defecto cosmético.

## Qué podría salir mal

- Una empresa cuya regla cambie también el scope —`docs(ops):`— la vería ignorada por la consigna nueva. Hoy
  ninguna lo pide; si aparece, la consigna dice «salvo que la regla fije otro scope».
- Es una línea de prompt: lo que mide si se cumple es una corrida real, no el arnés, que sólo ve que se pidió.

## Contexto de descubrimiento

Instancia sidecar `acme-ops`, 2026-10-14, revisando el historial de la corrida.

## Relacionados

- [302](./302-el-commit-de-planning-ignora-el-idioma-en-que-commitea-la-empresa.md) — de donde
  sale que el escriba reescriba lo dictado con la regla de la empresa; este caso es lo que esa decisión deja
  sin fijar.
- [376](./376-partir-una-tarea-deja-a-quien-dependia-de-ella-apuntando-a-un-slug-que-ya-no-existe.md) y
  [378](./378-el-plan-sigue-con-la-aceptacion-vieja-despues-de-que-la-corrida-la-corrigio.md) — misma corrida.

## Cierre

**Resuelto en 0.109.0, con el arreglo que el caso proponía y sin nombrar el idioma.** Las plantillas siguen donde la
causa raíz las ubicó: `chore(planning)` en el commit de una parada, en el del cierre, en la reparación del cierre y
en los dos del checkpoint. Todas pasan por uno de dos lugares, `scribeCommit` o el `committing` del checkpoint, y la
línea nueva va en esos dos y no en cada pedido: lo que se agregue después pasa por el mismo lugar y la lleva. Dice que
el scope `planning` y el slug se conservan tal cual si las reglas del proyecto cambian el asunto, salvo que la regla
fije otro scope. No dice que «el tipo y el idioma los fija la regla», como proponía el caso: una prueba del 302 exige
que ningún pedido de commit nombre el idioma, porque eso es de la regla, y la frase lo habría nombrado.

**Lo que se corrió para saber que funciona.**

- Arnés, `test/workflows/autobuild-claim.test.js`, «todo commit de planning conserva el scope y el slug aunque la
  regla cambie el asunto»: recorre todo pedido que dicta un `chore(planning)` y exige la línea. Con el `autobuild.js`
  de `main` falla en `Done|planning-commit`. Dos mutaciones en una copia del árbol, las dos en rojo: sin la línea en
  `scribeCommit`, rojo en `Done|planning-commit`; sin la línea en el checkpoint, rojo en `Closing|human-checkpoint`.
- **Corrida real del pedido de commit de una parada.** El prompt volcado desde el arnés se corrió con `claude -p` el
  2026-10-16, seis veces, cada una sobre su copia de un banco `tarea` fuera del repositorio. Cada copia tenía un
  `CLAUDE.md` con una regla como la P1 de la instancia, «todo commit que sólo toca `planning/` usa el tipo `docs`», y
  un cambio de planning sin commitear.
  - Las tres corridas con la consigna nueva commitearon `docs(planning): block tarea-medida`: aplicaron la regla y
    conservaron el scope.
  - Cada corrida costó entre USD 0,25 y 0,31.
- **Lo que esa prueba no muestra:** las tres corridas de control, con la consigna de `main`, también commitearon
  `docs(planning): block tarea-medida`. La instancia perdió el scope en dos de cinco commits con mucho más contexto, y
  en el banco no se reprodujo. Lo que queda probado es que la consigna nueva llega a todo commit de planning y que un
  agente real la cumple aplicando a la vez la regla de la empresa. Que baje la varianza que se vio en la instancia no
  está probado: lo mide una corrida real larga, como el propio caso decía en «Qué podría salir mal».

- **Y en `/autobuild` real** (ver el cierre del 383, que lo corrió con una regla equivalente de la empresa). Los tres
  commits de planning de esas corridas conservaron el scope aplicando la regla:
  - `docs(planning): await governance approval for prueba-de-humo`, de una parada;
  - `docs(planning): close prueba-de-humo`, del cierre;
  - `docs(planning): await review of humo`, del checkpoint.
  Son tres caminos distintos, y el último pasa por `committing`, el segundo lugar donde va la línea.

**Recorrido de lo que el caso enumeraba.**

- **Una línea en los prompts que dictan `chore(planning)` — se hizo distinto**: en los dos lugares por los que pasan
  todos, y sin nombrar el tipo ni el idioma.
- **Una prueba de arnés que la asierte en cada uno — se hizo** como un recorrido de todos los pedidos que dictan el
  asunto, no una lista de etiquetas. Un pedido nuevo que dicte `chore(planning)` sin la línea la pone en rojo.
- **No un guard — se decidió que no**, por la razón del caso: el motor no declara cuál es el scope de planning de un
  proyecto.
- **«Una empresa cuya regla cambie también el scope» — se hizo**: la línea dice «salvo que la regla fije otro scope».

