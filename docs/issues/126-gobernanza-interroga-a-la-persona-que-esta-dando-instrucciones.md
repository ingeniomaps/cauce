---
caso: 126
titulo: Gobernanza frena a la persona que está dando instrucciones y le pide que pegue rutas a mano
estado: resuelto
resuelto-en: 0.85.0
prioridad: alta
version-detectada: 0.84.0
---

# 126 — El guard que contiene al agente estaba interrogando a la persona

**🟢 resuelto en 0.85.0**

## Resumen

`governance` frena un commit que toca reglas, ADR, `automatization/`, `engine/` o contratos de cargo, y para
destrabarlo pedía que la persona **nombrara cada ruta** en su mensaje, o contestara «dale», o pegara las
líneas en `planning/.ops-approval`. Con una persona dando instrucciones de trabajo, eso es una interrogación
por cada commit.

Dicho por el dueño del producto: «cuando le digo que trabaje, cada rato me está diciendo que agregue a mano
los archivos a modificar, y eso no debe pasar»; «no quiero sólo dale: si le estoy diciendo cualquier cosa de
que haga, no lo frene»; «no debería decirme qué pegar, yo no debería interactuar».

El principio que eso invoca ya estaba escrito: **los guards existen para contener al agente cuando trabaja
solo —dentro de una tarea, dentro de `autobuild`—, no para preguntarle a quien está conduciendo**. Y el
motor ya sabía distinguir los dos casos; `governance` simplemente no lo consultaba.

## Reproducción

Con el guard real, tres escenarios sobre el mismo commit de `planning/rules/process.md`:

```js
// A: sin persona en el chat   B: «segui trabajando»   C: «commiteá planning/rules/process.md»
execute('governance', { cwd: root, tool_input: { command: 'git commit -m x' } })
```

## Síntoma

```
A · sin persona en el chat
  El commit toca gobernanza protegida.
  Aprobalo pegando tal cual en planning/.ops-approval estas líneas:
    planning/rules/process.md          ← sólo esto; no ofrece «dale»

B · la persona dijo «segui trabajando»
  Decile a la persona qué se frenó… si contesta «dale», reintentá…
  Si prefiere aprobarlo a mano, que pegue ella tal cual en…
    planning/rules/process.md          ← la frena igual, y le lista rutas

C · la persona nombró la ruta
  PASA
```

El escenario **B** es el que se vive dando instrucciones: para trabajar hay que nombrar cada archivo o
aprobar commit por commit.

## Causa raíz

`engine/hooks/shell.js`, en `governance()`: todo el guard pasaba por `AP.pendingNow(...)`, que exige que el
ítem esté nombrado **en el mensaje en curso**. No había ninguna pregunta previa por quién originó la acción,
y el módulo de chat ni siquiera estaba importado en ese archivo.

El patrón que faltaba ya existía en el vecino: `engine/hooks/files.js:225` hace `if (CHAT.said(input)) return`
para eximir lo que la persona pidió en `plan-first`. `governance` nunca lo adoptó.

## Fix propuesto

```diff
 function governance(input) {
   if (process.env.OPS_GOVERNANCE_OVERRIDE === '1') return
   const command = commandOf(input)
   if (!isCommit(command)) return
+  if (CHAT.said(input)) return
```

`said` devuelve nada para un subagente (`agent_id`), para un recorrido de Cauce y en CI, así que la exención
**no** alcanza a ninguno de esos: el guard sigue conteniendo al agente exactamente donde importa.

## Tradeoffs

- **Durante una sesión conducida por una persona, `governance` deja de mirar qué toca cada commit.** Es
  deliberado y es el pedido: quien conduce ya decidió. Lo que no cambia es que el agente trabajando solo
  —recorrido, subagente, CI— sigue frenado.
- **Esto convierte en intencional lo que el 119 midió como defecto.** Aquel caso encontró que «con otro
  mensaje en curso, un commit de gobernanza pasaba», y lo cerró haciendo que los tres gates preguntaran cada
  vez. Para `governance` esa pregunta ahora no existe cuando hay persona; para `verify` y `dependencies` la
  decisión del 119 **sigue en pie**, y la diferencia no es quién pidió el commit sino qué frena cada uno:
  esos dos frenan por un defecto de hecho —una verificación que falla, un manifiesto sin su lockfile— y
  callarlos porque hay alguien hablando sería tapar un rojo.
- **`OPS_GOVERNANCE_OVERRIDE` sigue existiendo** y no se tocó: es la vía para el caso sin persona.

## Prioridad

**Alta.** Es fricción que el dueño encontró repetidamente en trabajo corriente, y del tipo que hace que la
herramienta se perciba como un estorbo en vez de una ayuda.

## Contexto de descubrimiento

Lo levantó el dueño el 2026-09-12, mientras se publicaba 0.84.0. Es la segunda mitad de la misma queja que
originó el **124**: allá eran siete guards sin ninguna salida; acá es un guard que sí tiene salida pero la
cobra en cada commit.

## Relacionados

- **124** — la primera mitad: los guards que no ofrecían ninguna salida.
- **119** — decidió que los tres gates preguntaran cada vez; esta caso revierte esa decisión **sólo** para
  `governance`, y dice por qué los otros dos se quedan como están.
- **117** — la otra cara: registrar una autorización ya dada con alcance declarado.

## Cierre

**🟢 resuelto en 0.85.0** · `engine/hooks/shell.js`, `test/wiring/hooks.test.js`

### Contra lo que el caso enumeró

**El fix propuesto** — hecho tal cual, y ubicado antes de leer el índice: la guarda va después de
`isCommit`, así que en el caso corriente el guard ni siquiera paga el `git` que lista lo staged.

**La exención no alcanza al agente** — comprobado con aserciones propias: sin persona frena, y con un
`agent_id` en la llamada frena aunque la persona haya nombrado la ruta.

**Tradeoff «deja de mirar qué toca cada commit con una persona conduciendo»** — asumido; es el pedido.

**Tradeoff «convierte en intencional lo que el 119 midió»** — dicho donde se decide, en el comentario del
guard y en el de la prueba, para que quien lea cualquiera de los dos encuentre por qué `verify` y
`dependencies` no llevan la misma exención.

**Tradeoff «`OPS_GOVERNANCE_OVERRIDE` sigue existiendo»** — se cumple: no se tocó.

### Lo que apareció y el caso no preveía

**Había una prueba que aseveraba lo contrario**, la del 119: «lo concedido no abre un gate de commit: los
tres preguntan cada vez». Se cambió sólo su fila de gobernanza y se le corrigió el nombre, que ya no
describía lo que mide. Es la misma clase de contrato cruzado que hizo fallar CI entre el 114 y el 116, y
por eso se buscó antes de tocar el motor en vez de dejar que la puerta lo encontrara.

### Qué se corrió

- **Rojo previo**: con la prueba pidiendo el contrato nuevo y el motor sin tocar —`tests 98, pass 97,
  fail 1`—, `Got unwanted exception: governance: seguí con la tarea` en `hooks.test.js:2419`. O sea: el
  guard frenaba exactamente lo que la persona había pedido.
- **Verde**: 98 de 98 en la suite de wiring; `npm run ci` y `npm test` en 0, **767 de 767**. Que la puerta
  entera no se moviera importa acá más que de costumbre: `shell.js` lo usan todos los guards de comando.
- **Mutación** (en copia desechable, R23): quitar `if (CHAT.said(input)) return` —`0` ocurrencias restantes
  en el archivo— pone la prueba en rojo. Sin eso, el verde sólo diría que la prueba corre.
- **La prueba lleva las dos mitades**: que con persona no frene diga lo que diga el mensaje —incluido
  «gracias», que no pide nada—, y que **sin** persona y **con subagente** siga frenando. Sin la segunda, una
  exención general daría el mismo verde.
