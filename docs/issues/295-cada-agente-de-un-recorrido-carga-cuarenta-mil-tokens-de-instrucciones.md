---
caso: 295
titulo: cada agente de un recorrido carga cuarenta mil tokens de instrucciones
estado: resuelto
resuelto-en: 0.103.4
prioridad: media
version-detectada: 0.103.2
---

# 295 — El piso de contexto de un agente de recorrido en una instancia es de 73.000 tokens, y 41.000 son de Cauce

**🟢 resuelto en 0.103.4** · detectado en 0.103.2 · prioridad **media**.

**Prioridad media**: no rompe nada y se paga en cada corrida. Una tarea `full` con 24 agentes gastó 2,8
millones de tokens para un cambio de 189 líneas; el trabajo escrito fueron 28.000.

## Resumen

Cada agente de un recorrido arranca con el contexto completo de la sesión: el prompt y las herramientas del
runner, y todo lo que el `CLAUDE.md` de la instancia importa —`AGENTS.md`, `PROTOCOL.md` y las cinco reglas—,
más el listado de cargos. Lo paga igual el agente que planifica que el que corre `ops claim` y devuelve una
línea.

## Reproducción

Banco mínimo con Claude Code 2.1.291: una carpeta con un recorrido de un solo agente que corre `echo hola`. Se
lanza desde una sesión real y se lee, en el transcripto del agente, el `usage` de su primera llamada: tokens
nuevos, más los que escribe en caché, más los que lee de ella. Una sesión por variante.

## Síntoma

Tokens de entrada de la primera llamada del agente:

| Variante | Tokens |
|---|---|
| Carpeta sin Cauce | 32.140 |
| Instancia recién instalada | 72.922 |
| La misma, sin los cargos en `.claude/skills` | 68.729 |
| La misma, sin importar las reglas | 51.473 |

De ahí, lo que Cauce le suma a cada agente: **40.782 tokens**.

| Qué | Tokens | Bytes en disco |
|---|---|---|
| Las cinco reglas de `rules/system/` | 21.449 | 52.473 |
| `AGENTS.md`, `PROTOCOL.md` y el `CLAUDE.md` de la instancia | 15.140 | 34.117 |
| El listado de los 53 cargos como skills | 4.193 | — |

De esos 72.922, 18.841 se leen de una caché común a todos los agentes; el resto lo escribe cada uno.

En la instancia real que lo midió por su cuenta el piso fue de 93.000 a 104.000 por agente: suma sus propias
instrucciones y su memoria. Ahí, nueve de los 24 agentes corrieron uno o dos comandos —leer la cola,
reclamar, anotar, commitear planning— y pagaron el piso entero para trabajar entre 7 y 23 segundos.

## Causa raíz

- `automatization/runners/claude/CLAUDE.md` importa con `@` el protocolo y todas las reglas vigentes, y el
  runner le da ese mismo contexto a cada agente de un recorrido.
- `automatization/workflows/autobuild.js` usa un agente para cada paso de oficina —`readContext`, el reclamo,
  soltar, los commits de planning—, porque el recorrido no tiene otra forma de ejecutar un comando.

Qué permite el runner para cargar menos se midió después, y está en «Lo que ofrece el runner».

## Lo que ofrece el runner

De la referencia de workflows de Claude Code y de su documentación de subagentes, comprobado en cada punto
con una sesión real (2.1.291) sobre una instancia de Cauce:

- **Un recorrido no corre comandos sin un agente.** [Documentado: «No direct filesystem or shell access from
  the workflow itself».] No se puede sacar el agente de un paso de oficina; se puede elegir cuál.
- **`agent()` acepta `agentType`**, con los tipos integrados y los que el proyecto define en `.claude/agents/`.
- **Un agente propio puede declarar `omitClaudeMd: true`** y dejar de recibir las instrucciones del proyecto.
  [Verificado: con eso y `tools: Bash`, la primera llamada baja a unos 3.450 tokens.]

El mismo paso —correr un comando del CLI y devolver su salida con un esquema—, por tipo de agente:

| Tipo de agente | Tokens en la primera llamada | Corre comandos que escriben |
|---|---|---|
| El de hoy, por defecto | 73.159 | sí |
| Propio, `tools: Bash` | 42.254 | sí: reclamó una tarea y commiteó |
| Integrado `Explore` | 22.958 | no: se negó a reclamar y a commitear |
| Propio, `tools: Bash` y `omitClaudeMd: true` | 3.444 | sí: corrió el reclamo |

En los cuatro el guard de credenciales frenó un `cat .env`: cambiar el tipo de agente no apaga los guards.

Lo que no se midió: si un agente sin las instrucciones del proyecto commitea respetando sus reglas —rutas por
nombre, sin firmas de IA— cuando sólo las recibe en el pedido. Y `Explore` con un modelo más chico cargó
menos, 13.457, pero usó diez llamadas donde los otros usaron cuatro.

## Fix propuesto

Pide una decisión del dueño, y antes una medición más:

1. **Un agente propio para los pasos de oficina**, sin las instrucciones del proyecto y con sólo Bash: leer
   la cola, el contrato, comprobar una fila, reclamar, soltar, armar el árbol. Cada uno pasa de 73.000 tokens
   a unos 3.500. Los commits de planning son candidatos, con lo que queda sin medir arriba.
2. **Achicar lo que se importa siempre**: dejar en el `CLAUDE.md` lo que toda sesión necesita y mover el resto
   a algo que se cargue cuando hace falta, como los cargos.
3. **Juntar pasos de oficina** en menos agentes: el que lee la cola puede reclamar en la misma vuelta.

## Tradeoffs

- La 2 cambia qué reglas tiene a la vista una sesión cualquiera: una regla que no se cargó no se cumple.
- La 3 hace prompts más largos y mezcla dos responsabilidades en una llamada.
- Los arreglos de 0.103.2 y 0.103.3 suman una llamada por parada, para commitear planning.

## Contexto de descubrimiento

Una instancia real desglosó el gasto de una corrida y encontró que el 90 % era contexto fijo repetido.

## Relacionados

- R16 — el costo es el contexto, no las palabras.
- 293 — parar después de N tareas, que ahorra los agentes del final.

## Avance

El caso sigue abierto: de los tres caminos del fix propuesto se hizo el primero, y los otros dos esperan una
decisión.

### Hecho en 0.103.3: el agente de oficina

`autobuild` corre con `cauce-clerk` los pasos que sólo ejecutan un comando del CLI y devuelven su salida:
leer la cola, comprobar que una fila quedó pendiente, reclamar, soltar y armar el árbol de una tarea. El
agente llega con la instalación del runner de Claude, en `.claude/agents/`.

Quedaron afuera a propósito todo lo que escribe archivos de planning y los commits, que necesitan las reglas
del proyecto.

**Corrida real**, una tarea `lite` con `--max 1` en un banco sidecar: cerró como antes —el producto en su
rama, planning commiteado en `work/planning`—, con diecisiete agentes en ocho minutos. Contando una vez cada
mensaje de sus transcriptos:

| Agentes | Escriben en caché |
|---|---|
| Los 5 pasos de oficina | 24.455 entre los cinco, unos 4.900 cada uno |
| Los 12 que trabajan | de 65.589 a 106.495 cada uno |
| La corrida entera | 1.053.293 |

Con el agente de siempre esos cinco habrían escrito lo que los demás, unos 80.000 cada uno: la corrida habría
rondado 1.430.000. El ahorro es cerca de una cuarta parte.

### El contrato, con el comando que ya existía

Leer el contrato quedó adentro de la oficina. `ops contract --json` existe desde 0.91.0 para esto, y el
cableado esperaba una medición que el caso 154 dejó escrita y nadie había hecho. Hecha, con el paso del
agente y el comando sobre la misma instancia: los ocho campos de configuración iguales, `contracts` igual
salvo el `##` del título, y `boundaries` más corto —732 bytes contra 2.079—, porque el agente le sumaba
frases del resto de `AGENTS.md`. El paso pasó de escribir 78.254 tokens en caché a 5.258.

### Una corrección a este mismo caso

Una versión anterior de esta sección decía que leer el contrato costaba 226.241 tokens y que los agentes que
trabajan escribían hasta ese número. Estaba mal: el recuento sumaba una vez por cada bloque de un mensaje, y
un mensaje con varias llamadas a herramientas contaba varias veces. Los números de arriba cuentan cada
mensaje una vez. Los de la primera llamada de cada agente, que son los de la tabla por tipo, no cambian:
se leen de un solo mensaje.

### Lo que sigue sin tocar

Los doce agentes que trabajan arrancan en unos 75.000 tokens y leen de caché entre 157.000 y 961.000 a lo
largo de sus llamadas. Eso es el camino 2.

### Qué se corrió

- **La medición por tipo de agente**, arriba.
- **Dos corridas reales**, con el recuento por agente sacado de sus transcriptos; la segunda, con el contrato
  ya cableado, es la de la tabla.
- **El contrato por agente y por comando**, en una misma sesión, comparados campo por campo.
- **Tres mutaciones en rojo**, en una copia: la oficina de vuelta al agente de siempre, lo que trabaja mandado
  también por la oficina, y el agente cargando otra vez las instrucciones.
- **La puerta entera**, `npm run ci`.

## Cierre

**Resuelto en 0.103.4.** Lo de 0.103.3 está en «Avance», arriba; acá va lo que faltaba y cómo quedó cada camino.

### El recorrido de lo que este caso enumeró

- **1, el agente de oficina — se hizo, y ahora incluye los commits de planning.** `planning-commit` y
  `planning-block` van con `cauce-clerk`. Era lo que el caso dejaba «sin medir».
- **2, achicar lo que se importa siempre — se hizo distinto.** No se tocó qué importa una instancia. Lo que
  se sacó es la carga de los pasos que no la usan: un segundo agente, `cauce-scribe`, escribe el WIP, la
  entrada de `done/` y la compuerta del hito. No carga las instrucciones del proyecto, tiene herramientas de
  archivo y recibe los formatos de planning en el mismo preámbulo de siempre.
- **2, para los pasos que juzgan — se decidió que no.** `ready`, `plan`, `critique`, `build`, `review`,
  `verify`, `qa` y el commit del producto siguen cargando todo. Ahí las reglas hacen su trabajo, y no hay con
  qué medir qué se pierde al recortarlas: haría falta una batería por fase. Un recorrido más barato que deja
  pasar un defecto sale más caro que los 75.000 tokens.
- **3, juntar pasos de oficina — se decidió que no.** Cada uno cuesta ya entre 3.000 y 6.000 tokens, y
  juntarlos mezcla dos responsabilidades en una llamada para ahorrar eso.
- **Tradeoffs.** El primero no se paga: ninguna sesión perdió una regla. El tercero se achicó: la llamada que
  commitea una parada bajó de unos 62.000 tokens a unos 6.000.
- **`closing` — queda como estaba.** Corre `check` y trae las lecciones, pero si `check` sale en rojo repara
  estado derivado, y eso es juzgar.

### Lo que este caso encontró y no preveía

**Un agente que no carga las reglas firma los commits.** En la primera corrida real con los commits de
planning en el agente de oficina, los tres salieron con `Co-Authored-By`. R8 lo prohíbe, quien carga las
reglas lo cumple solo y ningún guard lo mira. Ahora lo prohíbe cada prompt que commitea. Que un guard lo
compruebe es otra decisión y no se tomó acá.

### Qué se corrió

- **Dos corridas reales con el motor de esta rama**, en bancos sidecar: una tarea `lite` que cierra el hito,
  y una que frena en Build porque borra una prueba. Tokens escritos a caché por paso, contando cada mensaje
  una vez, contra las corridas de hoy anteriores a este cambio. Los pasos nuevos se midieron en cuatro
  corridas: estas dos y las dos de antes del aviso de la firma, que ya llevaban los mismos agentes:

  | Paso | 0.103.3 | 0.103.4 | Agente |
  |---|---|---|---|
  | `wip` | 86.675 a 101.604 | 29.643 a 65.374 | `cauce-scribe` |
  | `done` | 84.726 a 110.385 | 42.031 y 44.138 | `cauce-scribe` |
  | `human-checkpoint` | 76.876 | 17.688 y 19.944 | `cauce-scribe` |
  | `planning-commit` | 66.017 a 69.452 | 3.875 y 3.936 | `cauce-clerk` |
  | `planning-block` | 62.346 | 6.315 y 6.348 | `cauce-clerk` |

  El `wip` de 65.374 es uno de cuatro; los otros tres quedaron entre 29.643 y 31.260. Por qué, abajo.

  La primera llamada del agente de escritura trae entre 8.572 y 13.348 tokens: es el preámbulo con los
  formatos. El total de una corrida no se compara acá, porque varía más por lo que hacen los agentes que
  juzgan que por este cambio.
- **Lo que dejaron en disco.** `ops check` válido en los dos bancos. La entrada de `done/` con sus campos y
  el sufijo `(app@feat/resta-dos-numeros)`, el WIP en `IDLE`, la compuerta con `status: pendiente`. Los
  commits con el mensaje exacto, sólo archivos de planning, en `work/planning` y sin firma.
- **Los guards los contienen igual.** En la corrida que frena, el único freno fue el del borrado de la
  prueba, y la parada quedó commiteada por el agente de oficina.
- **La firma, en rojo y en verde.** Corrida real antes del aviso: tres commits con `Co-Authored-By`. Las dos
  corridas de después: ninguno.
- **Ocho mutaciones en rojo, en una copia**: cada uno de los cinco pasos devuelto al agente de siempre, el de
  escritura sin los formatos, cargando las instrucciones, y sin herramientas de archivo.
- **La puerta entera**, `npm run ci`.

### Segunda tanda, antes de empujar

- **Una tarea `full` seguida de una `lite`, en la misma corrida.** Cerró las dos y escribió la compuerta: 35
  agentes, `ops check` válido, dos entradas en `done/` y tres commits de planning sin firma. En la `full`,
  `done` escribió 42.395 tokens y `wip` 30.527; en la `lite` que le siguió, 30.310 y 25.297. La segunda tarea
  arrancó sobre la cola y el WIP que dejó la primera.
- **Aprobar un borrado y retomar.** La primera corrida frenó en Build con el WIP escrito por el agente de
  escritura. Aprobado el borrado, la segunda retomó desde ese WIP —sus fases fueron Triage, Pick, Build,
  Review, Verify, QA, Commit, Done—, borró la prueba y cerró la tarea.
- **Actualizar una instancia.** Banco con 0.103.3 de npm, y encima un paquete armado con `npm pack` desde
  esta rama. Después de `upgrade` y antes de reinstalar el runner, quedan el recorrido viejo y sólo
  `cauce-clerk`: el recorrido instalado no nombra un agente que falte. `automation doctor` lo dice
  —«falta .claude/agents/cauce-scribe.md»— y `upgrade` pide reinstalar. Con `make install-claude` quedan los
  dos agentes y el recorrido nuevo, y `doctor` sale sin advertencias. El paquete de prueba llevaba la versión
  0.103.3, porque la sube el PR de release: lo que se probó es el mecanismo, no el salto de número.
- **Por qué un `wip` escribió 65.374.** Se leyó su transcripto. El prompt decía «escribí el WIP» sin decir en
  qué archivo, y el agente de escritura lo buscaba en el fuente del motor: en esa corrida abrió `parser.js`
  entero. En las demás lo buscó con menos suerte o más, siempre con cuatro o cinco llamadas de más. Ahora el
  prompt nombra el archivo. Corrida real después del cambio: cuatro llamadas —listar la carpeta, leer su
  README, escribir, responder— y 15.616 tokens.
- **Lo que no se corrió**: una instancia real, donde la entrada de `done/` lleva más hechos que en un banco.
