---
caso: 071
titulo: La fase Claim de `autobuild` reintenta sin tope y no vuelve a elegir tarea después de Decompose
estado: resuelto
resuelto-en: 0.75.0
prioridad: alta
version-detectada: 0.73.0
---

# 071 — 28 de 39 agentes de una corrida se fueron en reclamar una tarea, la mitad de ellos sobre un slug que la propia corrida había borrado

**🟢 resuelto en 0.75.0** · detectado en 0.73.0 · prioridad **alta** — el 72 % de una corrida y el 34 % del gasto total de una sesión de cinco corridas, sin producir nada

## Resumen

En una corrida real de `autobuild`, la secuencia de fases fue ésta:

```
Triage ×2
Claim ×13     ← el mismo comando fallando, trece veces
Ready ×1
Decompose ×3  ← parte la tarea en dos y reescribe el BACKLOG
Claim ×15     ← sigue reclamando el slug PREVIO a la partición
Ready ×1 · Plan ×1 · WIP ×1 · Build ×2
```

**28 de 39 agentes** —el 72 %— se fueron en la fase Claim. La corrida gastó 2,73 M de tokens y 36
minutos, y produjo el trabajo de una sola tarea.

Son dos defectos distintos que se suman:

1. **Claim reintenta sin tope.** Trece veces el mismo comando, con la misma salida, antes de seguir.
2. **Después de Decompose, Claim no vuelve a elegir.** La partición borra la tarea del BACKLOG y escribe
   dos en su lugar; Claim sigue pidiendo la que ya no está, quince veces más.

> **Contrastado contra el fuente el 2026-09-10.** El efecto medido se sostiene; las dos causas que este
> caso nombra no, y una tercera aparece. Está en «Causa raíz».

## Reproducción

Una tarea en la cola que Decompose vaya a partir —más de `maxTaskHours` o con la aceptación cargada— y
un `claim` que falle la primera vez. En la corrida medida el fallo era éste, con exit code 2:

```
$ node tools/ops.js claim venotal-ops/planning dashboard-image-hardening
dashboard-image-hardening no está en BACKLOG: sólo se toma trabajo ya promovido.
```

El segundo tramo es reproducible solo: si Decompose corre y renombra o parte la tarea, todo intento
posterior de reclamar el slug original devuelve exactamente ese mensaje, para siempre.

## Síntoma

Desde afuera la corrida se ve **trabajando**: los agentes arrancan, terminan sin error y el recorrido
avanza. Nada dice que veintiocho de ellos hicieron la misma pregunta y recibieron la misma negativa.

El resultado final tampoco lo delata: la corrida terminó en `edge-unproven` con trabajo real hecho, y el
gasto se atribuyó a la dificultad de la tarea. Sólo contando fases en el `journal.jsonl` aparece que la
tarea costó once agentes y reclamarla veintiocho.

**Y el propio journal lo esconde.** El campo `label` de los agentes de las fases de decisión no lleva un
nombre sino un fragmento del prompt: `"Nunca inventes credenciales ni decisiones; registrá "` —treinta
veces en cinco corridas—. Con eso, `/workflows` y el journal muestran la misma cadena repetida en vez de
qué está haciendo cada agente, que es lo que habría hecho visible el bucle mientras ocurría.

## Causa raíz

~~No está establecida desde afuera.~~ Leída en el fuente —`automatization/workflows/autobuild.js`—, con
tres correcciones a lo que este caso suponía.

**1. Hay tope, y es peor que no tenerlo.** El bucle es `while (rounds++ < MAX_TASKS)` con
`MAX_TASKS = 50`, y cada claim fallido hace `continue`, o sea consume una vuelta. Así que el tope de
reintentos **es el presupuesto de tareas de la corrida**: una tarea que no se puede reclamar se come el
cupo entero sin que nada lo distinga de haber trabajado. Los 28 medidos son 28 de esas 50.

Eso cambia el arreglo: no alcanza con «poner un tope», porque ya hay uno. Hace falta un contador **de
reintentos**, separado del de tareas, y que agotarlo sea una parada con razón.

**2. Después de Decompose el recorrido sí vuelve a elegir.** La rama de partición hace
`planning = await readContext()` y `continue`, y la vuelta siguiente reconstruye la tarea desde
`planning.slug`. O sea que el slug **no** queda capturado: se relee. Lo que no existe es una comprobación
de que la escritura hizo lo que se le pidió — el reemplazo en el BACKLOG lo escribe un agente a partir de
un prompt, y si lo hace a medias, `context` puede devolver el mismo slug y el bucle sigue con razón
aparente.

**3. Y hay algo más grande, que este caso no nombra: `context` ofreció una tarea que `claim` rechazó.**
Los dos leen la misma estructura —`state.milestones.flatMap(m => m.tasks)`—, así que deberían coincidir.
Que no coincidan ya pasó una vez y está escrito en `engine/cli/planning.js`, sobre el filtro `--hito`:

> «pedir otro hito mientras sostenías una tarea ofrecía una segunda que `claim` después se niega a dar:
> el comando que dice qué hacer y el que lo autoriza contestaban distinto, y sólo se veía al reclamar.»

Es la misma clase por otro camino. Y hay un candidato concreto para ese camino: **el recorrido no corre
`claim`, se lo pide a un agente**. El prompt dice «Corré "node tools/ops.js claim {P} {task.id}"», y lo
que efectivamente se ejecuta lo compone el modelo. Un slug distinto del que `context` entregó produce
exactamente `no está en BACKLOG`, trece veces seguidas, sin que nada lo note.

**Cuál de las dos es** —que `context` y `claim` discrepen, o que el comando se componga mal— no se puede
decidir sin el `journal.jsonl` de esa corrida: el campo `details` del schema `CLAIM` guarda el mensaje,
y ahí está el slug que realmente se pidió. **Eso es lo primero que hay que mirar**, y es gratis.

## Fix propuesto

**Primero el diagnóstico que cuesta cero**: leer el `details` de los agentes de Claim en el
`journal.jsonl` de esa corrida y ver **qué slug se pidió realmente**. Si es el que `context` entregó, el
defecto está en que los dos comandos discrepan; si es otro, está en que el comando lo compone el modelo.
Son arreglos distintos y no conviene elegir a ciegas.

Con eso, lo que se sostiene en las dos ramas:

```diff
  Claim
+   Un `claim` que falla con "no está en BACKLOG" no se reintenta: la causa no cambia sola.
+   Contador de reintentos **propio**, separado del cupo de tareas: hoy el único tope es
+   MAX_TASKS = 50, así que una tarea irreclamable se come la corrida entera.
+   Agotarlo es una parada con razón, no un avance silencioso.
```

~~Re-pick obligatorio tras Decompose~~ — **ya existe**: la rama de partición relee el contexto y vuelve
al principio del bucle. Lo que falta ahí es otra cosa:

```diff
  Decompose
+   Comprobar que el reemplazo en el BACKLOG ocurrió: si tras releer el contexto la cola sigue
+   ofreciendo el mismo slug, la escritura no hizo lo que se le pidió y eso es una parada,
+   no una vuelta más del bucle.
```

Y aparte, barato y de otro orden: **que `label` lleve un nombre**. Las fases que ya lo tienen
—`contract-digest`, `planning-context`, `claim:<slug>`— se leen perfecto; las que caen al fragmento del
prompt no se leen. Es lo que convierte un bucle de veintiocho agentes en algo visible mientras pasa.

## Tradeoffs

- Un tope de reintentos puede cortar una corrida que se habría recuperado sola. A cambio, hoy el único
  tope es el cupo de tareas, así que el costo de equivocarse se lleva la corrida entera.
- El re-pick tras Decompose ya implica que la corrida puede terminar construyendo una tarea distinta de
  la que empezó. Es lo correcto —la cola es la fuente de verdad— y hoy **no lo dice en su salida**, que
  es lo que conviene agregar: cambia lo que quien autorizó la corrida esperaba.
- Parar cuando el reemplazo del BACKLOG no ocurrió convierte una escritura a medias en un corte. Es
  preferible a la vuelta silenciosa, y hay que decir que puede cortar una corrida por un fallo del
  modelo al escribir, no del recorrido.

## Contexto de descubrimiento

Instancia real (sidecar), 2026-09-09. Cinco corridas de `autobuild` en una sesión: **75 agentes y
5,78 M de tokens**, cero tareas cerradas por el propio recorrido. Contando por fase, el bucle de esta
corrida explica 1,96 M —el 34 % del total de la sesión— y otra corrida entera de 343 k se perdió por el
caso 056. Entre los dos, cerca del 40 % del gasto no produjo nada.

El resto sí produjo: las paradas por `review-failed` y `plan-rejected` fueron hallazgos correctos que
mejoraron el trabajo. Este caso no discute eso; discute lo que se gasta antes de llegar a trabajar.

## Relacionados

- **056** — la otra forma de gastar una corrida entera sin construir. Aquél era una lectura fallida que
  se leía como cola vacía; éste es una escritura fallida que se reintenta sin mirar por qué falló.
- **`AGENTS.md`, Autonomía** — «un runner lleva una tarea a la vez». El re-pick tras Decompose no la
  contradice: la tarea que se lleva es la que la cola tiene ahora.

## Cierre

**Resuelto en 0.75.0.** El caso se cierra con un arreglo distinto del que proponía, porque contrastarlo
contra el fuente cambió el diagnóstico y el diagnóstico cambió el remedio.

- **El diagnóstico que costaba cero —leer el `details` de los Claim en el `journal.jsonl`— no se hizo, y
  no se pudo.** Ese journal vive en la instancia real donde ocurrió la corrida (sidecar), no en este
  repositorio, y acá no hay copia. Lo que sí se hizo es que **la próxima corrida lo conteste sola**: la
  parada nueva lleva el slug que `context` ofreció y, literal, lo que contestó el reclamo. Con eso, la
  primera vez que vuelva a pasar se lee en la salida cuál de los dos defectos fue —los dos comandos
  discrepando sobre la misma cola, o el comando compuesto con otro slug— sin tener que ir a buscar nada.
  Queda pendiente de ese lado; de éste, ya no hace falta elegir a ciegas.
- **«Contador de reintentos propio, separado del cupo de tareas» — se hizo distinto, y por una razón que
  el caso no tenía.** Un contador sigue gastando N agentes antes de parar, y sigue teniendo que elegir un
  N. Lo que se comprobó contra el motor es que **no hace falta contar**, porque hay un discriminador
  exacto: si `context` vuelve a ofrecer **el mismo** slug y sin reservar, nadie lo tomó y el reclamo falló
  por su cuenta — eso no mejora repitiendo, y se para en el primer intento. Si ofrece **otro**, la carrera
  la perdió de verdad y la corrida sigue, sin tope. Cero reintentos donde no sirven, infinitos donde sí.
- **«Comprobar que el reemplazo en el BACKLOG ocurrió» — se hizo**, con la misma forma: tras releer el
  contexto, que la cola siga ofreciendo la tarea sin partir significa que la escritura no ocurrió, y para
  con `split-not-applied`.
- **«Re-pick obligatorio tras Decompose» — ya existía y se confirmó leyendo el fuente**; el caso ya lo
  había tachado en su propia sección de causa raíz. No se tocó.
- **«Que `label` lleve un nombre» — se hizo, y completo**: las **27 llamadas a subagente** del recorrido
  llevan etiqueta, comprobado sobre el archivo renderizado. Y para que no vuelva a perderse de a una, el
  arnés de pruebas **rechaza** una llamada sin etiqueta: las cuatro suites del recorrido pasan por ahí, así
  que el olvido se ve en la primera prueba que ejerza esa rama. No se envolvió el helper como se hizo con
  `phase`, porque el nombre de la fase no alcanza —Critique planifica y critica, Review revisa y manda a
  corregir— y esa es justo la distinción que hacía falta.
- **Apareció una tercera lectura del mismo slug que el caso no tenía, y era la que rompía el arreglo
  ingenuo: la reserva ya es nuestra y el agente reportó mal.** Comprobado contra el motor: `context`
  devuelve `claimed: true` para el runner que reclamó. Parar ahí tiraría una corrida entera por un error
  de reporte, así que la condición mira las dos cosas —mismo slug **y** sin reservar—. La primera versión
  no lo miraba y ninguna prueba lo notaba; la mutación que lo mostró está abajo.
- **Tradeoff «un tope de reintentos puede cortar una corrida que se habría recuperado sola» — no se
  pagó**, porque no hay tope: lo que corta es un estado que no cambió, y ése no se recupera solo.
- **Tradeoff «el re-pick ya implica que la corrida puede terminar construyendo otra tarea, y hoy no lo
  dice en su salida» — se hizo lo que el caso proponía.** Las dos vueltas que cambian de tarea a mitad de
  corrida —la carrera perdida y la partición— ahora lo dicen, nombrando con qué sigue la cola. Sin eso el
  cambio sólo aparecía al final, en un cierre que nombra algo que nadie mandó a hacer.
- **Tradeoff «parar por una escritura a medias corta una corrida por un fallo del modelo, no del
  recorrido» — se acepta y se dice donde se lee**: el motivo de `split-not-applied` es literalmente «la
  escritura no ocurrió como se pidió», que apunta a quién falló.
- **Lo que este caso no cierra y sigue abierto**: la pregunta de fondo —si `context` y `claim` pueden
  discrepar sobre la misma cola— no se contestó. Lo que se hizo es que la próxima ocurrencia la conteste y
  que mientras tanto no cueste una corrida. Si el mensaje capturado dice «no está en BACKLOG» sobre un
  slug que `context` acababa de ofrecer, eso es un defecto del motor y sale como caso propio.

### Qué se corrió

**El discriminador, contra el motor real** —`node engine/cli/ops.js`, sobre un `planning/` desechable con
dos tareas en cola—, que es la premisa de la que cuelga todo el arreglo:

```
1. context (runner r1)                  → slug: dashboard · claimed: false
2. claim dashboard (r1)                 → ✓ dashboard tomada por a@x · exit 0
3. context (runner r2, el que perdió)   → slug: boton     · claimed: false   ← otra tarea: seguir
4. claim fantasma (r2)                  → "fantasma no está en BACKLOG: sólo se toma
                                           trabajo ya promovido." · exit 2
5. context (runner r1, el que reclamó)  → slug: dashboard · claimed: true    ← nuestra: seguir
```

Las tres lecturas que la condición necesita distinguir, medidas y distintas. El paso 4 es, literal, el
mensaje que la corrida real recibió trece veces.

**El recorrido, corrido de verdad** con los subagentes simulados sobre el archivo renderizado —el mismo
texto que recibe una instancia—: 28 casos en `test/workflows/autobuild.test.js`, 640 en la puerta
entera, todos en verde.

**Las etiquetas, contadas sobre el renderizado**: `27 llamadas a subagente · sin label: 0`.

**Cinco mutaciones, las cinco en rojo:**

| Mutación | Qué se cayó |
|---|---|
| Sacar la parada de Claim | «un reclamo que falla sobre la misma tarea para, en vez de reintentar sin fin» |
| Sacar la parada de Decompose | «si el BACKLOG no cambió tras partir la tarea, el recorrido para» |
| Sacar `&& !planning.claimed` de la parada | «un reclamo mal reportado no frena si el estado dice que la tarea es nuestra» |
| Callar el aviso de la carrera perdida | «cambiar de tarea a mitad de corrida se dice, en las dos vueltas que lo hacen» |
| Callar el aviso de la partición | la misma |

Y dos más sobre el arnés de etiquetas: sacar el `label` de Build tira 13 casos, sacar el de una escritura
tira el suyo — «la fase Build llamó a un agente sin label».

**Lo que no se pudo correr, y se dice**: `autobuild` entero contra una instancia real con agentes de
verdad. Acá no se instala el toolkit —`mode: toolkit`— y una corrida como la que originó el caso cuesta
39 agentes. La comprobación de que el bucle desapareció la va a dar la próxima corrida real; lo que sí
está medido es cada una de las tres lecturas de estado sobre las que el bucle decidía.
