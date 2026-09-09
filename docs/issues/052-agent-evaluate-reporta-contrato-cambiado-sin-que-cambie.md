---
caso: 052
titulo: `agent-evaluate` reporta «contrato cambiado» sobre un contrato que no cambió
estado: resuelto
resuelto-en: 0.72.0
prioridad: baja
version-detectada: 0.70.0
---

# 052 — Un falso positivo de «contrato cambiado» que ya recurrió

**🟢 resuelto en 0.72.0** · detectado en 0.70.0 · prioridad **baja** — un clon `--depth 1` le hace
decir a git que todo cambió hoy

## Resumen

Dos cargos registraron, en informes distintos y en semanas distintas, que el recorrido de evaluación
anunció que el contrato del cargo había cambiado cuando no había cambiado. `site-reliability-engineer` lo
reportó dos veces —2026-08-31 y 2026-09-07— y `qa-engineer` una, el 2026-08-29.

Los dos coinciden en que no es un asunto del contrato de su profesión sino del mecanismo compartido, y
por eso ninguno lo llevó a su `sources.yaml` ni a su `SKILL.md`. El de SRE lo dice explícito: «es un
asunto del mecanismo compartido de `agent-evaluate`, no de `sources.yaml`/`SKILL.md`», y deja para quien
consolide la propuesta mensual la decisión de si amerita una nota operativa fuera del cargo.

Con tres observaciones en dos cargos deja de ser un evento aislado, y como no le toca a ningún cargo
resolverlo, sale como caso propio antes de que los informes que lo reportan se cierren y se lo lleven
adentro.

## Reproducción

**Encontrada el 2026-09-09, y no cuesta ni un agente.** Basta un clon a profundidad 1:

```bash
git clone --depth 1 file:///ruta/a/cauce shallow

# La fecha del contrato en los dos árboles:
git -C shallow log -1 --format=%cs -- agents/roles/system/site-reliability-engineer/SKILL.md
git -C /ruta/a/cauce log -1 --format=%cs -- agents/roles/system/site-reliability-engineer/SKILL.md

# Y el aviso, con el mecanismo corriendo:
cd shallow && node -e '
  const { validate } = require("./engine/agents/evaluations.js")
  for (const w of validate(process.cwd(), "site-reliability-engineer").warnings) console.log(w)'
```

```
shallow → 2026-09-09   (el día del clon)
completo → 2026-09-02   (cuando se editó de verdad)
⚠ el contrato cambió el 2026-09-09 y el veredicto más viejo es del 2026-08-18: mide una versión anterior
```

**Lo que decía este párrafo antes:** que la reproducción exigía una corrida real de `agent-eval`, que
costaba agentes y minutos, y que el falso positivo era intermitente. Las tres cosas eran falsas. No es
intermitente: es **determinista** en cualquier checkout truncado, y no ocurre nunca en uno completo. Lo
que lo hacía parecer intermitente es que los cargos lo ven desde CI —donde pasa siempre— y quien mira
el repositorio local no lo ve jamás.

~~**No la tengo, y eso deja el caso incompleto según el README de esta carpeta.**~~ Escribirla exige una
corrida real de `agent-eval` sobre un cargo, que cuesta agentes y minutos, y lo que hay que capturar es
un falso positivo que aparece de forma intermitente: una corrida que no lo muestre no prueba nada.

Lo que sí está establecido es dónde mirar. El recorrido compara el contrato contra algo para decidir si
cambió, y esa comparación es la que hay que instrumentar antes de volver a correr:

```bash
grep -rn "contrato cambiado\|contract changed" agents/ automatization/ engine/
```

Dejarlo escrito sin reproducción es deliberado: el hallazgo existe en tres informes que se van a cerrar,
y perderlo cuesta más que un caso que declara qué le falta.

## Síntoma

Del informe de `site-reliability-engineer` del 2026-09-07, recomendación 4:

> H5 (falso positivo de «contrato cambiado») recurrió una segunda vez, ahora con dos puntos de datos en
> vez de uno. Sigue sin ser una recomendación de cambio de contrato de este cargo — es un asunto del
> mecanismo compartido de `agent-evaluate`.

Del de `qa-engineer` del 2026-09-07, recomendación 3, sobre la misma clase de nota que dejaron los
informes del 2026-08-29 y 2026-08-31:

> un veredicto que pasa a «no pasa» entre corridas del mismo sujeto contra el mismo contrato es señal de
> variar, no de que el caso mida mal.

## Causa raíz

`engine/agents/evaluations.js`, `contractChangedAt`. La fecha sale de git y no del `mtime`, que es
correcto y está bien razonado en su propio comentario:

```js
const git = spawnSync('git', ['-C', dir, 'log', '-1', '--format=%cs', '--', file], { encoding: 'utf8' })
```

Lo que no contempla es un árbol **sin historia**. Un clon `--depth 1` tiene un solo commit y git le
atribuye todo lo que hay adentro, así que `log -1 -- <archivo>` devuelve la fecha de ese commit para
cualquier archivo. `actions/checkout` clona así por defecto, y el job que corre `agent-evaluate` usaba
el default: en CI, **todos** los contratos parecen haber cambiado el día de la corrida.

~~**No encontrada.** No se buscó en el código.~~

## Fix propuesto

Ninguno todavía. El primer paso no es un arreglo sino instrumentar la comparación para que, cuando el
falso positivo aparezca, quede registrado contra qué comparó y qué diferencia encontró. Sin eso, cada
observación nueva vuelve a ser una línea de prosa en el informe de un cargo.

## Tradeoffs

- Un caso sin reproducción ni causa raíz es una anotación, no trabajo listo para tomar. Se marca así a
  propósito: el README pide la reproducción y acá se declara que falta, en vez de inventar una.
- Instrumentar cuesta una corrida de evaluación para comprobar que la instrumentación sirve, y esa
  corrida puede no mostrar el falso positivo.

## Contexto de descubrimiento

Leyendo los veinte informes de la tanda del 2026-09-07 para decidir cuáles mergear. Aparece en la sección
«Recomendación» de dos cargos que explícitamente lo mandan afuera de su propio contrato.


## Cierre

**Resuelto en 0.72.0.** El recorrido de lo que enumeró:

- **El «primer paso» que el caso proponía —instrumentar la comparación— no se hizo, y no hace falta.**
  Se propuso porque la causa raíz no estaba encontrada; encontrarla costó leer el fuente y hacer un clon
  a profundidad 1. Instrumentar habría agregado maquinaria para observar un defecto que se reproduce en
  dos comandos.
- **El motor deja de inventar la fecha.** En un repositorio truncado no devuelve una fecha sino la
  ausencia, y `validate` lo **dice**: «no se puede saber si el contrato cambió… el checkout está
  truncado». Callarse habría cambiado un aviso falso por un silencio, que es la otra forma de que nadie
  se entere (R15).
- **Y el job que evalúa se lleva la historia entera**, porque decir «no se puede saber» deja la pregunta
  sin contestar justo donde el chequeo corre solo. Son las dos mitades y ninguna sobra: `fetch-depth: 0`
  arregla **este** entorno, y el guard del motor arregla cualquier otro checkout truncado — el de una
  empresa, el de un pipeline ajeno.
- **Tradeoff «un caso sin reproducción ni causa raíz es una anotación» — dejó de aplicar.** Ahora tiene
  las dos, y la reproducción es determinista.
- **Tradeoff «instrumentar cuesta una corrida de evaluación que puede no mostrar el falso positivo» — no
  se pagó.** Cero agentes, cero corridas de evaluación: un clon local y dos invocaciones de `git`.

**El caso mezclaba dos observaciones y sólo una era este defecto.** Las tres citas del enunciado no son
lo mismo:

- `site-reliability-engineer` 2026-08-31 y 2026-09-07, y `qa-engineer` 2026-08-29 (H6) — **son este
  defecto**. El de `qa-engineer` ya lo había nombrado bien el 2026-08-29: «un artefacto del checkout, no
  una edición real de hoy».
- `qa-engineer` 2026-09-07, recomendación 3 — **no lo es**. Habla de un veredicto que pasa a «no pasa»
  entre corridas, que es varianza, y de que un caso recién agregado necesita calibrarse. Se separó:
  la varianza ya estaba escrita en `agents/README.md`; **la calibración de un caso nuevo no**, y era lo
  que ese informe pedía «en algún lugar operativo». Quedó como un párrafo en la misma sección: el rojo de
  la primera corrida de un caso prueba que puede fallar, no que falle por lo que dice medir.

**Lo que encontró y el enunciado no preveía: la pista que el propio caso daba no llevaba a ningún lado.**
Su bloque de reproducción proponía `grep -rn "contrato cambiado\|contract changed"`, y esa frase **no
existe en el código** — es la redacción de los cargos, no una salida literal. El mensaje real es «el
contrato cambió el …». Un caso que sugiere dónde buscar sin haber buscado manda a quien lo tome por un
camino que no existe.

**Probado con el mecanismo corriendo**, no con el mapeo en un papel:

```
clon --depth 1, antes:  ⚠ el contrato cambió el 2026-09-09 y el veredicto más viejo es del 2026-08-18
clon --depth 1, después: ⚠ no se puede saber si el contrato cambió… el checkout está truncado
repositorio completo:    ⚠ el contrato cambió el 2026-09-02 y el veredicto más viejo es del 2026-08-18
```

La tercera línea es la que cuida que el arreglo no apague el aviso donde sí funciona.

**La aserción que importa es de ausencia**: que aparezca el aviso nuevo no prueba que el falso haya
dejado de salir — los dos podrían convivir, y ahí el verde diría que ocurrió la mitad del cambio (R9).
La prueba clona a profundidad 1 de verdad y comprueba que «el contrato cambió el» **no** aparece.
Dos mutaciones comprobadas: quitar la detección de shallow del motor, y quitar `fetch-depth: 0` del
workflow. Las dos ponen su prueba en rojo.

## Relacionados

- Ninguno. La observación sobre varianza que este caso había absorbido se cerró contra
  `agents/README.md`, no como caso propio: ya estaba documentada y lo que faltaba era un párrafo.
