---
caso: 400
titulo: cuando un guard frena el commit del autobuild, el reintento puede tomar el archivo de mensaje de una tarea anterior
estado: resuelto
resuelto-en: 0.112.0
prioridad: media
version-detectada: 0.111.0
---

# 400 — La fase Commit no ata el mensaje a la tarea: si el primer intento se frena antes de escribir el archivo del mensaje, el `git commit -F` del reintento usa el que dejó otra tarea

**🟢 resuelto en 0.112.0** · detectado en una instancia el 2026-10-01 y vigente en 0.111.0 · prioridad **media**. El commit sale con el asunto
y el `Task:` de otra tarea, y sólo se corrige reescribiendo un commit que ya está en la rama.

## Resumen

El prompt de la fase Commit pide «un solo Conventional Commit con el footer `Task: <id>`» y, desde el caso 299,
stagear y commitear en dos comandos (`TWO_COMMANDS`). No dice dónde se escribe el mensaje. El agente lo escribe en
un archivo del scratchpad y commitea con `git commit -F <archivo>`. Si el comando que escribe el archivo y commitea
es uno solo y un guard lo frena antes de correr, el archivo no se escribe; el reintento corre `git commit -F` sobre
el mismo nombre, que todavía tiene el mensaje de la tarea anterior.

## Reproducción

Registrada en una instancia real el 2026-10-01: pasó dos veces seguidas, y los dos commits (`b321746` y `52eb06b`)
se corrigieron con amend, con permiso. Se lee en el INBOX de esa instancia como
`[<instancia>][commit-con-mensaje-viejo]`, archivado el 2026-10-19 al pasar a este caso.

No se reprodujo en esta corrida: pide un autobuild entero.

## Causa raíz

`automatization/workflows/autobuild.js:2119-2127` (0.111.0) arma el prompt de Commit con `Task: ${task.id}` y
`TWO_COMMANDS` (`:373-374`), pero no fija el archivo del mensaje ni pide comprobarlo antes de `-F`.

## Fix propuesto

Que el prompt pida escribir el mensaje en un archivo con el id de la tarea en el nombre
(`<scratchpad>/commit-<id>.txt`) y comprobar antes de `git commit -F` que su última línea de pie dice
`Task: <id>`. Alternativa sin archivo: pedir el mensaje con un heredoc en el mismo `git commit`, que no deja nada
viejo en el disco.

**Alternativa de mecanismo**, que no depende de que el agente siga el prompt: que el guard del commit compare el
pie `Task:` del mensaje con la tarea del WIP de quien commitea, y frene si no coinciden. Hoy ningún guard lo mira
(`grep -rn "Task:" engine/hooks/` no devuelve nada en 0.111.0). Frena en la dirección segura y se comprueba sin
interpretar: es un id contra otro id. El mensaje que llega por `-F` se lee del archivo antes de que el comando corra.

La aceptación pide la mutación: una prueba del prompt que busca el nombre con el id; sin él, falla. Si va el guard,
con la comparación quitada la prueba que commitea con el `Task:` de otra tarea pasa y falla.

## Tradeoffs

- El heredoc es más simple, pero choca con guards que leen el mensaje desde el comando; el archivo con nombre propio
  no.

## Contexto de descubrimiento

Revisión mensual del INBOX de una instancia real, el 2026-10-19: la entrada seguía vigente contra 0.111.0.

## Relacionados

- 299 — por qué stagear y commitear van en dos comandos.

## Cierre

**Resuelto en 0.112.0.** El prompt de Commit (`automatization/workflows/autobuild.js`, `MESSAGE_OF`) suma: «Si
escribís el mensaje en un archivo, hacelo con el nombre commit-`<id>`.txt y, antes del commit, comprobá que su pie
diga "Task: `<id>`": un archivo de mensaje con otro nombre es de otra tarea.». Va sólo en el commit de la tarea, que es
el único cuyo mensaje escribe el agente: los commits de planning reciben el mensaje dictado en el prompt.

El enunciado, ítem por ítem:

- **Archivo con el id en el nombre y comprobar el pie antes de `-F`**: se hizo así. El nombre no lleva la ruta del
  scratchpad, porque esa carpeta es de cada runner y el workflow no la conoce.
- **Alternativa del heredoc**: no se impone, pero sigue siendo una salida válida: la instrucción empieza por «si
  escribís el mensaje en un archivo». El tradeoff del caso (que el heredoc choque con guards que leen el mensaje desde
  el comando) no se sostiene: `ai-signature` lee el cuerpo de un heredoc (`valueAt`, `engine/hooks/ai-signature.js`),
  y en la corrida real de abajo el agente commiteó con heredoc sin que nada lo frenara.
- **Alternativa de un guard que compare `Task:` con el WIP** (sumada al revisar el caso): se decidió que no. El guard
  tendría que encontrar el WIP de quien commitea, y esa resolución depende del árbol desde donde corre el proceso
  (caso 152): con sidecar, líneas o worktrees encontraría otro WIP y frenaría commits legítimos. El nombre con el id
  cierra la reproducción sin ese riesgo: lo que dejó otra tarea tiene otro nombre.
- **La mutación**: dos, abajo.

**Lo que se corrió para saber que funciona.**

- `test/workflows/autobuild-claim.test.js`, «el commit de la tarea ata el mensaje a su id, tarea por tarea»: en una
  corrida de dos tareas, el commit de T-1 nombra `commit-T-1.txt` y `Task: T-1`, el de T-2 nombra `commit-T-2.txt` y no
  lleva nada de T-1. Roja antes del cambio.
- Mutaciones en una copia fuera del árbol: con el nombre armado con otro valor que el id de la tarea, roja; sin la
  instrucción, roja.
- Real, con `claude -p` y el pedido de Commit tal como lo rinde el arnés (desde «Encontrá el repositorio», con las
  rutas reemplazadas por las del banco), sobre un repositorio en `/var/tmp` con un cambio sin stagear y un
  `commit-msg.txt` de otra tarea (`Task: T-0`) al lado, como el que deja una tarea anterior. Dos corridas, USD 0,24 y
  0,11: las dos commitearon en `feat/T-1` con `Task: T-1`. En la segunda, con los comandos registrados, el agente leyó
  el archivo viejo (`cat ../commit-msg.txt`), no lo usó, y commiteó con `git commit -m "$(cat <<'EOF' …)"`.

**El reintento después de un freno, probado aparte.** Ocho corridas más de `claude -p`, USD 0,93 en total, en un
banco de `/var/tmp`. Las condiciones fueron las del incidente:

- un hook `PreToolUse` propio frena el primer `git commit` de la corrida («frenó el comando entero. Repetí el
  commit.») y registra cada comando;
- al lado quedan `commit-msg.txt`, y en la primera tanda también `commit-T-0.txt`, los dos con `Task: T-0`;
- el pedido agrega que el mensaje vaya en un archivo con `git commit -F`;
- la corrida va con `--setting-sources project --disable-slash-commands`, para no cargar los skills ni las
  instrucciones de esta máquina.

Hubo dos tandas de cuatro: en la primera el agente elegía si escribir y commitear en comandos separados, y en la
segunda se le pidió hacerlo en el mismo comando, que es la forma del incidente.

- **Con el pedido de la rama (cuatro):** el primer commit se frenó en todas, y el reintento usó `commit-T-1.txt` y
  dejó `Task: T-1`. En la segunda tanda el agente además comprobó el pie antes de commitear, en el mismo comando:
  `tail -n1 ../commit-T-1.txt | grep -qx 'Task: T-1' && git commit -F ../commit-T-1.txt`.
- **Con el pedido de `main`, sin la frase (cuatro):** el defecto **no se reprodujo**. El agente puso por su cuenta el
  id en el nombre (`commit-T-1.txt`, `COMMIT_MSG_T-1.txt`, `commit-msg-T-1.txt`) o mandó el mensaje por stdin
  (`git commit -F - <<'EOF'`). Y al reintentar repitió el comando entero, archivo incluido, en vez de sólo el
  `git commit -F`. El `commit-msg.txt` viejo no se usó nunca.

Lo que eso dice: con el modelo y el runner de hoy, la conducta del incidente del 2026-10-01 no aparece en ocho
intentos, así que esta medición no distingue «el arreglo lo evita» de «esta vez no tocó». Lo que sí muestra es que el
arreglo se cumple bajo freno, y que fija por escrito lo que hoy el agente hace por su cuenta. No hay otra cosa que
medir con lo que hay acá: reproducirlo pediría el modelo y el runner de aquella corrida.

**Lo que encontró la revisión del conjunto, y se decidió que no**: la revisión propuso que el pedido nombrara dónde escribir
`commit-<id>.txt`, para que no quedara suelto en el repositorio. La prueba real de este caso ya midió dónde lo deja el agente:
en las cuatro corridas, en `../commit-T-1.txt`, fuera del repositorio. Nombrar un lugar cambia un pedido que se midió, y
habría que volver a medirlo sin que haya un defecto observado.
