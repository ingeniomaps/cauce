---
caso: 284
titulo: con Codex y Gemini autobuild commitea en la rama viva
estado: resuelto
resuelto-en: 0.103.0
prioridad: alta
version-detectada: 0.101.0
---

# 284 — Fuera de Claude Code, nada impide que una tarea se commitee en `main`

**🟢 resuelto en 0.103.0** · detectado en 0.101.0 · prioridad **alta**.

**Prioridad alta**: es un freno que la documentación da por puesto y que, con dos de los cuatro runners, no
existe. El commit queda en la rama viva del producto y en la de la instancia.

## Resumen

Que un commit no cae en la rama viva sin pedirlo lo sostiene el recorrido de Claude, que corta la rama antes
de commitear (casos 251 y 266). A Codex, Gemini y Antigravity `autobuild` les llega como una skill que remite
al protocolo, y la regla es un párrafo de `AGENTS.md`.

## Reproducción

Instancia sidecar con el producto en `main` y una tarea `lite` en cola. Una sesión real por runner:

```bash
codex exec '$autobuild'
gemini -p "/cauce:autobuild"
```

## Síntoma

Las dos cerraron la tarea. Después, con Codex:

```
--- app:   * main 2eb0113 feat: add subtraction helper
--- ops:   * main 819876a chore: close subtraction task
```

Con Gemini, igual: `feat: add subtraction function and tests` en `main` del producto y `docs(planning):
complete resta-dos-numeros task` en `main` de la instancia.

## Causa raíz

No hay ningún guard que mire en qué rama cae un commit: `engine/hooks/run.js`, el grupo `pre-shell`, frena
por lo que se commitea —gobernanza, dependencias, la suite en rojo— y nunca por dónde. La regla vive en
`automatization/workflows/autobuild.js`, que sólo corre Claude Code.

## Fix propuesto

Un guard que frene el commit sobre una rama viva en un repositorio de la sesión, con un mensaje que diga qué
hacer sin preguntarle a nadie: cortar una rama y reintentar. Que pase con `runner.commitToLiveBranch` o con
una orden de la persona que nombre la rama.

Vale la pena mirar si le estorba al recorrido de Claude, que ya corta la rama por su cuenta.

## Tradeoffs

- Quien trabaja en `main` a propósito tiene que declararlo una vez, o pedirlo nombrando la rama.
- «Commiteá» a secas deja de alcanzar para la rama viva. Es lo que la regla pide, y es un cambio para quien
  se había acostumbrado a lo contrario.
- La rama después del comando se lee del texto: un `git switch` hacia una rama viva escrito de una forma que
  no se reconozca pasa sin frenar.

## Contexto de descubrimiento

Probando la 0.101.0 en los otros runners. Con Claude la regla se había comprobado en corridas reales; con los
demás nunca se había corrido una tarea entera.

## Relacionados

- 251 — el paso de Commit no corta rama.
- 266 — el estado de planning, en una rama de trabajo.
- 258 — un guard de commit no opina sobre un repositorio ajeno.

## Cierre

**Resuelto en 0.103.0.**

### El recorrido de lo que este caso enumeró

- **Fix — se hizo.** No opina tampoco sobre un repositorio sin commits, con el HEAD suelto ni en CI; el
  porqué de cada uno está en el encabezado de `engine/hooks/live-commit.js`.
- **«Vale la pena mirar si le estorba al recorrido de Claude» — se miró con una corrida real y no.** Un
  `/autobuild` entero en `auto`: ningún subagente recibió el bloqueo y no apareció ningún diálogo.
- **Tradeoffs — se pagan los tres**, y el primero va en el CHANGELOG con qué hacer.

### Lo que el caso no preveía

- La primera versión reconocía la orden por un verbo de commitear. La regla del repositorio que prohíbe
  decidir con una lista de palabras permitidas llegó el mismo día, así que se quitó antes de publicar: alcanza
  con que el mensaje nombre la rama, y sólo frena la frase que la niega o el mensaje que pregunta. «Dejalo en
  main» pasa; «a main no» y «¿lo commiteo en main?», no.

### Qué se corrió

- **Codex, `$autobuild` entero sobre el motor arreglado**: el guard frenó el commit del producto una vez y la
  sesión cortó `feat/resta-dos-numeros` y commiteó ahí; `main` quedó en su commit. En la instancia pasó a
  `work/planning` y stageó el cierre. La sesión se cortó ahí por el límite de uso de la cuenta, así que el
  commit de planning con Codex no se vio.
- **Gemini y Antigravity, sesión real con los comandos en una lista**: el commit en `main` devolvió el
  bloqueo, `git switch -c` corrió, y el mismo commit en la rama pasó —en Antigravity lo frenó después la
  suite en rojo, que es el guard que seguía—. Gemini no se probó con una tarea entera: sin interfaz avanzó
  un paso por invocación y no llegó al commit.
- **Claude Code, `/autobuild` entero en `auto`**: producto en `feat/resta-dos-numeros`, planning en
  `work/planning`, `main` intacto en los dos, `ops check planning` en verde.
- **Trece mutaciones en rojo**, en una copia, cuatro de ellas sobre la lectura del chat. La de «juzga al repositorio ajeno» sobrevivió la primera vez:
  el ajeno de la prueba no tenía commits y pasaba por esa otra excepción. Con un commit hecho, quedó en rojo.
- **La puerta entera**, `npm run ci`.

### La orden por chat, en una sesión real, el 2026-10-06

Tres pedidos directos en una sesión de Claude Code, con el producto parado en `main`. «Commitealo», a secas:
el commit quedó en una rama nueva. «Dejalo commiteado en main»: el commit entró en `main`, que es el guard
dejando pasar lo que la persona nombró. «Commitealo; a main no»: otra rama. En el primero y el tercero el
agente cortó la rama por su cuenta, leyendo las instrucciones de la instancia, y el guard no llegó a frenar;
el freno se había visto actuar con Codex, Gemini y Antigravity.
