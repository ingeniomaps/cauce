---
caso: 370
titulo: el guard de límites no tiene salida por el chat
estado: resuelto
resuelto-en: 0.107.0
prioridad: media
version-detectada: 0.106.1
---

# 370 — Lo que una persona pide en el chat sobre una ruta de fuera de las raíces se frena igual: los dos guards de límites sólo ofrecen declarar la ruta, y desde 0.106.1 eso alcanza también a los borrados

**🟢 resuelto en 0.107.0** · detectado en 0.106.1 · prioridad **media**. **Decidido el 2026-10-10**: la confirmación
angosta —qué es, en la segunda revisión, abajo—, junto con el
[373](./373-el-agente-se-declara-solo-las-rutas-que-el-limite-le-frena.md).

**Prioridad media**: nada se rompe, y la salida que hay funciona. Lo que cuesta es fricción donde no
debería haberla: una persona pide algo puntual, el agente lo intenta, y la única forma de seguir es editar
la configuración del proyecto.

## Resumen

Los dos guards de límites —el de la herramienta de archivos y el de shell— frenan lo que cae fuera de las
raíces declaradas y dicen cómo seguir: declarar la ruta en `writableOutsideRoots`. No miran si la persona lo
pidió. Casi todos los demás guards sí: lo que alguien pide en el chat queda aprobado para esa operación.

Hasta 0.106.0 el de shell frenaba escrituras. Desde 0.106.1 frena también borrados, y un borrado fuera del
proyecto es algo que una persona pide seguido y por una vez: liberar disco, limpiar una caché.

## Reproducción

No se corrió una sesión nueva para este caso: sale de dos comandos de sesiones reales, donde la persona
había pedido liberar disco y el agente corrió un `rm -rf ~/.config/<editor>/snapshots`. Con el guard de
0.106.1 y ese comando:

```bash
printf '{"cwd":"%s","tool_name":"Bash","tool_input":{"command":"rm -rf ~/.config/<editor>/snapshots"}}' "$PWD" \
  | CLAUDE_PROJECT_DIR="$PWD" ops/automatization/hooks/guard-shell.sh
```

## Síntoma

```
BLOQUEADO: el comando borra $HOME/.config/<editor>/snapshots, fuera de las raíces declaradas en
ops.config.json. Si el proyecto necesita escribir ahí, declaralo en writableOutsideRoots de ops.config.json,
o de ops.config.local.json si la ruta es sólo de esta máquina; cambiar de herramienta no lo autoriza.
```

Medido al cerrar el 365, sobre los comandos de shell de las sesiones reales de cinco proyectos: de los 43
que el guard nuevo frena y el anterior no, dos son exactamente esto, un `rm -rf` de una caché en la carpeta
personal pedido en una limpieza de disco.

## Causa raíz

- `engine/hooks/input.js`, `DECLARE_IT` — el único texto de salida de los dos guards.
- `engine/hooks/files.js`, `workspaceBoundary`, y `engine/hooks/shell.js`, `shellBoundary` — bloquean con ese
  texto y no consultan ninguna aprobación. Los otros guards de esos mismos archivos arman su salida con
  `AP.HOW(…)`, que ofrece la aprobación; qué pidió la persona lo sabe `engine/hooks/chat.js`.
- El encabezado de `engine/hooks/approval.js` lo dice como criterio general: «Con una persona hablando, lo
  que ella pidió ya está aprobado».

## Fix propuesto

Es una decisión con dos salidas, y cambia qué puede hacer una sesión fuera del proyecto:

1. **Que los guards de límites acepten la aprobación por chat**, como los demás: lo que la persona pidió
   sobre una ruta de afuera pasa esa vez, sin tocar la configuración.
2. **Dejarlo como está y decirlo**: fuera de las raíces sólo se toca lo declarado, lo pida quien lo pida. Es
   más estricto que el resto de los guards, a propósito, porque lo de afuera no es del proyecto.

Si se elige la primera, falta decidir el alcance: si vale para borrar y para escribir, y si hay rutas que
ni así —la carpeta personal entera, que ya cuida `destructive`, o las raíces de otra instancia—.

## Valor

Con la primera salida, lo que una persona pide en el chat deja de chocar con un guard que existe para
contener al agente cuando trabaja solo. Con la segunda, queda escrito que el choque es deliberado.

## Qué podría salir mal

1. **Abrir de más.** Una aprobación por chat que alcance a cualquier ruta de afuera vuelve decorativo el
   límite en una sesión conversada. La aprobación de los otros guards es por operación y por ruta; acá
   tendría que serlo igual.
2. **Que la aprobación la arme el agente.** Los dos guards ya cuidan que el agente no se escriba su propia
   aprobación; esa defensa tiene que seguir en pie.
3. **Decidirlo con una lista de formas de pedir.** Qué quiso la persona lo lee el agente; un guard no decide
   por las palabras del mensaje.

## Revisión del 2026-10-10

Leído cómo funciona la aprobación que los otros guards ya ofrecen, para que la decisión se tome sobre lo que
hay y no sobre una idea.

**Qué existe** (`engine/hooks/approval.js` y `engine/hooks/chat.js`):

- Un guard pregunta `AP.pending(raíz, [ítems], input)`: qué queda sin aprobar de lo que está por frenar. Un
  ítem pasa por tres vías. Porque está escrito, tal cual, en `planning/.ops-approval`. Porque la persona
  **confirmó** un bloqueo anterior que lo nombraba —el guard lo deja anotado con `AP.HOW` y sólo frena la
  respuesta que niega, frena o pregunta—. O porque el mensaje en curso **lo pide nombrándolo**.
- La confirmación cubre los ítems exactos que se frenaron y sigue valiendo en los mensajes siguientes hasta
  que ella lo niegue. `check` muestra lo concedido en la sesión.
- Que el agente se escriba la aprobación ya lo frenan los dos guards de límites, con `self-approval`.

**Qué significa para las dos salidas del fix:**

- La primera es chica: los dos guards consultan `AP.pending` con la ruta resuelta y arman su salida con
  `AP.HOW`, como `migrations` o `test-evidence`. No agrega lectura nueva.
- **Tiene un riesgo propio que no tienen los otros guards**, y hay que decidirlo junto: la vía «lo pide
  nombrándolo» compara también **el nombre suelto** de la ruta (`mentions`, en `chat.js`). Para una
  migración o un `.env` eso es razonable. Para una ruta de fuera del proyecto no: «borrá `dist`» dicho
  sobre el proyecto autorizaría un `rm -rf` de `<otro proyecto>/dist`. El push ya tuvo este problema y lee
  su orden aparte (caso 103). Acá la salida segura es que la orden valga sólo si el mensaje trae **la ruta
  entera**, y que con el nombre suelto haga falta el bloqueo y la confirmación.
- Esa misma vía decide con una lista de verbos de pedir (`ASKS`), que las convenciones del repositorio
  marcan como deuda que no se amplía. Usarla tal cual no la amplía; dejar sólo la confirmación la evita.

**No se encontró una decisión anterior en contra.** Los casos que tocaron este límite —209, 269, 288— le
agregaron exenciones, y ninguno discute la aprobación: el guard nació sin ella y nadie lo había preguntado.

**Propuesta, para decidir**: la primera salida, angosta —confirmación de un bloqueo para la ruta exacta, y
orden sólo con la ruta entera—, para escribir y para borrar, dejando sin salida lo que `destructive` ya
cuida. Y el archivo de aprobación como vía de cuando no hay chat, igual que en el resto.

## Segunda revisión del 2026-10-10 — cuál de las salidas es más segura

Medido antes de decidir, y cambia la propuesta de arriba en dos puntos.

**La salida «estricta» no lo es: el agente se la sirve solo.** En un banco `suelto`, preguntándoles a los
guards sin ejecutar nada:

```
FRENA   rm -rf ~/.config/<editor>/snapshots
pasa    Write ops.config.json        con writableOutsideRoots ["~/.config/<editor>/snapshots"]
pasa    Write ops.config.json        con writableOutsideRoots ["~"]
pasa    Write ops.config.json        con writableOutsideRoots ["/"]
pasa    Write ops.config.local.json  con writableOutsideRoots ["~"]
--- con esa última línea en disco ---
pasa    rm -rf ~/.config/<editor>/snapshots      pasa    rm -rf ~/.ssh
pasa    rm -rf ~/Code/<otro proyecto>            pasa    rm ~/.aws/credentials
pasa    echo x > ~/.bashrc                       FRENA   rm -rf ~     (lo cuida `destructive`)
```

Es deliberado y está escrito: `ops-config` protege las dos llaves del push y nada más, para que el agente
pueda tomar la salida que el límite le indica (caso 090). Lo que nadie había medido es qué alcance tiene:
la declaración es por prefijo, vale para escribir y para borrar, no caduca, alcanza a los subagentes y a las
corridas sin persona, y no la confirma nadie. `check` la muestra después.

Y se usa. Sobre las sesiones reales de cuatro proyectos, 129 bloqueos de este límite: en al menos 6 lo que
siguió, sin ningún mensaje de la persona en el medio, fue el agente declarando la ruta; en 2 paró y le habló
a la persona. En los seis, lo frenado era un archivo y lo declarado fue su carpeta. El conteo es por
heurística —las llamadas que siguen al bloqueo— y no dice si la persona lo había pedido antes en la sesión.

**La orden por el chat no sirve para este guard, ni con la ruta entera.** Con el canal tal como está:

```
AUTORIZA  «borrá dist»                                   -> rm -rf <otro proyecto>/dist
AUTORIZA  «revisá el credentials y decime si está bien»  -> rm ~/.aws/credentials
AUTORIZA  «mirá <ruta entera> y decime cuánto pesa»      -> rm -rf <esa ruta>
frena     «borrá ~/.cache/ab»                            -> el pedido real, con un nombre de dos letras
```

Las dos primeras son el nombre suelto, que la primera revisión ya marcaba. La tercera es nueva y descarta
la variante «orden sólo con la ruta entera»: la lista de verbos dice que la frase pide algo, no **qué**
pide, así que un pedido de mirar autoriza un borrado. En los otros guards ese error cuesta un archivo que
git devuelve; acá lo borrado no vuelve (R23).

**La confirmación sí, con tres condiciones que hoy no tendría:**

```
frena     antes de preguntar
AUTORIZA  «dale» tras el bloqueo que nombraba esa ruta       frena  otra ruta que no se frenó
AUTORIZA  dos mensajes después, la misma ruta (heredada)     frena  lo mismo sin heredar
AUTORIZA  «ok, seguí con lo otro» sobre un bloqueo pendiente frena  «¿qué es eso?»
AUTORIZA  borrado de una ruta cuya **lectura** se aprobó     frena  el mismo, con el ítem «borra <ruta>»
```

1. **El ítem lleva el verbo** —`borra <ruta>`, `escribe <ruta>`—, con la ruta ya resuelta. La ruta sola
   comparte nombre con lo que aprueban los otros guards: una credencial cuya lectura se dejó aprobada para
   siempre (caso 202) quedaría también aprobada para borrarla.
2. **Sin heredar**, como los gates de commit: vale en el turno de la respuesta. Lo que hay en una ruta
   cambia, y un borrado que se repite después no es el que la persona miró.
3. **Sin orden**: la única vía por chat es contestar el bloqueo, que es el que muestra el verbo y la ruta
   resuelta. Es R23 —el objetivo se lee resuelto antes de correrlo— hecho por la persona.

Lo que queda abierto con eso, y es del canal y no de este guard: un pendiente lo aprueba cualquier mensaje
que no niegue ni pregunte, así que un «seguí con lo otro» lo aprueba si el agente no lo mostró (caso 184).
En Claude Code no aplica —ahí confirma el diálogo del runner, con el motivo a la vista (caso 221)—; en
Codex y Gemini sí.

**Las tres salidas, comparadas por lo que dejan pasar sin que una persona lo vea:**

| | Hoy («estricto») | Confirmación angosta | Aprobación como los demás |
|---|---|---|---|
| Quién abre | el agente, solo | la persona, contestando | la persona, o una frase que lo nombra |
| Alcance | un prefijo, los dos verbos | un verbo y una ruta resuelta | una ruta, cualquier verbo |
| Dura | hasta que alguien lo borre | el turno | la sesión |
| Sin persona | pasa igual | no pasa | no pasa |

**Decidido**: la confirmación angosta, con sus tres condiciones. Que declarar una ruta deje de ser algo que
el agente hace solo es otro defecto, con otra vida, y salió como el caso 373. Van en la misma versión y
éste primero: el 373 usa esta confirmación, y sin él esto mejora la fricción y no la seguridad, porque la
vía ancha sigue al lado.

**Lo que hay que cuidar al construirlo:**

- **Lo que `destructive` cuida no se abre por acá.** Son dos guards y corren los dos; la prueba tiene que
  mostrar que un borrado de la carpeta personal confirmado para este guard sigue frenado por el otro.
- **El canal de aprobación sigue cerrado.** `self-approval` se juzga antes y aparte: confirmar
  `escribe <la aprobación>` no puede dejar escribirla.
- **Un comando con varias rutas afuera frena y anota todas juntas**, para que una sola respuesta las cubra;
  hoy corta en la primera.
- **El ítem es donde cae, no cómo está escrito**: si entre la pregunta y el reintento la ruta pasa a ser un
  enlace a otro lado, es otro ítem y vuelve a frenar.
- **Con un subagente o un recorrido no hay a quién preguntarle**: ahí el bloqueo vuelve a quien lo lanzó,
  como en los demás guards, y la línea en `planning/.ops-approval` es la vía sin chat.
- **La comparación de siempre**: el guard nuevo contra el de `main` sobre los comandos de las sesiones
  reales. Lo que frena no puede cambiar; lo único que cambia es qué dice el bloqueo y qué pasa después de
  una confirmación.

## Cierre

La salida vive en `engine/hooks/boundary.js`, `refusal`, y la usan los dos guards. Recorrido de lo que el caso
enumeraba, ítem por ítem:

- **Fix 1, aceptar la aprobación**: hecho, angosto. El ítem es `<verbo> <ruta resuelta>`; pasa por la
  confirmación del bloqueo, por el diálogo nativo de Claude Code o por la línea en `planning/.ops-approval`;
  no pasa por una orden del chat; no se hereda. `pendingNow` y `unauthorizedNow` reciben ahora qué cuenta
  como orden, y acá es nada.
- **Fix 2, dejarlo estricto y decirlo**: descartado por la segunda revisión, con medición.
- **Alcance**: vale para borrar y para escribir, con su verbo cada uno; la carpeta personal entera y lo que
  `destructive` cuida siguen sin salida, porque ese guard corre aparte y no mira esta aprobación.
- **Riesgo 1, abrir de más**: la aprobación es por verbo, ruta y turno; la prueba asercia que otra ruta, otro
  verbo sobre la misma ruta y el mensaje siguiente vuelven a frenar.
- **Riesgo 2, que el agente se arme la aprobación**: `self-approval` se juzga antes y aparte; la prueba
  confirma `escribe <la aprobación>` y la escritura sigue frenada. La otra vía por la que el agente se la
  arma solo —declarar la ruta— es el 373.
- **Riesgo 3, decidir con una lista de formas de pedir**: no se usa ninguna; la orden del chat quedó fuera
  por eso mismo.
- **Lo que había que cuidar al construirlo** (segunda revisión): los seis puntos tienen su aserción en
  `test/hooks/boundary-approval.test.js` —destructivo, canal de aprobación, varias rutas juntas, ítem donde
  cae, subagente, archivo sin chat—, y la comparación contra `main` está abajo.

**Prueba corrida.** `test/hooks/boundary-approval.test.js`, siete pruebas: las siete en rojo antes del cambio
—la primera con «The input did not match … /pedile que lo confirme con sus palabras/»— y en verde después,
con las 285 de `test/hooks/` y la puerta entera.

**Comparación contra `main`**, en sólo lectura, sobre las llamadas reales de las transcripciones de esta
máquina: 46.573 llamadas a Bash, Write y Edit, 44.096 con instancia resoluble. Frena `main` 209, frena el
árbol de trabajo 209, iguales 44.096, **distintas 0**. Lo que frena no cambió; sólo lo que dice el bloqueo.

**Mutaciones**, en una copia fuera del árbol, cuatro:

- la orden del chat admitida (`asked` por defecto) → rojo, «una orden del chat no abre nada»;
- heredar lo concedido (`AP.pending` en vez de `pendingNow`) → rojo, «por un turno»;
- el ítem sin verbo → rojo en cuatro pruebas, la primera porque `echo x > cache` pasaba tras confirmar el
  borrado;
- el ítem con la ruta escrita y no donde cae → rojo, «el ítem es donde cae».

**Lo que queda abierto y es del canal**, no de este guard: en Codex y Gemini un mensaje que no niega ni
pregunta aprueba lo pendiente aunque el agente no lo haya mostrado (caso 184). En Claude Code no aplica,
porque confirma el diálogo del runner con el motivo a la vista. La primera prueba del caso lo tuvo que rodear
—cada orden en una sesión propia— porque «mirá …» confirmaba lo que «borrá …» había dejado esperando.

## Sesiones reales

Sobre un banco `suelto` con los adaptadores instalados, el 2026-10-10, antes de empujar. Claude Code
(`claude -p`, sin nadie que conteste el diálogo): `rm -rf ~/<carpeta>/cache` frenó con el texto nuevo y la
línea `borra <ruta>` para pegar, y nada se borró. Gemini CLI: con el `rm -rf` se negó solo por R23 antes de
llamar a la herramienta —conducta del modelo, no del guard—; con `mkdir -p ~/<carpeta>/cache`, el guard frenó
con la salida por chat y la carpeta no se creó. Esa corrida mostró una frase falsa en el bloqueo —«sigue
valiendo en los mensajes siguientes», cuando acá vale el turno—, corregida con una variante del texto para los
guards que no heredan.

## Contexto de descubrimiento

Al medir el 365 sobre comandos reales: dos de los frenos nuevos eran una limpieza de disco pedida por la
persona. Se anotó en su cierre como fricción y quedó para decidir aparte.

## Relacionados

- [365](./365-el-guard-de-shell-no-ve-un-borrado-fuera-de-las-raices.md) — el que hizo que esto alcance a
  los borrados.
- [098](./098-una-orden-del-chat-no-llega-al-guard-y-el-agente-se-aprueba-solo.md) — cómo llega al guard lo
  que la persona pidió, y por qué el agente no puede aprobarse solo.
