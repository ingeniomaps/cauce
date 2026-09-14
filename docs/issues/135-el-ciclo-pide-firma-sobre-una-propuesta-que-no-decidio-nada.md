---
caso: 135
titulo: El placeholder de una revisión no empieza con «Por definir», así que el único criterio que detecta una propuesta sin decidir no la ve: se firma, se mergea y se sella como aplicada
estado: resuelto
resuelto-en: 0.88.0
prioridad: alta
version-detectada: 0.87.0
---

# 135 — Una revisión sin decidir pasa todas las puertas, incluida la que existe para frenarla

**🟢 resuelto en 0.88.0** · detectado en 0.87.0 · prioridad **alta** — el ciclo consumió siete firmas
humanas reales sobre documentos que no deciden nada, y el ciclo podía cerrarse sobre ellos

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
- `engine/agents/learning-seal.js:46-51` — **acá está el defecto, y no es que la puerta corra tarde: es
  que no ve este placeholder.** `undecided` es `(value) => !value || /^(por definir|pendiente)\b/i.test(value)`,
  o sea que reconoce lo que **empieza** con esas dos palabras. El molde de una propuesta nueva empieza con
  «Por definir tras revisar los hallazgos» (`learning.js:386`) y el de un recorrido con «Por definir. Lo que
  se corrige es el recorrido» (`:274`): los dos quedan atrapados. El de una revisión empieza con «Una
  revisión suele **no** ser aditiva» y **pasa**.

  Medido: `undecided()` devuelve `false` sobre la sección «Cambio propuesto» de
  `qa-engineer/learning/proposals/2026-09-r2.md`. Y corrido de punta a punta sobre un banco desechable, una
  revisión firmada con el placeholder intacto **se sella**: `ops learn probe-engineer --applied --period
  2026-09` sale con 0 y deja el documento en `status: applied` con «- Estado: aplicada» y el texto del molde
  adentro. El ciclo llega a su estado terminal sin que nadie haya decidido nada.

El código ya razonó sobre este daño en otro lugar y por eso duele más: `prepareProposal` se niega a abrir
documento sin material, y su comentario dice «Que sea un andamio en blanco no la abarata —cuesta la misma
firma humana— y encima llega indistinguible de una con hallazgos en la lista de PR». Es exactamente esto,
un paso más adelante: el documento tiene hallazgos y aun así no decide nada.

## Fix propuesto

No está decidido. Tres formas, y la elección cambia quién hace el trabajo.

1. **Que el placeholder de una revisión empiece por «Por definir», como las otras dos ramas.** Es una línea
   de prosa en `learning.js:130`, y con ella el criterio que ya existe —y que hoy no se cambia— pasa a verla.
   Deja las tres ramas del molde diciendo lo mismo de la misma forma, que es lo que hace que el criterio
   único funcione. No agrega puerta ni acopla `seal` al texto del molde.
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

## Cierre

**🟢 resuelto en 0.88.0** · `engine/agents/learning.js`, `engine/agents/learning-files.js`,
`engine/agents/learning-seal.js`, `test/agents/learning.test.js`

Hicieron falta **dos** cambios, y el segundo apareció porque el primero se comprobó contra lo real en vez
de darlo por bueno.

El primero es la **opción 1**: el placeholder de una revisión empieza por «Por definir», como los de una
propuesta nueva y los de un recorrido. Con eso el criterio que ya existía —`/^(por definir|pendiente)\b/`—
ve lo que se componga de ahora en más. **No alcanzaba**: los documentos ya escritos no cambian, y los
siete que originaron el caso seguían sellándose. El segundo mueve ese criterio al módulo que comparten el
que compone y el que sella —`learning-files.js`— y le agrega el molde viejo **por coincidencia exacta**.

Tiene que ser exacta y eso se midió: quien redacta suele continuar la frase del molde en vez de borrarla
—`qa-engineer/2026-08-r2.md` dice «Una revisión suele no ser aditiva, **y ésta lo es en parte**: …» y
decide de verdad—, así que comparar por el principio marcaría como vacío lo que está lleno. No se agregó
ninguna
puerta nueva ni se acopló `seal` al texto del molde.

### Contra lo que el caso enumeró

- **Resumen: «quien recibe el PR firma un documento que no decidió nada»** — arreglado en la raíz. El
  documento sigue llegando al PR, pero ya no puede terminar el ciclo: firmarlo y sellarlo falla con
  código 2 y el mensaje «todavía no la decidió nadie».
- **Causa raíz: `undecided` no ve el placeholder de revisión** — es lo que se arregló, y se comprobó por
  los dos lados: `false` antes, `true` después, sobre el texto literal del molde.
- **Causa raíz: el job abre el PR sin avisar** — **se decidió que no se toca**, y la razón es que dejó de
  hacer falta por donde importaba. El PR sigue abriéndose igual, pero el documento ya no puede llegar a
  `applied` sin que alguien escriba el cambio, que es el daño que este caso perseguía. Cambiar además el
  cuerpo del PR sería una segunda señal para una condición que ahora se frena sola.
- **Opción 1** — es la construida, aunque **no como el caso la había escrito**: el caso proponía bajar la
  puerta de `seal` a `propose` reusando `learning-seal.js`, y medir mostró que ese reuso era imposible
  porque el criterio **no veía** el placeholder. Arreglar el molde en vez de agregar una puerta resultó
  más chico y dejó las tres ramas diciendo lo mismo de la misma forma.
- **Opción 2, que el PR lo diga** — se decidió que no, por lo dicho arriba.
- **Opción 3, que el ciclo corra `/agent-propose`** — se decidió que no acá: mete un modelo en un job
  diseñado a propósito sin ninguno, y el defecto se cerraba sin eso. Sigue siendo el paso que falta para
  que el ciclo se complete solo, y eso es trabajo de otra unidad.
- **«Las siete propuestas ya firmadas hay que resolverlas»** — **el caso sí tuvo que ocuparse de ellas, y
  descubrirlo costó una afirmación falsa.** Este cierre decía «con el arreglo puesto ninguna puede
  sellarse» cuando el arreglo era sólo el del molde, y medirlo contra las siete mostró lo contrario: las
  siete se sellaban, **exit 0 y `status: applied`**. Es el modo de fallo que R9 nombra —comprobar que lo
  nuevo aparece y no que lo viejo se fue—: lo había verificado en un banco sintético y no contra los
  documentos que originaron el caso. De ahí salió el segundo cambio. Escribirles el cambio y volver a
  firmarlas, o archivarlas, sigue siendo trabajo de quien las tenga; lo que ya no pueden es cerrar el
  ciclo solas.
- **Tradeoff «la opción 1 hace que el ciclo produzca menos»** — no ocurrió: no se tocó cuándo se abre un
  PR, así que el ciclo produce lo mismo.
- **Tradeoff «el placeholder no es el defecto»** — se respetó: el texto conserva entera su instrucción y
  sólo se le antepuso «Por definir».
- **Prioridad alta** — sostenida: el daño era que el ciclo llegaba a `applied` sin decisión.

### Lo que el caso no preveía

- **El caso afirmaba que la comprobación existía y «corría tarde», y era falso.** Medido: `undecided()`
  devuelve `false` sobre el placeholder de revisión, y una revisión firmada con el molde adentro **se
  sellaba** —`status: applied`, «- Estado: aplicada», salida 0—. No era una puerta tardía: era una puerta
  que no veía. El caso se corrigió antes de arreglarlo.
- **El discriminador es cuál de los tres moldes se usa.** Las otras dos ramas —propuesta nueva
  (`learning.js:386`) y recorrido (`:274`)— empiezan con «Por definir» y siempre estuvieron cubiertas. El
  defecto era exclusivo de las revisiones, que son las que abre un cargo que ya aplicó su propuesta del
  período.

### Qué se corrió

- **Rojo previo, en copia por `tar` y con verde de control antes**: 24/24 intactas; al revertir el «Por
  definir. » del molde, **24 → 23 pass / 1 fail**, y la que muere es «una revisión recién compuesta no se
  puede sellar, porque nadie decidió el cambio». La otra mutación —revertir `nested()`— **no la toca**, así
  que cada prueba cuida lo suyo.
- **Contra el banco desechable, de punta a punta**: antes del arreglo, firmar la revisión con el
  placeholder y correr `learn probe-engineer --applied --period 2026-09` salía **0** y dejaba
  `status: applied`. Después, sale **2** con «todavía no la decidió nadie» y el documento queda en
  `status: proposed`.
- **Contra las siete propuestas reales, en copia por `tar`** — la medición que faltaba y que destapó el
  segundo hueco. Con el primer arreglo: **7 de 7 con exit 0 y `status: applied`**. Con el segundo: **7 de
  7 con exit 2**, el mensaje «todavía no la decidió nadie» y las siete quedando en `status: proposed`.
- **El falso positivo, que era el riesgo del segundo arreglo**: una revisión que continúa la frase del
  molde para decir qué cambia **sigue sellando** —exit 0, `status: applied`—. Marcar de más habría roto
  trabajo legítimo, y es lo que le pasó a `qa-engineer/2026-08-r2.md` si el criterio mirara el principio.
- **Verde**: `npm run ci` en 0, **813 pruebas** y la cobertura de `learning-files.js` en 93,94 % de ramas
  contra un piso de 92 %.
