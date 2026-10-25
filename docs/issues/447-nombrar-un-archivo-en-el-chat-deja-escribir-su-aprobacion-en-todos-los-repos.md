---
caso: 447
titulo: Nombrar un archivo por su nombre en el chat deja al agente escribirse la aprobación de ese archivo en todos los repositorios
estado: resuelto
resuelto-en: 0.116.0
prioridad: media
version-detectada: 0.116.0
---

# 447 — Nombrar un archivo en el chat deja escribir su aprobación en todos los repos

**🟢 resuelto en 0.116.0** · detectado en 0.116.0 · prioridad **media** — sidecar con más de un repositorio, o con líneas de
trabajo; hace falta que la persona pida escribir la aprobación nombrando el archivo sólo por su nombre.

## Resumen

Desde el 445 una línea de `.ops-approval` nombra un archivo de un checkout, entera. Pero cuando la persona pide en el
chat que se agregue una aprobación nombrando el archivo por su nombre —«agregá package.json a .ops-approval»—,
`self-approval` deja que el agente se escriba **las rutas enteras de todos los repositorios** que tengan ese nombre:
compara cada línea contra el mensaje también por su basename. La persona nombró un archivo y el resultado aprueba
todos los que se llamen igual.

No es una regresión del 445: antes la misma frase dejaba escribir `package.json` relativo, que aprobaba todos. Es el
mismo cruce que el 445 cerró por archivo, ahora por la vía del chat.

## Reproducción

Sidecar con `api` y `web` (`node <cauce>/engine/cli/ops.js init ops --mode sidecar --runner claude --no-install`), una
sesión con el mensaje «agregá package.json a .ops-approval», y un Write del agente a `ops/planning/.ops-approval` con
las dos rutas enteras, pasado por `workspace-boundary` como lo llama el runner:

```bash
printf '{"hook_event_name":"UserPromptSubmit","session_id":"s","prompt":"agregá package.json a .ops-approval"}' \
  | OPS_ROOT="$WS/ops" CLAUDE_PROJECT_DIR="$WS" node <cauce>/engine/hooks/run.js chat
# luego un Write con contenido "$WS/api/package.json\n$WS/web/package.json\n" y session_id "s"
```

## Síntoma

Medido el 2026-10-25 con el motor de la rama del 445 y el 446:

```
== las dos rutas enteras
  → exit 0
== una ruta que no se nombró ($WS/api/pnpm-lock.yaml)
BLOQUEADO: …/ops/planning/.ops-approval es …
  → exit 2
```

## Causa raíz

- `engine/hooks/self-approval.js:135` — las líneas que no son un push se preguntan con `CHAT.authorized` y el criterio
  por defecto, que es `mentions`.
- `engine/hooks/chat.js:124` — `mentions` compara el ítem entero **y su basename** contra el mensaje. Para una ruta
  absoluta, el basename es lo único que una persona escribe, así que cualquier ruta con ese nombre cuenta como pedida.

## Fix propuesto

Que una línea de ruta entera cuente como pedida sólo si el mensaje la distingue de las otras que el agente escribe:
si el basename nombrado coincide con más de una línea nueva de repositorios distintos, frenar y mostrarlas, para que
la persona confirme cuáles. Es la forma más angosta y no toca cómo `mentions` sirve a los otros guards.

Alternativa: que `self-approval` compare el sufijo más largo que el mensaje nombre (`api/package.json`) en vez del
basename. Cuesta tocar `mentions`, que usan todos los guards con chat.

## Tradeoffs

- Una persona que de verdad quiere aprobar el archivo en todos los repositorios tendría que confirmarlo una vez más.
- Tocar `mentions` cambia qué cuenta como pedido en todos los guards; por eso la propuesta lo deja quieto.

## Contexto de descubrimiento

La revisión de código de la rama del 445 y el 446, el 2026-10-25, lo señaló leyendo `self-approval.js`; se midió con
el script de arriba antes de escribirlo.

## Relacionados

- 445 — la misma pregunta por archivo: una aprobación nombra un archivo de un checkout.
- 446 — lo mismo para los comandos y para lo concedido en el chat.
- 202 — por qué la persona puede pedirle al agente que escriba una línea permanente.

## Cierre

**Resuelto en 0.116.0**, en la misma rama y el mismo PR que el 445, el 446 y el 448. La decisión, del 2026-10-25,
fue la del fix propuesto: frenar y mostrar, no tocar `mentions`.

El caso, sección por sección:

- **Fix propuesto.** Se hizo distinto en un punto, con la razón. `self-approval.js` deja pasar una línea pedida por su
  nombre sólo si nada más se llama igual, o si el mensaje nombra un tramo de su lugar que lo demás no tiene
  (`api/package.json`, la ruta entera, «para api» en un comando con su lugar). Si no, frena con «lo que nombró
  coincide con más de un lugar», lista las líneas y las deja esperando el «dale». Lo distinto: el caso proponía
  comparar sólo contra las otras líneas nuevas. Así quedaban dos huecos: partir la escritura en dos, y una sola línea
  elegida por el agente. Por eso se compara también contra lo que el archivo ya aprueba y contra el mismo lugar en
  los otros checkouts (raíces, árboles de tarea y de línea). El segundo hueco lo encontró la prueba real, que se
  cuenta abajo.
- **La alternativa** (comparar el sufijo dentro de `mentions`): se decidió que no, porque cambia qué cuenta como pedido
  en todos los guards con chat. El sufijo se compara igual, pero sólo acá.
- **Tradeoffs.** El primero se aceptó: aprobar en todos cuesta un «sí» más. El segundo no aplica, porque `mentions`
  no se tocó.
- **Lo que el caso no preveía:** el mismo cruce valía para los comandos con su lugar. «agregá git clean -fd a
  .ops-approval» dejaba escribir `git clean -fd @ <repo>` para cada repositorio. Entra con la misma regla: el lugar
  de un comando se distingue nombrando su carpeta.

La prueba:

- `test/hooks/approval-chat-name.test.js`: tres pruebas, una por archivo, una por comando y una para el paquete de un
  monorepo declarado como raíz propia. Las dos primeras se vieron en rojo antes del arreglo («Missing expected
  exception» en la primera escritura). Después, en una copia, siete mutaciones dieron rojo: sin la comprobación, sin
  lo que ya está en el archivo, sin descartar el tramo compartido, sin distinguir nunca, sin los comandos, sin los
  otros checkouts y sin tomar el checkout más cercano. La tercera prueba la pidió la puerta de cobertura: ninguna
  pasaba por una ruta que cuelga de dos raíces.
- `npm run ci`: 1614 de 1614.
- **Prueba real** en el banco del 448, con el motor de la rama: sesiones de `claude -p` en una instancia con cinco
  `package.json` (`app`, `web`, `ops`, el árbol de la línea y una copia de QA).
  - Con la primera versión del arreglo, «agregá package.json a .ops-approval» terminó con el agente escribiendo una
    sola ruta, la del árbol, elegida por él, y el guard la dejó pasar. Eso llevó a sumar los otros checkouts.
  - Con la versión final, «agregá package.json a .ops-approval, el del commit de la tarea» frenó la escritura:

    ```
    …/ops/planning/.ops-approval es la aprobación de una persona, y lo que nombró coincide con más de un lugar:
      <banco>/lines/piloto/app/package.json
    Preguntale cuáles quiere aprobar. …
    ```

    El agente preguntó cuál. Con «sí» en la misma sesión la escritura pasó, con esa sola línea en el archivo.
  - Una vuelta intermedia no ejerció el arreglo. Ante «agregá package.json a .ops-approval» el agente preguntó solo,
    sin intentar escribir. Y la respuesta «el del commit de la tarea, elegilo vos» no nombraba `.ops-approval`, así
    que la frenó la regla de siempre, la de escribirse la aprobación sin que nadie la nombre.

Lo que el arreglo no cubre: compara sólo contra lo que el archivo aprueba y contra los checkouts que la instancia
conoce (sus raíces y sus árboles de tarea y de línea). Un clon que la instancia no declara no cuenta como «otro con el
mismo nombre»: la línea que lo nombre por su nombre pasa si es la única que hay.

**Medido después del cierre, el 2026-10-25**: el camino del diálogo nativo, que ninguna de las tres pruebas cubría.
Una cuarta prueba en `test/hooks/approval-chat-name.test.js` pide el diálogo de Claude Code (`permission_mode:
default`) con una sola ruta que otro checkout también tiene: el guard pregunta en el diálogo y muestra esa ruta. En
una copia, sin la comprobación, esa prueba dio rojo.
