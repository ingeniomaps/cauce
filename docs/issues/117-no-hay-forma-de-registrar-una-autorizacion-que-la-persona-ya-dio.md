---
caso: 117
titulo: No hay forma de registrar una autorización que la persona ya dio, ni de concederla con alcance
estado: abierto
prioridad: media
version-detectada: 0.81.0
---

# 117 — La aprobación existe en dos formas y falta la del medio: por operación, o por sesión entera

**🔴 abierto** · detectado en 0.81.0 · prioridad **media** —se mantiene el 2026-09-11 y lo que la sostiene
cambió, ver «Contra 0.83.0»— 0.83.0 sacó la fricción que caía sobre la persona, y dejó en su lugar una
exención por sesión sin alcance, sin procedencia y que `check` no muestra

## Resumen

Hoy autorizar algo tiene exactamente dos formas, y son los dos extremos:

| forma | alcance | quién la pone |
|---|---|---|
| `planning/.ops-approval` | **una operación**: vale para el conjunto que nombra y deja de valer en cuanto ese conjunto cambia | sólo una persona, a mano |
| `OPS_*_OVERRIDE=1` | **toda la sesión**, y el guard entero | una persona, en el entorno del runner |

Falta la del medio: **conceder una capacidad concreta, con alcance, sin apagar nada.** «Podés leer esta
identidad declarada mientras dure esta tarea» no se puede expresar.

Y hay un segundo hueco, que el operador nombró mejor de lo que estaba escrito: **una cosa es que el agente
se escriba la aprobación por iniciativa propia, y otra es que la persona diga «usá ese archivo» y el agente
lo registre.** 0.81 cerró las dos juntas — «El agente ya no puede escribirse la aprobación» — y la segunda
no era el problema.

## Reproducción

Instancia sidecar, 0.81.0.

1. Con el WIP activo, el agente intenta escribir `planning/.ops-approval` después de que el operador
   autorizó por chat, nombrando el archivo:

```
BLOQUEADO: …/planning/.ops-approval es la aprobación de una persona, y escribírsela es aprobarse solo.
Si la persona quiere autorizar algo, que lo diga en el chat —nombrándolo, o contestando «dale» al
bloqueo— o que edite el archivo ella.
```

   Las dos vías que ese mensaje ofrece son de chat, y en esa sesión el chat no destrababa (caso **118**),
   así que la única salida real era la edición manual.

2. Terminada la operación, el agente borra el archivo siguiendo la guía: `AGENTS.md` dice que «no se borra
   sola, así que un commit frenado por otra cosa no te obliga a rehacerla. `check` te avisa mientras exista,
   y **borrarla es parte de terminar**». La siguiente operación vuelve a frenarse, y la persona vuelve a
   pegar la misma línea.

En la sesión medida eso pasó con tres archivos distintos y el operador lo dijo así: «es muy feo estar
aprobando a cada rato cuando ya te di aprobacion».

## Síntoma

- **La fricción no cae sobre el agente, cae sobre la persona**, y es repetitiva: una línea por archivo, y
  otra vez después de cada limpieza.
- **La salida que queda a mano es la peor**: apagar el guard por sesión. Un permiso de grano fino que
  cuesta cinco mensajes se cambia por uno de grano grueso que cuesta uno.
- **El agente borra lo que la persona concedió.** La guía le pide limpiar «como parte de terminar», y no
  distingue una línea que él pidió para una operación de una que la persona dejó puesta a propósito.

## Causa raíz

`approval.read()` devuelve una lista de rutas y `pending()` compara contra ella
(`engine/hooks/approval.js:31-42`). No hay campo para alcance ni para procedencia: una línea es una ruta y
nada más. De ahí salen las tres consecuencias: no se puede decir «hasta cuándo», no se puede decir «quién
lo autorizó», y por lo tanto no se puede permitir que el agente escriba una línea sin que sea
indistinguible de aprobarse solo.

## Fix propuesto

**1. Procedencia en la línea, y que la escriba el hook que oyó a la persona.** No el agente: el propio
`guard-chat`, que ya corre sobre el mensaje. Con la marca de dónde salió:

```
/home/manuel/Code/venotal/platform/.env.bak   # vía chat, 2026-09-12, sesión 5c17daac
```

Así la garantía se mantiene —el agente no firma nada— y la fricción desaparece: la persona dice «usá ese
archivo» una vez y queda escrito, con su origen a la vista para quien audite después.

**2. Una concesión con alcance, aparte de la lista por operación.** Un archivo propio, que el agente no
escribe ni borra:

```
# planning/.ops-grants
<ruta>   <guard>         <alcance>
.env.infisical   secrets-shell   task:platform-rename
.env.bak         secrets-shell   session
```

`ops check` las lista en cada corrida —una exención que no se ve es un límite que ya no existe— y al
cerrar la tarea las de alcance `task:` caducan solas.

**3. Que la guía deje de pedirle al agente que borre lo que no escribió.** La regla correcta es: borra las
líneas que él pidió para una operación terminada; no toca las que tienen procedencia de chat ni las de
`.ops-grants`.

## Tradeoffs

- **Un permiso durable es, por definición, menos estricto que uno por operación.** Se compensa con dos
  cosas: alcance explícito y visibilidad en `check`. Lo que hoy pasa es peor que eso: el atajo real es
  apagar el guard por sesión, que no tiene ni alcance ni rastro.
- **La procedencia se puede falsificar si la escribe el proceso equivocado.** Por eso la escribe el hook
  del prompt y no el agente, y por eso conviene que la línea lleve la sesión: sin eso, «vía chat» es una
  afirmación que nadie puede contrastar.
- **Dos archivos en vez de uno** es superficie nueva. La alternativa —un campo de alcance en
  `.ops-approval`— mezcla lo efímero con lo durable en el mismo lugar, y es justo la distinción que este
  caso viene a hacer.

## Contexto de descubrimiento

Instancia real (sidecar, 0.81.0), 2026-09-11/12, armando el contrato de secretos de un proyecto con
Infisical. La observación que ordena el caso es del operador: «una cosa es yo decirte usa el archivo, que
eso ya es autorización y es suficiente para que tú escribas en el archivo, y otra cosa es que tú lo hagas
solo sin yo decirte usa el archivo».

## Contra 0.83.0

Medido el 2026-09-11 sobre el código de hoy —0.82.0 publicada, 0.83.0 lista y sin publicar—, en un banco
sidecar. **Es una medición, no un cierre: el caso sigue abierto.** 0.83.0 agregó, por el **116**, que lo
que un guard deja pasar quede anotado y se herede mensaje a mensaje. Eso toca los tres puntos de «Fix
propuesto» y no cierra ninguno.

- **Punto 1, «una concesión con alcance, sin apagar nada» — sigue vivo.** Lo que se agregó es `granted`,
  un array plano de rutas en el registro de la sesión (`engine/hooks/chat.js:136` lo hereda,
  `engine/hooks/chat.js:173-178` lo escribe). No tiene alcance declarado por la persona, no tiene
  procedencia, no caduca salvo con la sesión o con una negación, y **no se ve**: `ops check` no dice nada
  de lo concedido, mientras que por una sola línea en `.ops-approval` avisa «N ruta(s) aprobadas y sin
  borrar; el archivo sigue autorizándolas» (`engine/cli/planning.js:183`). O sea que la exención durable
  que este caso pedía existe a medias y del lado que no se audita. Lo que 0.83.0 sí hizo fue sacar la
  fricción que volvía urgente al caso: la persona ya no pega una línea por cada vuelta.
- **Punto 2, «que la persona diga "usá ese archivo" y el agente lo registre» — parcial.** Si la persona
  **nombra** el archivo con un verbo reconocido, la escritura pasa. Lo que sigue frenado son las otras dos
  mitades: la forma deíctica —«usá ese archivo», «registralo donde haga falta»—, que `mentions()` no puede
  resolver porque compara el nombre del ítem contra el texto; y la persistencia, porque `self-approval`
  consulta el chat con `CHAT.authorized` (`engine/hooks/self-approval.js:28`), que pregunta y **no
  concede** —conceder ahí era aprobarse solo por la puerta de al lado, y el cierre del 116 lo dice—.
- **Punto 3, «que la guía deje de pedir borrar lo que el agente no escribió» — sigue vivo, intacto.**
  `template/AGENTS.md:137` sigue diciendo «borrarla es parte de terminar», sin distinguir la línea que el
  agente pidió para una operación de la que la persona dejó puesta a propósito.

**Prioridad: se mantiene media, con otra razón.** La que estaba escrita era la fricción repetida sobre la
persona, y ésa se fue. La sostiene ahora lo que quedó en su lugar: una exención que vale por toda la
sesión y que no aparece en ninguna corrida de `check` —«una exención que no se ve es un límite que ya no
existe», que es lo que el propio punto 2 de «Fix propuesto» pedía evitar—. No sube a alta porque no
bloquea a nadie ni ensancha el permiso más allá de la sesión; no baja a baja porque el agujero de
auditoría es nuevo y nadie lo va a notar solo.

## Relacionados

- **118** — la salida por chat no funciona. Con 118 arreglado, el punto 1 de acá es el que evita que la
  persona tenga que pegar nada. Medido el 2026-09-11, hoy funciona para la mayoría de los textos y falla
  para los que no traen un verbo de la lista cerrada.
- **116** — «una autorización del chat no sobrevive al mensaje siguiente», resuelto en 0.83.0. Es el que
  trajo `granted`, o sea la mitad sin auditar del punto 1 de acá.
- **112** — una aprobación consumida no deja rastro. La procedencia que el punto 1 pide es lo mismo visto
  desde la auditoría.
- **089** — la aprobación por ruta también falla cuando la forma de la ruta no coincide; 0.80 lo mejoró
  imprimiendo la línea exacta.
