---
caso: 141
titulo: El bloque de reglas viaja entero en el contexto de arranque y nadie mide cuánto pesa, así que escribir una regla propia cobra un peaje que no se ve
estado: abierto
prioridad: media
version-detectada: 0.87.0
---

# 141 — El contexto de arranque trae todas las reglas, y nada dice lo que eso cuesta

**🔴 abierto** · detectado en 0.87.0 · prioridad **media** — el bloque de reglas viaja en el contexto de
arranque y nadie mide cuánto pesa; **cuántas veces se paga está sin verificar** y de eso depende el número

## Resumen

`automation install` escribe en `CLAUDE.md` y `GEMINI.md` un bloque delimitado que importa **todas** las
reglas vigentes: las del sistema que el proyecto no sobrescribió, y todas las propias. Reproducido en una
instancia sidecar limpia con dos reglas propias agregadas:

```
<!-- cauce:reglas inicio — lo reescribe "automation install" con las reglas vigentes -->
@<empresa>-ops/planning/rules/system/code-shape.md
@<empresa>-ops/planning/rules/system/commits.md
@<empresa>-ops/planning/rules/system/conduct.md
@<empresa>-ops/planning/rules/system/process.md
@<empresa>-ops/planning/rules/P1-puertos.md
@<empresa>-ops/planning/rules/P2-identidad.md
<!-- cauce:reglas fin -->
```

Las del sistema son **cuatro**, no doce: las doce de la instancia que originó el caso son esas cuatro más
ocho propias. El piso que Cauce impone a todos son **39.236 bytes ≈ 10 K tokens**, con `conduct.md`
llevándose el 41 %; el resto lo agrega cada proyecto, que es donde vive el incentivo torcido del Síntoma.

### La afirmación de la que cuelga todo, y está sin verificar

> **Hipótesis.** Que **cada subagente** cargue ese bloque depende de si el runner lee su archivo de
> contexto una vez por sesión o una vez por agente. Eso es mecanismo de una herramienta de terceros y no
> se puede establecer leyendo este repositorio: el manifiesto sólo declara que `CLAUDE.md` se instala en
> la raíz. **Si se carga una sola vez, el costo es 10 K tokens por corrida y este caso es menor.**
>
> Lo resuelve una corrida de `autobuild` mirando el journal: el agente de `ops claim` hace **3 llamadas a
> herramienta** y no lee ningún archivo, así que su gasto es casi todo contexto de arranque. Decenas de
> miles de tokens ahí significan que el bloque viaja por agente; unos pocos miles, que no.

### La cuenta corregida

El caso sumaba `AGENTS.md`, `PROTOCOL.md` y las reglas en un solo total de 92.910 bytes y lo multiplicaba
por once agentes, para **~253.000 tokens**. Medido, esas piezas no se pagan igual:

| Qué | Cuánto | Con qué frecuencia |
| --- | --- | --- |
| `AGENTS.md` + `PROTOCOL.md` | 33 KB ≈ 8 K tokens | **una vez por corrida** |
| Bloque de reglas del sistema | 38 KB ≈ 10 K tokens | por agente, **si la hipótesis se sostiene** |

`AGENTS.md` y `PROTOCOL.md` **no entran por el bloque** —sólo importa `planning/rules/*.md`— y el propio
recorrido los lee una vez en Triage y los reenvía como texto: «el contrato se lee una sola vez por corrida
y viaja como texto: ningún subagente relee AGENTS.md, workspace.md, ops.config.json ni PROTOCOL.md»
(`autobuild.js:316-317`). Con la hipótesis en pie el piso son **~108 K tokens**, no 253 K.

### Lo que el recorrido ya resuelve, y el caso daba por perdido

El caso dice que «el recorrido optimiza lo que puede y esto no lo puede tocar». La primera mitad es
cierta y la segunda es más matizada: `autobuild.js:349-350` ya tomó exactamente esta decisión para las
reglas —«viajan las rutas y no el texto: el preámbulo se reenvía a cada subagente que toca código, y el
texto de las reglas multiplicaría su tamaño por cada uno»—, y `SCOPE()` entrega las rutas con la orden de
leer sólo las que toquen la fase.

O sea que el recorrido **ya hace** lo que la opción 2 propone, por su lado. Lo que no puede evitar es el
bloque que `install` escribió en el archivo de contexto, que se carga antes de que el recorrido opine.

## Reproducción

Lo que el bloque **contiene** se reproduce en una instancia limpia, y está medido arriba:

1. `ops init <empresa>-ops --mode sidecar`, y agregarle dos reglas propias en `planning/rules/`.
2. `automation install . claude` reescribe el bloque con las cuatro del sistema más las dos propias.
3. Sumar los tamaños de lo que el bloque importa: 39.236 bytes sólo con las del sistema.

Lo que **no** queda reproducido es cuántas veces se paga. La observación que lo sugiere viene de la
corrida que originó el caso: el agente más barato —el de `ops claim`, con **3 llamadas a herramienta** y
sin leer ningún archivo— gastó **86.567 tokens**, y no hay prompt ni salida que explique esa cifra. Es
evidencia fuerte de una sola corrida, no una comprobación: para eso hay que repetir el paso 3 de la
sección anterior y leer el journal.

## Síntoma

El incentivo queda al revés de lo que el toolkit promueve en todos lados. Cauce pide escribir las reglas
propias —P1..Pn junto a `system/`, con su razón y su evidencia—, y cada una que se escribe **encarece
todas las corridas futuras de todos los agentes**, para siempre y sin aviso. Una regla de dos páginas que
importa en una tarea de cada cien se lee cien veces.

Y no hay forma de medirlo desde adentro: nada reporta cuánto pesa el bloque ni cuántos agentes lo pagaron.
Nosotros lo vimos sumando los tamaños a mano después de una corrida cara.

## Fix propuesto

1. **Que el bloque diga cuánto pesa.** Una línea en `install` —«reglas: 6 archivos, 47 KB, ~12 K tokens en
   el contexto de arranque»— convierte una decisión invisible en una informada. Es lo más barato y ya sería
   suficiente para que un proyecto decida. El número que declare tiene que ser el del bloque, sin sumarle
   lo que se lee una vez por corrida.
2. **Reglas por superficie.** Cada regla ya declara de qué habla; las de puertos, identidad de git o
   trampas de un stack no le sirven a un agente que clasifica una tarea. Que el frontmatter pueda declarar
   cuándo aplica, y que el bloque importe siempre las del sistema y las propias marcadas como `siempre`,
   dejando el resto para que el agente las lea cuando toque esa superficie.
3. **Que `check` avise pasado un umbral**, como ya avisa por las entradas de DONE sin `lane:`. Un aviso a
   partir de, digamos, 60 KB, nombrando los tres archivos más grandes.

**El orden depende de la medición pendiente, y la 1 no.** Que el bloque no diga lo que pesa es un hueco
igual si se carga once veces que si se carga una: hoy escribir una regla propia es una decisión sin número
a la vista, y el 1 lo pone. Se puede hacer sin esperar nada.

El 2 es el arreglo real **sólo si la hipótesis se sostiene**, y hay un dato que la vuelve menos urgente de
lo que el caso suponía: el recorrido ya entrega rutas en vez de texto a cada subagente que toca código, así
que lo que la opción 2 ahorraría es el bloque del archivo de contexto, no el preámbulo. Si el bloque se
carga una sola vez por sesión, cambiar el contrato de las reglas de todas las empresas ahorraría 10 K
tokens por corrida — y costaría el riesgo que nombran los Tradeoffs.

## Tradeoffs

Cargar una regla a demanda significa que un agente puede no leerla cuando sí correspondía, y eso es peor
que pagarla: una regla que no se leyó no existe. Por eso el 2 debe ser explícito del proyecto y nunca
inferido — el default seguro es el de hoy, y lo que falta es poder elegir.

## Contexto de descubrimiento

Auditoría de una corrida real de `autobuild` el 2026-09-14, buscando por qué una tarea `express` que borró
tres archivos costó 1,2 M de tokens. El desglose que salió de ahí: 21 % piso de arranque, 31 % tres pasadas
de Verify por una aceptación mal escrita (caso **140**), 17 % una fase de clasificación que la propia línea
de la tarea podía haber evitado, y el resto trabajo real.

Ese 21 % es el número que la sección «La cuenta corregida» revisa: salía de multiplicar por agente algo que
en parte se paga una vez. Contrastado contra el fuente el 2026-09-14, el piso atribuible al bloque queda en
~9 % **si** la hipótesis se sostiene, y en una fracción de eso si no. Los otros tres tramos del desglose no
se volvieron a medir y siguen como estaban.

## Relacionados

- **140** — el otro hallazgo de la misma corrida: la aceptación imposible que se descubre tarde.
- **OPS-005** — el catálogo vive en el paquete justamente para no copiarse a cada instancia; esto es la
  misma idea aplicada a lo que se inyecta en cada agente.
