---
caso: 135
titulo: El ciclo abre el PR y pide la firma humana sobre una propuesta cuyo «Cambio propuesto» sigue siendo el texto del molde, y eso sólo se descubre al aplicar
estado: abierto
prioridad: alta
version-detectada: 0.87.0
---

# 135 — Se firman propuestas que no deciden nada, y el rechazo llega cuando la firma ya se gastó

**🔴 abierto** · detectado en 0.87.0 · prioridad **alta** — el ciclo consumió siete firmas humanas reales
sobre documentos que `agent-promote` no puede aplicar

## Resumen

El ciclo de aprendizaje escribe la propuesta en dos tiempos, y sólo el primero está automatizado:

1. `ops learn <cargo> --proposal` compone el documento desde los informes y los veredictos. La sección
   **«Cambio propuesto» queda con el texto del molde**, que es una instrucción dirigida a quien va a
   redactar, no una decisión.
2. `/agent-propose` la llena: «el texto exacto a agregar o reemplazar, archivo por archivo»
   (`automatization/workflows/agent-propose.js:79`).

El job `propose` de `.github/workflows/agent-learning.yml` corre **el primero** y abre el PR directo. El segundo no lo corre
nadie, y nada avisa que falta. Quien recibe el PR firma un documento que no decidió nada.

El rechazo existe y llega tarde: `agent-promote` se detiene con `propuesta-vacia` —«no la decidió nadie:
corré `/agent-propose` primero»— cuando la firma ya se gastó y el PR ya se mergeó.

**Ocurrió hoy con siete cargos.** `qa-engineer`, `security-engineer`, `release-manager`,
`kyc-aml-specialist`, `frontend-engineer`, `finops-engineer` y `database-administrator`: las siete
propuestas `2026-09-r2` traen la misma sección «Cambio propuesto», carácter por carácter, y las siete
están firmadas y mergeadas en `main`.

## Reproducción

Con un cargo propio, un veredicto en rojo sin sellar y una propuesta anterior ya aplicada —para que el
motor tome el camino de revisión—:

```bash
node engine/cli/ops.js init "$BANCO/demo-ops" --name Demo --mode sidecar --no-install
# agents/roles/probe-engineer/ con SKILL.md, un evaluations/results/ en rojo
# y learning/proposals/2026-09.md con status: applied
cd "$BANCO/demo-ops" && node <engine>/cli/ops.js learn probe-engineer --proposal
```

## Síntoma

Corrido el 2026-09-14:

```
+ agents/roles/probe-engineer/learning/proposals/2026-09-r2.md
  0 informe(s) semanal(es) incluidos
```

Y el documento generado trae:

```
## Cambio propuesto

Una revisión suele **no** ser aditiva: reemplaza texto que la propuesta anterior agregó. Decilo
explícitamente y decí por qué la aditividad no aplica acá — vale para lo que ya rindió sus casos, no para
un texto que acaba de fallar su primera medición.
```

Eso es `engine/agents/learning.js:130-132` literal. No dice qué cambia: dice cómo habría que escribir lo
que cambia.

## Causa raíz

El placeholder es deliberado y correcto —el motor no habla con ningún modelo y no puede decidir un
cambio—. Lo que falta es que alguien note que sigue ahí antes de pedir una firma.

- `engine/agents/learning.js:128-132` — el molde de `reviseProposal`.
- `engine/agents/learning.js:384-386` — el de una propuesta nueva: «Por definir tras revisar los
  hallazgos». El mismo hueco por la otra rama.
- `.github/workflows/agent-learning.yml`, paso «Open proposal pull request» — abre el PR con el cuerpo
  «Propuesta automática construida desde los informes semanales. No modifica SKILL.md y requiere
  evaluación y aprobación humana». Dice que requiere aprobación; no dice que **todavía no hay nada que
  aprobar**.
- `automatization/workflows/agent-promote.js:100` — `stop('propuesta-vacia')`, el rechazo que llega tarde.
- `engine/agents/learning-seal.js:46-51` — **la comprobación ya existe**: `undecided(change)` rechaza
  «por definir» y «pendiente». Pero corre al **sellar**, que es el último paso del ciclo.

El código ya razonó sobre este daño en otro lugar y por eso duele más: `prepareProposal` se niega a abrir
documento sin material, y su comentario dice «Que sea un andamio en blanco no la abarata —cuesta la misma
firma humana— y encima llega indistinguible de una con hallazgos en la lista de PR». Es exactamente esto,
un paso más adelante: el documento tiene hallazgos y aun así no decide nada.

## Fix propuesto

No está decidido. Tres formas, y la elección cambia quién hace el trabajo.

1. **Que la puerta baje de `seal` a `propose`.** El job comprueba el placeholder antes de abrir el PR y,
   si sigue ahí, no lo abre: deja la propuesta en la rama y lo dice en una anotación. Reusa
   `engine/agents/learning-seal.js`, así que el criterio queda en un solo lugar. El costo es que el ciclo automático deja
   de producir PRs hasta que alguien corra `/agent-propose`, que es la verdad de lo que pasa hoy.
2. **Que el PR lo diga.** El cuerpo del PR y el título marcan «sin cambio decidido», y el guard de
   propuestas falla el check. Más barato, y deja la decisión en quien lee — pero sigue pidiendo una firma
   que no sirve.
3. **Que el ciclo corra `/agent-propose`.** Es el paso que falta, pero necesita un modelo y el job
   `propose` fue diseñado a propósito sin ninguno («Este job no habla con ningún modelo»). Cambiarlo
   mueve el costo y la superficie del ciclo.

Cualquiera que se tome, **las siete propuestas ya firmadas hay que resolverlas**: o se les escribe el
cambio y se vuelven a firmar, o se archivan. Mientras sigan sin aplicar, esos siete cargos no abren
propuesta nueva —`prepareProposal` devuelve `created: false` si la anterior no está aplicada—.

## Tradeoffs

- **La opción 1 hace que el ciclo produzca menos**, y eso se va a leer como una regresión. No lo es: hoy
  produce documentos que no se pueden aplicar.
- **La opción 2 es la más barata y la que menos arregla.** Un aviso en el cuerpo del PR no impide firmar,
  y lo que este caso muestra es que se firma igual.
- **La opción 3 es la única que cierra el ciclo solo**, y es la que más cambia: mete un modelo en un job
  que deliberadamente no lo tenía.
- **El placeholder no es el defecto** y conviene no «arreglarlo»: sin él, quien redacta no sabe qué se
  espera. Lo que falta es la comprobación, no el texto.

## Prioridad

**Alta.** No rompe ninguna puerta y el daño es de los caros: consumió siete firmas humanas —el recurso que
todo el ciclo existe para proteger— y dejó siete cargos sin poder proponer hasta que se resuelvan. Y el
modo de fallo es silencioso en los dos extremos: el PR se ve igual que uno bueno, y el rechazo aparece
semanas después, en otro comando.

## Contexto de descubrimiento

Salió al intentar aplicar las siete propuestas del 2026-09-r2, después de firmarlas y mergearlas. La
comparación con la revisión 1 de `qa-engineer` —que sí se aplicó— lo dejó claro: su «Cambio propuesto» dice
«Agregar la conducta requerida `contrasts_the_summary_against_the_source_enumeration` a
`expected-behaviors.yaml`, con un caso que la mida», y su historia de git muestra el paso que falta hoy:
`3845eaf1 propose 2026-09 learning review` (automático), después `96a56adc say what the 2026-09 proposal
changes` (el cambio, escrito aparte), y recién después la firma.

## Relacionados

- **136** — la otra mitad de lo que esa misma corrida destapó: el detalle de un veredicto en rojo arrastra
  los encabezados de la respuesta del cargo hacia la propuesta.
