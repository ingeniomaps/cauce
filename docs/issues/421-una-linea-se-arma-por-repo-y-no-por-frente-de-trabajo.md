---
caso: 421
titulo: una línea se arma por repositorio y no por frente de trabajo, así que un frente que vive en el repo de la principal se ve como otra copia de ese repo
estado: resuelto
resuelto-en: 0.113.0
prioridad: media
version-detectada: 0.112.0
---

# 421 — La línea de un frente nuevo que vive dentro del repo de la principal es, en disco, «otro checkout de ese repo»: la persona no reconoce el frente en lo que `ops line` arma

**🟢 resuelto en 0.113.0** · detectado en 0.112.0 · prioridad **media**. Es un caso de modelo, no un defecto de código.

## Resumen

`teamwork.md` (0.112.0, «Una línea de trabajo») define la línea como «un nombre y los repositorios del producto que
trabaja», y su comando exige al menos uno (`ops line <ops-root> <nombre> <repo>...`). Lo que se arma en disco es
`lines/<nombre>/<repo>/`, un worktree por repo (`engine/cli/lines.js:3`). El frente de trabajo —qué hitos lleva la línea—
vive aparte, en el `line:` de cada hito.

Cuando el frente nuevo vive dentro del mismo repo que la principal ya trabaja, lo único que la persona ve es un segundo
checkout de ese repo con el nombre del frente encima. Para ella eso es «la línea de plataforma», no «la línea del piloto»:
la estructura habla de repos y la decisión que tomó fue de trabajo. `teamwork.md` lo permite y lo dice («Dos líneas pueden
trabajar el mismo repositorio, cada una en su rama»), pero no explica por qué un frente se materializa como copias de
repos, ni qué hacer cuando el frente todavía no decidió en qué repo vive.

## Reproducción

El 2026-10-20 en una instancia sidecar (Cauce 0.112.0). La persona decidió llevar en paralelo dos frentes: la principal
(plataforma, épica 002) y un piloto nuevo (épica 003), cuyo arquitecto ubicó como módulo dentro de plataforma. Con
`node tools/ops.js line . piloto plataforma` quedó `lines/piloto/plataforma` en `line/piloto`. La persona lo rechazó:
«si vas a hacer la linea para plataforma entonces no es piloto no tiene sentido» y «se supone plataforma se toca en la
principal y la linea es para trabajar el piloto». No existe una forma de declarar la línea por su frente y dejar el repo
para cuando se decida, ni un aviso de que el frente comparte repo con la principal y va a mergear contra ella.

## Qué haría falta

- Decidir si una línea puede nacer **sin repos** (sólo nombre y hitos), y recibirlos cuando la primera tarea nombre su
  `service`. Hoy el repo es obligatorio en el comando.
- Si la línea comparte repo con la principal, que `ops line` lo diga en esos términos («esta línea trabaja `plataforma`,
  que también trabaja la principal: mismo repo, otra rama; los merges chocan») y no sólo el aviso genérico de choques.
- Que `teamwork.md` explique el modelo desde el frente: qué es la línea para la persona (un frente con sus hitos) y por
  qué en disco aparece como un árbol por repo.

## Cierre

**Resuelto en 0.113.0.** Lo decidió el dueño el 2026-10-21, cuando le pregunté si una línea podía nacer vacía o sólo con
lo que se va a hacer ya decidido: «yo creo que si». El frente se decide antes que el repositorio —acá la persona decidió
el piloto y el arquitecto lo ubicó después—, y si la línea sólo puede nacer con el repositorio, la planificación del
frente se hace en la sesión principal, que es lo que las líneas existen para separar.

El enunciado, ítem por ítem:

- **Que una línea pueda nacer sin repositorios y los reciba con la primera tarea**: se hizo. `ops line . piloto` declara
  `"lines": { "piloto": [] }` sin armar nada en disco —ni `lines/`, ni el `exclude`— y la salida dice que el árbol de
  cada repositorio se arma cuando una tarea lo pide. `check` la acepta (`engine/config/validate.js:106`). En
  `ops worktree --line` (`engine/cli/worktree.js:139`), si el repositorio de la tarea no es de la línea, o su árbol falta,
  se le suma con `assemble` —la misma función de `ops line`— y la salida lo dice. Antes ahí se negaba y mandaba a correr
  `ops line` a mano. Lo que `ops line` se niega a armar se niega igual, con su motivo. Mientras no tenga árbol, la
  sesión de una línea vacía escribe sólo en la instancia: lo garantiza el caso 422. La revisión del diff ajustó la suma:
  sólo con una tarea de la línea —con una ajena, el agente se ensanchaba dónde escribe—; con los avisos que `ops line`
  daría, y su código de salida; y con el nombre con que la carpeta de sesión ve un repositorio que alcanza por un enlace.
  Fuera de sidecar, donde no hay carpeta de sesión, se niega con el motivo de `ops line` y no con un error sin atrapar.
- **Que `ops line` avise en esos términos cuando la línea comparte repositorio con la principal**: se decidió que no. Con
  un solo repositorio de producto toda línea lo comparte con la principal, así que el aviso saldría siempre, y un aviso
  que sale siempre enseña a no leerlo. Que la rama de la línea llegue a la rama viva por PR, como cualquier otra, es el
  flujo normal. `teamwork.md` lo dice en esos términos: compartir el repositorio es lo normal, no un caso aparte.
- **Que `teamwork.md` explique el modelo desde el frente**: se hizo, y dice además que la línea puede nacer vacía y
  cómo recibe sus repositorios.

**Lo que se corrió para saber que funciona.**

- `test/planning/line-worktree.test.js`, «una línea vacía no arma nada, y la primera tarea que pide su árbol le suma el
  repositorio»: declara `{ piloto: [] }` sin `lines/` en disco, `check` no se queja de la línea, `ops worktree --line`
  suma `producto` con su árbol en `line/piloto`, y la segunda vez lo reusa. «con --line entrega el árbol de la línea»
  rearma un árbol borrado y propaga la negativa de `assemble`.
- Mutaciones en una copia fuera del árbol, todas en rojo: `check` que niega la lista vacía («y check la acepta»),
  `ops worktree` que no suma («Cannot read properties of undefined»), la línea vacía que no se declara («Expected values
  to be strictly deep-equal»), la línea vacía que deja `lines/` («una línea vacía no deja nada en disco») y el árbol
  borrado que no se rearma. Dos sobrevivieron la primera vez: la prueba miraba `stdout` y `check` escribe en `stderr`,
  y la otra era equivalente, porque el código tenía una condición de más, que salió.
- Sobre un banco `ops bench sidecar` con la sesión como raíz, `ops line . piloto` contestó «la línea piloto todavía no
  trabaja ningún repositorio…», y `check` dio «✓ planning válido». Después `ops worktree planning t-piloto --line
  piloto` contestó «✓ …/lines/piloto/app (line/piloto) · app se sumó a la línea piloto». En una sesión real de Claude Code
  sobre una copia de ese banco en `/var/tmp`, la misma salida la vio el agente.
