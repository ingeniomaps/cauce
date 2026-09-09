---
caso: 055
titulo: Nada contrasta el carril, el cast y la aceptación de una tarea contra su propia descripción
estado: resuelto
resuelto-en: 0.71.0
prioridad: media
version-detectada: 0.70.0
---

# 055 — La clasificación y la aceptación se escriben en un acto y nadie las contrasta después

**🟢 resuelto en 0.71.0** · detectado en 0.70.0 · prioridad **media** — no rompe nada visible; deja cerrar tareas en verde con la mitad de lo que prometían adentro

## Resumen

Al promover un hito, la línea de una tarea declara cuatro cosas a la vez: qué hace, en qué carril va,
quién la entrega y la revisa, y con qué se comprueba. Las cuatro las escribe la misma mano en el mismo
acto, y después **nada las contrasta entre sí**.

`check` acepta la línea: valida la forma —que el carril esté en el vocabulario, que la tarea tenga
aceptación— y no puede hacer más, porque el encaje entre el carril y la superficie que la tarea toca es
juicio, no gramática. Y la fase que podría atraparlo no lo pide: Ready exige *«aceptación concreta y
decisiones resueltas»*, que es que la aceptación **exista** y sea observable, no que **cubra lo que la
descripción promete**. Classify tampoco: dice *«si la tarea no declara lane y cast, decidirlos»* —
condicional a que falten. La que llega con carril y cast puestos no se vuelve a mirar nunca.

Releerlas no lo encuentra, y ésa es la parte que importa: quien escribió la línea ya la da por buena, y
**una aceptación incompleta se lee perfecta**, porque todo lo que dice es cierto. Es exactamente la
familia que el propio corpus ya nombra —R11 con los comentarios, R14 con el registro de una afirmación,
R15 con la dimensión que el contrato enumera— y las tres se resolvieron igual: con una pasada mecánica
antes de entregar. Ésta es la misma falla aplicada a la línea de la tarea, y es la única de la familia
sin su pasada.

## Reproducción

1. En una instancia 0.70.0, promover un hito con varias tareas escritas de corrido, cada una con
   descripción, carril, cast y aceptación.
2. `node tools/ops.js check planning`.
3. Verde.
4. Leer cada descripción frase por frase y preguntar, por cada cosa que promete, cuál condición de
   aceptación la comprueba.

## Síntoma

Caso real, hito `plataforma-en-contenedor` de una instancia con cinco tareas nuevas, `check` verde en
las cinco:

**Tres aceptaciones cubrían menos que su descripción.**

| tarea | la descripción promete | la aceptación comprueba | lo que habría cerrado en verde |
|---|---|---|---|
| endurecer la imagen | base pineada por digest, `HEALTHCHECK`, no-root | healthy y no-root | la base sin pinear |
| runtime con compose | límites de CPU y memoria, **rotación de logs**, verbos | límites y verbos | los logs sin tope, que era media razón del hito |
| forma del entorno | `.env.example` normalizado, `.env.schema`, `make check-env` | sólo `check-env` | el `.env.example` sin normalizar, que era el defecto que originó la tarea |

**Tres casts estaban invertidos**: la entrega asignada al cargo que correspondía revisar. El más claro:
una tarea sobre sacar las migraciones del arranque del contenedor la entregaba `database-administrator`,
cuyo propio contrato dice que opera el motor *«no la semántica del dato»* y no construye el camino de
entrega. Eso es `devops-engineer`, y el DBA es quien tiene que revisarlo.

**Un carril estaba corto**: endurecer la imagen quedó en `lite` porque el cambio son tres líneas de
Dockerfile. Pero una de esas líneas hace que el proceso deje de correr como root, y eso es superficie de
permisos: el propio PROTOCOL dice que lo que decide el carril es la superficie y no el tamaño, y que un
cambio de permisos es `full`. El carril se eligió mirando el diff.

## Causa raíz

`planning/PROTOCOL.md`, «Máquina por tarea»:

- Paso 3, Classify: `si la tarea no declara lane y cast, decidirlos y escribirlos en su línea` —
  condicional a la ausencia. No hay paso para la que ya los trae.
- Paso 4, Ready: `exigir aceptación concreta y decisiones resueltas` — exige que la aceptación exista y
  sea observable, no que sea completa respecto de la descripción.

El corpus tiene la herramienta para esto y no la aplica acá. R15 dice que *«antes de entregar se
contrasta el entregable contra la enumeración del contrato, dimensión por dimensión»*, y la descripción
de una tarea **es** una enumeración: cada cosa que nombra es una dimensión que alguien va a dar por
hecha al leerla. Falta decir que ese contraste también corre antes de **tomar** una tarea, no sólo antes
de entregarla.

## Fix propuesto

Un párrafo en Ready, donde ya está el gancho:

```diff
 4. Ready: exigir aceptación concreta y decisiones resueltas.
+   Y contrastar la línea consigo misma: recorrer la descripción frase por frase y contestar, por cada
+   cosa que promete, cuál condición de aceptación la comprueba; releer el carril contra la superficie
+   que la tarea toca y no contra su tamaño; y comprobar que el cast entrega a quien construye y revisa
+   a quien el contrato de ese cargo pone a revisar. Lo que quede sin condición se agrega o se declara
+   fuera de alcance en la línea; ninguna de las tres se detecta releyendo.
```

## Tradeoffs

- **Es una pasada, no una puerta.** No se puede mecanizar: `check` puede seguir validando la forma y
  nada más. Lo que se gana es que la falla tenga un momento asignado; lo que no se gana es garantía.
- **Y hay un problema de ubicación que no sé resolver desde afuera.** El lugar natural es Ready, pero
  Ready no corre en `express` ni en `directo` — y una tarea mal clasificada es justamente la que
  terminó en un carril que se salta la fase que la habría atrapado. La pasada del carril quizá tenga
  que vivir en Classify, que sí decide para los cuatro, y la de la aceptación en Ready. Lo dejo
  planteado en vez de proponer una sola ubicación, porque elegirla es del mantenedor.
- **Cuesta minutos por tarea** y los cobra al promover, que es cuando hay menos ganas de mirar. La
  contrapartida medida acá: seis correcciones sobre cinco tareas, todas antes de escribir una línea de
  código.

## Contexto de descubrimiento

Instancia real (sidecar, 0.70.0), 2026-09-08. El hito se promovió tras un análisis de cuatro
repositorios hermanos y las cinco tareas salieron de ahí. `check` dio verde. Quien opera preguntó si
las tareas estaban bien clasificadas —no por sospecha de un defecto, sino por revisar—, y al mirarlo
aparecieron las seis. Ninguna la habría encontrado el motor, y ninguna la habría encontrado yo
releyendo lo que acababa de escribir.

## Relacionados

- **R11, R14 y R15** — la misma familia: algo que releer no encuentra porque quien lo escribió ya lo da
  por bueno. Las tres se resuelven con una pasada mecánica y esta línea de la tarea no tiene la suya.
- **R17** — cuenta las condiciones de aceptación para disparar la división. Cuenta las que hay; este
  caso es sobre las que faltan, así que las dos miran el mismo campo por razones opuestas.
- **PROTOCOL, «Lanes»** — ya dice que lo que decide el carril es la superficie y no el tamaño. La regla
  está escrita; lo que falta es el momento en que alguien la aplica sobre una línea ya escrita.

## Cierre

**Resuelto en 0.71.0.** El recorrido de lo que enumeró, contra el fix, los tres tradeoffs y los tres
relacionados:

- **El fix se hizo, y en otro lugar del que proponía.** El caso lo ponía en Ready y dejaba la ubicación
  abierta entre Ready y Classify. Ninguna de las dos sirve, y el propio caso tenía la mitad del
  argumento: Ready no corre en `express` ni en `directo`. La otra mitad es que **Classify tampoco**, y a
  propósito — su prompt dice «no toques […] las tareas que ya declaran las dos cosas», así que poner la
  pasada ahí lo obligaría a reescribir clasificaciones humanas, que es lo que evita.
- **Lo que decidió el lugar fue la circularidad.** Cualquier fase donde viva la revisión del carril es una
  fase que ese carril puede saltar, y la tarea mal marcada `express` es justamente la que se salta todo.
  No existe **ninguna** fase que corra para una tarea que llegó con `[express]` escrito a mano. Por eso la
  pasada vive donde se escribe la línea, que es el único momento en que las cuatro cosas se miran juntas —
  y el gancho ya estaba en «Lanes»: «se toma al escribir la tarea y viaja en su línea».
- **Tradeoff «es una pasada, no una puerta» — se confirma y no cambió.** `check` sigue validando la forma
  y nada más. Lo que se gana es que la falla tenga un momento asignado.
- **Tradeoff «hay un problema de ubicación que no sé resolver desde afuera» — resuelto, y por eso el caso
  hizo bien en no elegir.** Las dos ubicaciones que ofrecía estaban descartadas por razones que sólo se
  ven leyendo el prompt del clasificador y la lista de fases por carril.
- **Tradeoff «cuesta minutos por tarea y los cobra al promover» — se acepta tal cual.** La contrapartida
  que el propio caso midió —seis correcciones sobre cinco tareas, todas antes de escribir código— es lo
  que lo justifica, y no hay forma de cobrarlo más tarde sin caer en la circularidad de arriba.
- **Relacionado «R11, R14 y R15: la misma familia» — se confirma y quedó escrito así.** El párrafo nuevo
  dice por qué releer no lo encuentra, que es lo que las tres comparten.
- **Relacionado «R17 mira el mismo campo por razones opuestas» — sigue siendo cierto y no se tocó.** R17
  cuenta las condiciones que hay; esta pasada busca las que faltan. Conviven sin contradecirse.
- **Relacionado «PROTOCOL, Lanes, ya dice que lo que decide el carril es la superficie» — se apoyó en eso
  en vez de repetirlo.** La pasada manda a leer el carril «contra la superficie que toca y no contra su
  tamaño», que es la regla que ya estaba dos párrafos arriba; escribirla de nuevo la habría duplicado.

**Lo que el caso pedía y no se hizo, con su razón.** No se llevó al PROTOCOL la regla de que un carril sin
aval no reduce ceremonia —el `vouched` que `autobuild` ya aplica—. No hace falta: `autobuild` es más
estricto que lo que el PROTOCOL diría, así que no hay contradicción, y extenderlo al trabajo humano
obligaría a Ready en toda tarea escrita a mano, incluida la que su autor clasificó leyendo la aceptación.
Lo que lo activaría es que aparezca una tarea mal clasificada **después** de esta pasada: ahí la pasada no
alcanzó y el aval humano deja de valer.

**Probado en real, no sólo con la suite.** Una instancia creada con `init` recibe el párrafo y su `check`
sigue verde. Y una instancia creada **antes** del cambio lo recibe al correr `upgrade`, porque
`planning/PROTOCOL.md` está en `SYSTEM_FILES`. La primera versión de esa prueba estaba mal diseñada
—editar el archivo local hace que `upgrade` lo conserve como edición del usuario— y dio el resultado
opuesto: eso es un dato del cierre, no del enunciado.

**Un consumidor que editó su `PROTOCOL.md` no va a recibir esta regla.** Eso no es un defecto: el archivo
está en `SYSTEM_FILES`, cuyo comentario dice que un proyecto que necesite cambiarlos «no los edita: agrega
una regla propia junto a las de `system/`». Conservar lo editado es la protección funcionando.

Y sí se avisa, contra lo que este cierre afirmó primero: `upgrade --check` nombra el archivo —«editado
localmente: planning/PROTOCOL.md»— y `upgrade` cuenta los conservados. La primera redacción decía que no
avisaba nada; se comprobó después de escribirla y era falso.
