---
caso: 295
titulo: cada agente de un recorrido carga cuarenta mil tokens de instrucciones
estado: abierto
prioridad: media
version-detectada: 0.103.2
---

# 295 — El piso de contexto de un agente de recorrido en una instancia es de 73.000 tokens, y 41.000 son de Cauce

**🔴 abierto** · detectado en 0.103.2 · prioridad **media**.

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

Quedaron afuera a propósito: leer el contrato, que resume cuatro documentos; todo lo que escribe archivos de
planning; y los commits, que necesitan las reglas del proyecto.

**Corrida real**, la misma tarea `lite` con `--max 1` en un banco sidecar: cerró igual que antes —el producto
en su rama, planning commiteado en `work/planning`—, con dieciocho agentes. Los cuatro pasos de oficina de esa
corrida escribieron 19.513 tokens en caché entre todos; cada uno de los otros catorce, entre 79.814 y
226.241. Con el agente de siempre esos cuatro habrían estado en el rango de los demás.

### Lo que esa corrida mostró y no se tocó

- **Leer el contrato es el paso más caro, 226.241 tokens.** Lee `AGENTS.md`, `PROTOCOL.md`, `workspace.md` y
  la configuración con sus herramientas, y los dos primeros ya los trae cargados por las instrucciones del
  proyecto: los paga dos veces.
- Los catorce agentes que trabajan siguen arrancando en unos 75.000 tokens. Eso es el camino 2.

### Qué se corrió

- **La medición por tipo de agente**, arriba.
- **La corrida real**, con el recuento por agente sacado de sus transcriptos.
- **Tres mutaciones en rojo**, en una copia: la oficina de vuelta al agente de siempre, lo que trabaja mandado
  también por la oficina, y el agente cargando otra vez las instrucciones.
- **La puerta entera**, `npm run ci`.
