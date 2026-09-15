---
caso: 154
titulo: Un recorrido relanzado rehace Build y Triage sobre trabajo que ya está en disco, y nada dice qué reutilizó
estado: resuelto
resuelto-en: 0.92.0
prioridad: alta
version-detectada: 0.90.0
---

# 154 — Reanudar cuesta casi lo mismo que empezar, y no hay forma de saberlo sin sumar a mano

**🟢 resuelto en 0.92.0** · detectado en 0.90.0 · prioridad **alta** — un WIP sin pasos pendientes ya no
paga el agente que construye, y la corrida se anuncia reanudada en vez de verse igual que la primera

> **Medido el 2026-09-15, con una mitad construida y el cableado sin hacer.** `ops contract` existe y deriva
> el contrato sin modelo, que es lo que la opción 2 pedía por su mitad buena. Falta cablearlo, y no por
> trabajo: falta el número que dice si conviene, y ése no se puede sacar de este repositorio. Las citas de
> línea de este caso quedaron viejas y están corregidas abajo.

## Resumen

Una tarea que para antes de Commit deja su trabajo **en disco**: los archivos escritos, el WIP con sus
pasos tildados, el reclamo puesto. Relanzar el recorrido es la forma natural de seguir —el protocolo lo
prevé en sus gates 2 y 3, «verificar los pasos `[x]` en disco y continuar desde el primer `[ ]`»— pero
dos fases se pagan enteras cada vez:

- **`phase('Build')` no tiene ninguna condición** (`autobuild.js:713` en 0.91.0 — el caso decía 784, que
  hoy es una línea de Review). Los `wipActive` de las líneas **466, 513 y 595** —el caso decía 537, 584 y
  666— protegen Claim, Classify y Ready; Build no. Con los nueve pasos del WIP tildados,
  el agente se lanza igual, relee el WIP, comprueba el disco y reporta que no hay nada pendiente.
- **Triage vuelve a derivar el contrato del proyecto en cada corrida.** `contract-digest` lee
  `AGENTS.md`, `workspace.md` y `ops.config.json` y produce el mismo digest; nada de eso cambió entre
  corridas.

Medido sobre una tarea real que necesitó cinco corridas (cuatro paradas antes de Commit, la quinta cerró):

| Fase rehecha | Corridas | Tokens |
|---|---|---:|
| `Build` sobre pasos ya tildados | 3ª, 4ª, 5ª | **~893.000** |
| `Triage` (`contract-digest` + `planning-context`) | las 5 | **~973.000**, de los cuales ~800.000 son re-derivación |

`contract-digest` costó **100.701 tokens, idéntico, tres corridas seguidas**. Es el mismo prompt sobre los
mismos archivos: su resultado no podía ser otro.

## Reproducción

1. Una tarea cuyo recorrido pare antes de Commit —cualquier `not-ready`, `review-failed` o
   `verify-hollow` sirve— dejando el WIP activo con pasos tildados.
2. Corregir lo que la parada pidió y relanzar.
3. Mirar el journal: `Triage/contract-digest` y `Build/build` aparecen de nuevo, con su costo entero.

## Síntoma

**R21 pide exactamente lo que este diseño no permite observar.** Dice que «un mecanismo de reanudación se
comprueba, nunca se supone» y que después de reanudar hay que mirar «cuántas unidades de trabajo nuevas
aparecieron, cuánto se gastó». Hoy eso sólo se puede contestar abriendo el `.output` de cada corrida y
sumando tokens por agente a mano — que es como salió la tabla de arriba. El recorrido no lo dice.

Y el modo de fallo es silencioso en la dirección cara: **la corrida reanudada se ve igual que la primera**.
Nada distingue «Build corrió y construyó» de «Build corrió, miró y no hizo nada», salvo el costo.

## Causa raíz

No es un defecto de implementación sino una decisión que nunca se tomó: el recorrido delega la reanudación
**en el prompt del agente** —el de Build dice «retomá en el primer paso pendiente del WIP; comprobá en el
disco los pasos ya hechos»— en vez de decidirla en el script, donde cuesta cero. El agente hace lo
correcto; lo que se paga es haberlo lanzado para preguntárselo.

## Fix propuesto

1. **Que Build no corra cuando el WIP no tiene pasos pendientes.** ~~El dato ya está leído: `readWip`
   devuelve `complete` y `pending`~~ — **no en el recorrido**: `autobuild.js` no llama a `readWip` y su
   schema `CONTEXT` no declara esos campos, así que `additionalProperties: false` los descartaría aunque
   llegaran. Y `plan.steps` son los pasos que Plan acaba de escribir en esta corrida, sin tildar por
   construcción: no dicen nada de lo hecho antes.

   El arreglo es **más chico** que lo que el caso creía, no más grande: `ops context --json` ya emite
   `wip: { phase, complete, pending }` (`engine/cli/planning.js:178`), y lo que falta es que `readContext()`
   se los pida al transcriptor y el schema los declare. Dos campos, no una lectura nueva.

   **Y sigue sin ser seguro por sí solo.** `autobuild.js:688-693` registra una corrida real donde la fase
   WIP hizo el trabajo entero y Build «encontró todo hecho y lo atribuyó a una corrida anterior», dejando a
   Review, Verify y QA sin ver ese código. Hoy Build, al correr, es lo único que vuelve a contrastar el
   disco; saltearlo por «cero pendientes» camina hacia ese mismo modo de fallo.
2. **~~Cachear el digest del contrato por corrida~~, o derivarlo sin modelo.** La segunda mitad es la
   correcta y **está construida**: `ops contract <ops-root> --json` deriva los diez campos sin modelo.
   Cachear se descartó por diseño, no por gusto: un workflow **no puede hacer I/O** —el runtime le inyecta
   `agent`, `phase` y `log`, nada más—, así que leer una caché también costaría un agente, y encima habría
   que invalidarla. Un comando determinista no tiene qué invalidar y cuesta cero para siempre. Es el mismo
   camino que ya tomó `ops context`, con su razón escrita en `readContext`.
3. **Que la corrida diga qué reutilizó.** Una línea al final —«reanudada: Build salteado por WIP completo;
   contrato desde caché»— convierte una pregunta que hoy cuesta una auditoría en un dato. Es lo que R21
   pide poder mirar, y sin eso la regla no se puede cumplir sobre este recorrido.

El 1 y el 3 son baratos y no dependen del 2.

## Tradeoffs

Saltear Build apoyándose en el WIP confía en que los tildes reflejan el disco, y el WIP lo escribe un
agente. El riesgo es real pero acotado: si un paso quedó tildado sin estar hecho, hoy Build tampoco lo
arregla —el agente lee los mismos tildes— así que el `if` no pierde una garantía que exista. Lo que sí
conviene es que la línea del punto 3 lo diga, para que quien audite sepa sobre qué se apoyó la corrida.

Cachear el digest tiene el riesgo clásico: un contrato que cambia a mitad de sesión. Por eso la condición
es el `mtime` de los archivos que lo componen y no el `run id` solo.

## Contexto de descubrimiento

2026-09-14/15, cerrando `env-schema-yaml` en una instancia sidecar. Cinco corridas, **6,5 M de tokens y un
solo commit**. Las cuatro paradas previas fueron correctas y tres de ellas encontraron defectos reales
—una evitó que un par de credenciales de Basic-Auth se declarara como variable de producción—, así que el
problema no son las paradas: es lo que cuesta cada reintento. Con Build salteado y el contrato cacheado,
las corridas 3, 4 y 5 habrían costado aproximadamente la mitad.

## Lo medido el 2026-09-15

- **Los diez campos del contrato son derivables**, ninguno pide modelo: seis salen de `ops.config.json`
  (362 B), `contracts` de copiar `## Contratos` de `PROTOCOL.md` y `boundaries` de dos secciones. Lo que el
  agente hacía era transcribir.
- **Lo que hoy entra al contexto del modelo** son los cuatro archivos: **29.403 B ≈ 7.350 tokens** sobre el
  molde. Contra los 100.701 que el caso reporta, eso dice que el grueso del costo no son los archivos sino
  el agente: su preámbulo de reglas —el **141** midió 23 KB—, el prompt y la salida.
- **El contrato no se consume una vez.** `SCOPE()` lo reinyecta en el preámbulo de **cada** subagente y
  `LEDGER()` le suma `contracts` entero a las **11** llamadas que escriben planning. Derivarlo sin modelo
  ahorra la llamada de Triage **y puede multiplicar el contexto**, así que el cableado no es automático.
- **Cuánto pesaría, medido:** con los límites crudos, `SCOPE()` daba **2.483 B** por subagente; acotados a
  los tres párrafos que enuncian, **789 B**. `contracts` aporta **3.878 B** más a quien escribe. El recorte
  de límites era necesario y no alcanza.
- **Dónde está el ahorro que queda:** `contracts` son **nueve entradas** y dos concentran el peso —`Tarea`
  946 B y `DONE` 1.374 B—. Las once llamadas reciben las nueve, y ninguna las necesita todas: derivadas, se
  pueden entregar por entrada. Eso es lo que vuelve defendible el cableado, y es trabajo aparte.

**Lo que no se puede medir desde este repositorio, y por eso el cableado espera:** cuánto transcribe de
verdad un modelo en `contract-digest`. El arnés del recorrido declara `contracts: '## Contratos'` y
`boundaries: []`, pero es un guion escrito para que la prueba pase, no una medición. Comparar el literal
contra eso sería comparar mi comando contra mi propio fixture. Hace falta el `.output` de una corrida real
—abrirlo a mano es justamente lo que este caso denuncia—.

## Relacionados

- **141** — resuelto en 0.89.0: el bloque de reglas que cada agente lee al arrancar. Es el piso que
  multiplica todo lo de acá: 23 KB por agente × 46 agentes en esta tarea.
- **151**, **152**, **153** — los otros tres de la misma sesión, sobre el mecanismo de commit y los guards.
- **140** — la familia de «fallar barato en vez de fallar tarde», aplicada a las fases en vez de a la
  aceptación.
- **157** — lo que salió de construir la opción 2: el molde no marca cuáles de sus párrafos son límites, así
  que derivarlos obliga a deducirlo por gramática, y un límite escrito de otra forma no llega a ningún
  agente.

## Cierre

**🟢 resuelto en 0.92.0** · `automatization/workflows/autobuild.js`, `test/workflows/autobuild.test.js`,
`CHANGELOG.md`

Los puntos 1 y 3 se hicieron y son los que el caso llamaba baratos. El 2 sigue sin cablear, y **no se
tacha**: su bloqueo no es trabajo, es un número que no sale de este repositorio.

### Contra lo que el caso enumeró

- **Punto 1, que Build no corra sin pasos pendientes** — **se hizo, y más chico de lo que el caso creía,
  tal como él mismo había corregido.** `CONTEXT` declara `wip: { phase, complete, pending }` y
  `readContext()` se los pide al transcriptor; `ops context --json` ya los emitía. Medido: el campo pesa
  **42 B sobre una salida de 620 B**, así que declararlo no mueve el contexto de nadie.
- **Y su advertencia —«sigue sin ser seguro por sí solo»— se respetó: no se saltea la fase, se saltea la
  llamada.** El caso avisaba que saltear Build camina al modo de fallo donde alguien construyó todo y
  Review, Verify y QA nunca lo vieron. Los cuatro contrastes de la fase —tarea cerrada en Build, rojo sin
  su fallo literal, borde sin prueba, decisiones abiertas— siguen corriendo, y lo que las fases siguientes
  miran es el diff real en disco, venga de la corrida que venga. `reusedBuild()` devuelve `redFirst` y
  `discovered` **vacíos** en vez de rellenarlos: no hubo rojo nuevo que mostrar, y fingirlo sería fabricar
  la evidencia que este recorrido exige para no tener que creerle a nadie.
- **Punto 3, que la corrida diga qué reutilizó** — **se hizo, y sin el canal nuevo que el caso imaginaba.**
  La fase se anuncia `Build (reanudado)`, y como `ran` ya viaja al resultado de la corrida y a la entrada
  de DONE como `fases=…`, el dato llega a los dos lados sin inventar una línea final.
- **Punto 2, derivar el contrato sin modelo** — **construido a medias y sin cablear, declarado y no
  tachado.** `ops contract --json` existe desde 0.92.0 y deriva los diez campos. Lo que falta no es
  trabajo: falta saber cuánto transcribe de verdad un modelo en `contract-digest`, y eso pide el `.output`
  de una corrida real. Medir contra el arnés sería comparar el comando contra su propio fixture. Y el
  propio caso midió por qué el cableado no es automático: `SCOPE()` reinyecta el contrato en **cada**
  subagente y `LEDGER()` suma `contracts` a **11** llamadas, así que derivarlo ahorra una llamada y puede
  multiplicar el contexto. Queda como trabajo con su condición escrita, no como deuda de este cierre.
- **Tradeoff «saltear Build confía en que los tildes reflejan el disco»** — **se paga, y el caso ya había
  establecido que no pierde una garantía que exista**: hoy Build lee los mismos tildes. Lo que pedía era
  que la corrida lo dijera, y eso es exactamente lo que hace `Build (reanudado)`.
- **Tradeoff «cachear el digest tiene el riesgo del contrato que cambia a mitad de sesión»** — **no se
  paga, porque no se cacheó.** El caso ya lo había resuelto al revés: un comando determinista no tiene qué
  invalidar.

### Qué se corrió

- **Reproducción antes de arreglar**, con el arnés del recorrido: con `wipActive: true` el recorrido
  saltea Claim, Classify, Ready, Decompose, Plan, Critique y WIP, y **entra igual a `Build|build`**.
- **Rojo previo** con la condición revertida en una copia desechable: **2 rojas de 34**, y son las dos del
  ahorro y de la marca; las otras 32 quedan verdes.
- **Tres mutaciones**, una por decisión: dejar de mirar `pending` → 1 roja, la de los pasos pendientes;
  anunciar siempre `Build` → 1 roja, la de la corrida reanudada; invertir el default seguro para que una
  instancia sin el campo reanude → **8 rojas** preexistentes, porque romper la compatibilidad rompe el
  camino feliz entero.
- **Medición del efecto**: con `complete: 9, pending: 0` no se pide `Build|build` y las fases quedan
  `Triage → Pick → Build (reanudado) → Review → …`; con `complete: 3, pending: 6` se pide como siempre; sin
  `wip` declarado, también.
