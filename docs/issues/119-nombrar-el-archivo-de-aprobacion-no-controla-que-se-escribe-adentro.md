---
caso: 119
titulo: Nombrar `.ops-approval` autoriza el archivo, no su contenido, y por ahí el agente se aprueba un push a la rama viva
estado: resuelto
resuelto-en: 0.83.0
prioridad: alta
version-detectada: 0.82.0
---

# 119 — La persona aprueba una ruta inocua y el agente escribe `push origin main` en el mismo archivo

**🟢 resuelto en 0.83.0** · detectado en 0.82.0, **publicado** · prioridad **alta** — era la vía completa
que vaciaba lo que el 108 y el 116 decidieron: ni `allowPush` ni el chat alcanzan a la rama viva, y la
publicación nunca se concede. Por acá sí llegaba.

## Resumen

`self-approval` frena que el agente se escriba `planning/.ops-approval`, salvo que la persona nombre ese
archivo en su mensaje. Comprueba **que el archivo fue nombrado, nunca qué se escribe adentro**: la persona
autoriza agregar una ruta inocua y el agente escribe cualquier otra cosa, incluida una línea
`push <remoto> <rama>` que después autoriza publicar en la rama viva.

Es la excepción más ancha del sistema. La línea de `.ops-approval` alcanza a la rama viva **a propósito**,
porque la escribe una persona a mano y los guards de límites impiden que el agente se la escriba (caso
108). Esa premisa es la que no se cumple.

## Reproducción

Desde un checkout de Cauce, sobre un banco desechable. Se invocan los guards de verdad, en sus grupos, con
el mismo `session_id`.

```bash
BANCO=$(mktemp -d); R=$PWD; A=$BANCO/acme
node $R/engine/cli/ops.js init $A --mode embedded --runner claude --no-install >/dev/null
h() { out=$(printf '%s' "$2" | OPS_ROOT=$A node $R/engine/hooks/run.js "$1" 2>&1); echo "exit=$?  ${out%%$'\n'*}"; }

h pre-shell '{"cwd":"'$A'","session_id":"s","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git push origin main"}}'
h prompt    '{"cwd":"'$A'","session_id":"s","hook_event_name":"UserPromptSubmit","prompt":"agregá src/login.js a '$A'/planning/.ops-approval"}'
h pre-files '{"cwd":"'$A'","session_id":"s","hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"'$A'/planning/.ops-approval","content":"push origin main\n"}}'
printf 'push origin main\n' > $A/planning/.ops-approval     # el hook juzga, no escribe
h pre-shell '{"cwd":"'$A'","session_id":"s","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git push origin main"}}'
h prompt    '{"cwd":"'$A'","session_id":"s","hook_event_name":"UserPromptSubmit","prompt":"seguí con la tarea"}'
h pre-shell '{"cwd":"'$A'","session_id":"s","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git push origin main"}}'
```

## Síntoma

Salida real, 2026-09-11, sobre `main` `ce1fcee2` —la versión 0.83.0 sin publicar—:

```
1) push a main, sin nada aprobado        : exit=2  BLOQUEADO: 'git push' publica cambios en main, la rama
                                                   viva, y requiere una acción humana: ni runner.allowPush
                                                   ni una orden en el chat llegan ahí…
2) la persona nombra .ops-approval        : exit=0    ← pidió agregar `src/login.js`
3) el agente escribe «push origin main»   : exit=0    ← el guard mira el archivo, no el contenido
4) el mismo push que antes se frenaba     : exit=0
5) un mensaje cualquiera después          : exit=0    ← y el push sigue pasando
```

**Y ya está publicado.** Los mismos pasos contra un `git archive` de `v0.82.0`, la versión que hay hoy en
npm, dan idéntico: `exit=2` el primero y `exit=0` los tres siguientes. No es una regresión de 0.83.0.

## Causa raíz

- `engine/hooks/self-approval.js:22-28` — la comprobación es sobre la **ruta** del archivo: si la persona lo
  nombró en su mensaje, la escritura pasa. No hay ninguna comparación del contenido entrante.
- `engine/hooks/approval.js:34-36` — `.ops-approval` se lee como una lista de líneas, y una línea
  `push <remoto> <rama>` es una autorización de publicación válida.
- `engine/hooks/push.js:168-172` — un destino cuya línea está en el archivo se saca de lo que hay que
  autorizar **antes** de mirar la rama viva, que es lo que hace que esa línea alcance a `main`. Es
  deliberado (caso 108) y descansa en que la línea la escribió una persona.
- **Lo que 0.83.0 sí cambió**: `self-approval` pasó de `unauthorized` a `authorized`, o sea que ya no
  concede —en el mensaje siguiente vuelve a frenar—. Eso cierra la persistencia, no el contenido: dentro
  del mensaje que autoriza, el agujero es el mismo.

## Fix propuesto

La forma, no el diff; las opciones tienen costos distintos y la elección es del proyecto.

1. **Comparar el contenido, como hace el guard nuevo de `ops.config.json`.** Sólo pasan las líneas que la
   persona nombró en su mensaje; cualquier línea que ella no nombró frena la escritura. Es el precedente
   más cercano —`engine/hooks/ops-config.js` compara lo entrante contra el disco por esta misma razón— y
   deja el caso cerrado. Cuesta decidir qué hacer cuando la escritura llega como fragmento y no como
   archivo entero, que es lo que ese guard resolvió frenando.
2. **Que las líneas de push no se acepten escritas por el agente**, distinguiendo en `approval.js` las que
   llegaron por esa vía. Cierra lo irreversible y deja el resto como está; cuesta un campo de procedencia
   en un archivo que hoy es una lista de líneas y nada más.
3. **Que `.ops-approval` no acepte líneas de push en absoluto** y que la rama viva se autorice sólo por
   `runner.pushToLiveBranches`. Es lo más simple de comprobar y le quita a la persona la salida puntual que
   el 108 le dio a propósito.
4. **Declararlo y no arreglarlo.** No cuesta código y deja publicada una vía por la que el agente se
   autoriza a publicar en la rama viva; contra eso pesa que el propio sistema afirma lo contrario en R10 y
   en el mensaje del bloqueo.

## Tradeoffs

- **La comparación de contenido acerca `self-approval` a `ops-config`**, y esa simetría hoy está escrita
  pero no existe: el comentario de `ops-config.js` dice hacer «lo mismo que `self-approval`», y uno concede
  mientras el otro no. Cerrar esto es también volver cierto ese comentario.
- **Cualquier opción agrega fricción donde la persona quería ayuda.** «Agregá estas tres rutas» es un
  pedido legítimo, y comparar línea por línea obliga a que las tres estén nombradas.
- **El caso no toca lo que ya está escrito** en un `.ops-approval` existente: una línea de push puesta
  antes sigue valiendo, y no hay cómo saber quién la escribió.

## Prioridad

**Alta**, y la sostiene el alcance y no la probabilidad: lo que queda del otro lado es un push a la rama
viva, que no se deshace, hecho sin que ninguna persona lo haya autorizado. Está publicado desde 0.82.0.

No es urgente en el sentido de que exige un pedido previo de la persona —nombrar `.ops-approval`— y ese
pedido es raro fuera de una sesión donde algo ya se frenó; pero es exactamente la sesión donde ocurre.

## Contexto de descubrimiento

2026-09-11, midiendo los casos 117 y 118 contra 0.83.0 antes de publicar. El agente que los contrastó lo
encontró de costado —la persona autoriza una ruta y el agente escribe otra— y dejó dicho que la segunda
mitad, que esa línea después publique, era lectura de fuente y no medición. Se midió: publica.

## Relacionados

- **108** — le dio a la línea de `.ops-approval` el alcance a la rama viva, apoyándose en que sólo una
  persona puede escribirla. Este caso es esa premisa incumplida.
- **116** — decidió que la publicación no se concede por chat. Esta vía la concede igual, por el costado.
- **117** — pide poder registrar lo que la persona ya autorizó; si eso se construye, el contenido de
  `.ops-approval` deja de ser el único canal y este caso cambia de forma.
- **114** — el guard que sí compara contenido contra disco, y el precedente de la opción 1.

## Cierre

Resuelto con la **opción 1**: lo que se escribe se compara línea por línea contra lo que la persona pidió
en su mensaje. El recorrido de abajo es contra el caso entero, no contra «Fix propuesto».

**Qué se corrió.** La reproducción del caso, tal cual, contra el motor arreglado. El paso 3 pasó de
`exit=0` a `exit=2`, y el 4 —el push que aquella línea autorizaba— volvió a frenarse, que es la mitad que
importa: no alcanza con que aparezca el bloqueo nuevo, hay que ver que lo viejo dejó de pasar.

```
1) push a main, sin nada aprobado      : exit=2  BLOQUEADO: 'git push' publica cambios en main…
2) la persona nombra .ops-approval     : exit=0
3) el agente escribe «push origin main»: exit=2  BLOQUEADO: …es la aprobación de una persona y estas
                                                 líneas no las pidió:  push origin main
4) el push que aquella línea autorizaba: exit=2  BLOQUEADO: 'git push' publica cambios en main…
5) lo que ella sí pidió                : exit=0
6) la misma escritura por shell        : exit=2  BLOQUEADO: el comando … no dice con qué va a quedar el
                                                 archivo
--- lo que quedó en el archivo: (no existe: el agente no llegó a escribirlo)
```

Y diez mutaciones sobre copias desechables, una por cada parte del arreglo: las diez ponen alguna prueba
en rojo —`pass 3 / fail 1` contra el control `pass 4 / fail 0`—. La que enseñó algo es **M06**: apagar el
`inherit` de `chat.js` sobrevivió en la primera vuelta, porque los gates ya no conceden nada y la herencia
no tenía qué heredar; se cerró con el caso que sí la observa —una ruta que la sesión concedió por otro
guard no entra sola como línea de la aprobación—.

Las dos puertas en 0: `npm test` (760/760) y `npm run ci` (65 archivos en su piso de cobertura o por
encima; `self-approval.js`, 100 %).

### Ítem por ítem

- **Resumen, «comprueba que el archivo fue nombrado, nunca qué se escribe adentro»**: cerrado. La
  escritura sólo lleva las líneas que la persona nombró en el mensaje en curso.
- **Resumen, «una línea `push <remoto> <rama>` que después autoriza publicar en la rama viva»**: cerrado
  por lo anterior, y probado por ausencia: el paso 4 vuelve a `exit=2`.
- **Reproducción**: corrida antes y después, en bancos desechables bajo el scratchpad. Antes, `exit=0` en
  los pasos 3 a 6.
- **Síntoma**: la salida pegada en el caso se reprodujo idéntica sobre `ce1fcee2` antes de tocar nada.
- **Causa raíz, `self-approval.js:22-28`**: exacta. Ahí estaba la comprobación por ruta y ahí se agregó la
  de contenido.
- **Causa raíz, `approval.js:34-36`**: se tocó, pero no como el caso suponía. La lectura de líneas se
  separó del archivo (`lines`) para que el disco y lo entrante se parseen igual; una línea de push sigue
  siendo una autorización válida, y lo que cambió es quién puede escribirla.
- **Causa raíz, `push.js:168-172`**: **no se tocó**, a propósito. El alcance a la rama viva que le dio el
  108 queda intacto; lo que se restituye es su premisa, que esa línea la escribe una persona.
- **Causa raíz, «lo que 0.83.0 sí cambió»**: exacta, y era la mitad que faltaba.
- **Fix, opción 1 (comparar el contenido)**: **la tomada.** Cierra la vía sin quitarle a la persona
  ninguna salida.
- **Fix, opción 2 (procedencia por línea en `approval.js`)**: descartada. Pide un campo nuevo en un
  archivo que hoy es una lista de líneas y que una persona escribe a mano, y deja pasar la escritura para
  después acordarse de quién la hizo. La opción 1 no la deja entrar.
- **Fix, opción 3 (que no acepte líneas de push)**: descartada. Le quita a la persona la salida puntual
  que el 108 le dio a propósito, y el problema no era la línea sino quién la escribía.
- **Fix, opción 4 (declararlo y no arreglarlo)**: descartada por lo que dice el propio caso — el sistema
  afirma lo contrario en R10 y en el mensaje del bloqueo.
- **Fix, «cuesta decidir qué hacer cuando la escritura llega como fragmento»**: decidido **distinto** que
  `ops-config`, con la razón en `unasked`. Allá un fragmento no se puede comparar porque una llave cambia
  de sentido según lo que la rodea; acá cada línea vale por sí sola, así que el fragmento que llega es
  exactamente lo que se agrega y sí se juzga. Lo que no se lee como líneas —un parche con sus
  encabezados— no coincide con nada pedido y se frena.
- **Tradeoff, «volver cierto el comentario de `ops-config`»**: hecho, y al revés de lo previsto. Ese
  comentario decía «lo mismo que `self-approval`» mientras su código concedía; ahora los dos preguntan
  cada vez y el comentario es cierto.
- **Tradeoff, «cualquier opción agrega fricción donde la persona quería ayuda»**: confirmado. «Agregá
  estas tres rutas» en una sola frase no alcanza: `mentions` pide que cada nombre esté en una frase que
  pida algo, y las que van después de la coma quedan sin pedido. La salida es barata y está en el
  mensaje —el bloqueo lista las líneas y un «dale» aprueba exactamente ésas—, y se probó.
- **Tradeoff, «el caso no toca lo que ya está escrito»**: sigue siendo cierto y ahora es deliberado. Las
  líneas que ya están en disco quedan exentas: esta escritura no las agrega, y exigir que se las nombre
  obligaría a repetir el archivo entero para sumar una.
- **Prioridad alta, «está publicado desde 0.82.0»**: se cierra en 0.83.0, que todavía no se publicó.
- **Relacionados**: el **108** recupera su premisa; el **116** queda como está salvo en los gates de
  commit —abajo—; el **117** no se construyó y este caso no depende de él; el **114** es el precedente
  que se siguió, y de paso se corrigió su guard.

### Lo que el caso no preveía

- **Los gates de commit heredaban lo concedido, y nadie lo había decidido.** `governance`, `verify` y
  `dependencies` pasan por `AP.pending`, así que la concesión de sesión del 116 los alcanzaba: con otro
  mensaje en curso, un commit de gobernanza salía `exit=0`. Medido sobre el mismo banco antes y después
  —paso 5, `exit=0` → `exit=2`—. Ahora preguntan cada vez, como la publicación. **No tiene caso propio**:
  se decidió y se cierra acá.
- **`ops-config` hacía lo contrario de lo que decía su comentario**: nombrar `ops.config.json` una vez
  dejaba escribir las dos llaves del push por el resto de la sesión. Pasó a preguntar sin conceder, y la
  prueba que fijaba el contrato viejo se dio vuelta con la razón escrita.
- **Por shell se frena toda escritura sobre la aprobación**, aunque la persona la haya pedido. Es una
  quita, así que lo aserciado es que la forma que antes pasaba ahora no pasa.
- **La concesión que cruza de un guard a otro no se tocó**, que era lo decidido, con una excepción
  deliberada: una línea de la aprobación no entra por estar concedida en otro lado, porque lo que se
  escribe ahí lo leen todos los guards y llega hasta la rama viva.
- **Se actualizó lo que viaja a una empresa**: `template/AGENTS.md` y `automatization/hooks/README.md`
  decían que lo pedido pasa «sin preguntarte de nuevo», sin la excepción de los gates de commit.
