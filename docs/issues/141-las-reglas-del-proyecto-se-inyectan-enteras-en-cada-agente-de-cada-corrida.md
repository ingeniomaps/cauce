---
caso: 141
titulo: El bloque de reglas viaja entero en el contexto de arranque y nadie mide cuánto pesa, así que escribir una regla propia cobra un peaje que no se ve
estado: abierto
prioridad: media
version-detectada: 0.87.0
---

# 141 — El contexto de arranque trae todas las reglas, y nada dice lo que eso cuesta

**🔴 abierto** · detectado en 0.87.0 · prioridad **media** — **verificado el 2026-09-14**: el bloque viaja
en el contexto de **cada** agente, son ~16 K tokens por agente, y nada lo mide

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
ocho propias. Pesan **39.236 bytes**, con `conduct.md` llevándose el 41 %, y el resto lo agrega cada
proyecto — que es donde vive el incentivo torcido del Síntoma. El bloque no es todo lo que viaja: la
sección «La cuenta corregida» tiene el piso completo, porque `CLAUDE.md` importa además `AGENTS.md`.

### La afirmación de la que colgaba todo: **verificada**

**Verificado el 2026-09-14.** Cada subagente hereda el bloque. Se midió con una sonda barata en vez de una
corrida de `autobuild`: un subagente lanzado en este mismo repositorio, con la instrucción de **no abrir
ningún archivo** y contestar sólo desde su contexto de arranque.

Devolvió lo que sólo puede devolver quien tiene el texto delante:

- citó textualmente `## R17 — Una unidad de trabajo se parte por lo que acumula, y hay dos formas de
  acumular` y `## R23 — Un borrado se lee resuelto antes de correrlo, y sólo alcanza lo desechable`;
- enumeró los **23** encabezados `R1`–`R23` agrupados por su archivo de origen;
- y señaló un detalle de disposición que no se reconstruye de memoria: dentro de `conduct.md`, R23 aparece
  **entre R13 y R14**, no al final.

**El consumo lo confirma por otro lado: 61.107 tokens con CERO llamadas a herramienta.** Un agente que no
abrió nada gastó eso, así que es casi todo contexto de arranque — la misma observación que el caso traía
de la corrida real (86.567 tokens con 3 llamadas), reproducida sin gastar 1,2 M de tokens.

**Alcance de lo medido.** Un subagente `general-purpose` de Claude Code, en este repositorio. Que un agente
que arranca «fresco» igual lo herede apunta al mecanismo del runner y no al tipo de agente, y por eso este
resultado positivo vale más que uno negativo. **No** se midieron los agentes que lanza un recorrido, que es
el escenario que originó el caso.

### La cuenta corregida, y una corrección de la corrección

El caso original sumaba `AGENTS.md`, `PROTOCOL.md` y las reglas en un total de 92.910 bytes y lo
multiplicaba por once agentes, para **~253.000 tokens**. La primera revisión de este documento sacó a
`AGENTS.md` de lo que se paga por agente, y **eso estaba mal**: lo delató la misma sonda, que lo tiene en
su contexto. `CLAUDE.md` lo importa con `@AGENTS.md`, así que viaja con cada agente igual que las reglas.
Lo que sí se paga una sola vez es `PROTOCOL.md`, que lo lee Triage y se reenvía como texto —«el contrato se
lee una sola vez por corrida … ningún subagente relee AGENTS.md, workspace.md, ops.config.json ni
PROTOCOL.md» (`autobuild.js:316-317`)—, y esa frase habla de **releerlo**, no de tenerlo en contexto.

Medido en este repositorio, que instala cuatro reglas del sistema y ninguna propia:

| Qué | Cuánto | Con qué frecuencia |
| --- | --- | --- |
| `AGENTS.md` | 23,6 KB | **por agente**, vía `@AGENTS.md` |
| Las cuatro reglas de `system/` | 38,3 KB | **por agente**, vía el bloque |
| **Total que viaja por agente** | **61,9 KB ≈ 15,9 K tokens** | |
| `PROTOCOL.md` | 9,4 KB ≈ 2,4 K tokens | una vez por corrida |

Con once agentes son **~175 K tokens** de piso sólo por lo que Cauce pone, sin contar reglas propias.

**Y un techo que acota el arreglo:** la sonda gastó 61.107 tokens de arranque, de los cuales lo de Cauce
son ~16 K — un **26 %**. El resto lo pone el runner (herramientas, instrucciones del harness). Aunque la
opción 2 eliminara el bloque entero, tres cuartas partes de ese piso seguirían ahí.

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

Y cuántas veces se paga se reproduce **sin correr un recorrido**, que es lo que hace esta comprobación
barata: lanzar un subagente en un repositorio con el bloque instalado, pedirle que no abra ningún archivo,
y pedirle que cite el encabezado de una regla concreta. Si lo cita, el bloque viaja con él.

La observación que originalmente lo sugería —el agente de `ops claim`, con **3 llamadas a herramienta**,
gastando **86.567 tokens**— queda confirmada por esa vía y ya no es evidencia de una sola corrida.

## Síntoma

El incentivo queda al revés de lo que el toolkit promueve en todos lados. Cauce pide escribir las reglas
propias —P1..Pn junto a `system/`, con su razón y su evidencia—, y cada una que se escribe **encarece
todas las corridas futuras de todos los agentes**, para siempre y sin aviso. Una regla de dos páginas que
importa en una tarea de cada cien se lee cien veces.

Y no hay forma de medirlo desde adentro: nada reporta cuánto pesa el bloque ni cuántos agentes lo pagaron.
Nosotros lo vimos sumando los tamaños a mano después de una corrida cara.

## Fix propuesto

1. **Que el bloque diga cuánto pesa.** Una línea en `install` —«contexto de arranque: 5 archivos, 62 KB,
   ~16 K tokens por agente»— convierte una decisión invisible en una informada. Es lo más barato y ya sería
   suficiente para que un proyecto decida. El número tiene que cubrir **todo lo que `CLAUDE.md` importa**,
   no sólo el bloque: `AGENTS.md` entra por un `@` que está fuera de las marcas y pesa más que cualquier
   regla suelta.
2. **Reglas por superficie.** Cada regla ya declara de qué habla; las de puertos, identidad de git o
   trampas de un stack no le sirven a un agente que clasifica una tarea. Que el frontmatter pueda declarar
   cuándo aplica, y que el bloque importe siempre las del sistema y las propias marcadas como `siempre`,
   dejando el resto para que el agente las lea cuando toque esa superficie.
3. **Que `check` avise pasado un umbral**, como ya avisa por las entradas de DONE sin `lane:`. Un aviso a
   partir de, digamos, 60 KB, nombrando los tres archivos más grandes. **El umbral hay que reelegirlo**: lo
   que Cauce pone sin una sola regla propia ya son 61,9 KB, así que 60 KB avisaría en toda instancia recién
   creada y el aviso se apagaría por ruido el primer día.

**Con la medición hecha, la 1 sigue siendo lo primero y ahora se puede escribir con el número real.** El
aviso tiene que declarar lo que viaja por agente —`AGENTS.md` más el bloque— y no sólo el bloque, que es la
mitad más chica.

**La 2 tiene un techo que conviene mirar antes de construirla.** Lo de Cauce es el 26 % del contexto de
arranque de un agente; el otro 74 % lo pone el runner y no se toca desde acá. Y el recorrido ya entrega
rutas en vez de texto a cada subagente que toca código, así que lo que la 2 ahorraría es el bloque del
archivo de contexto, no el preámbulo. Sigue siendo el arreglo de fondo — 175 K tokens por corrida en este
repositorio, y más en una instancia con reglas propias— pero no es «el 21 % de la corrida».

**Queda por decidir**, y no lo decide este caso: si la 2 se construye, y con qué contrato. Su tradeoff es
el de abajo y no cambió.

## Tradeoffs

Cargar una regla a demanda significa que un agente puede no leerla cuando sí correspondía, y eso es peor
que pagarla: una regla que no se leyó no existe. Por eso el 2 debe ser explícito del proyecto y nunca
inferido — el default seguro es el de hoy, y lo que falta es poder elegir.

## Contexto de descubrimiento

Auditoría de una corrida real de `autobuild` el 2026-09-14, buscando por qué una tarea `express` que borró
tres archivos costó 1,2 M de tokens. El desglose que salió de ahí: 21 % piso de arranque, 31 % tres pasadas
de Verify por una aceptación mal escrita (caso **140**), 17 % una fase de clasificación que la propia línea
de la tarea podía haber evitado, y el resto trabajo real.

Ese 21 % es el número que la sección «La cuenta corregida» revisa. Salía de sumar `PROTOCOL.md` —que se lee
una vez— con lo que sí viaja por agente, y de una estimación de tokens por byte. Medido el 2026-09-14 sobre
**este** repositorio, lo que Cauce pone son ~15,9 K tokens por agente; en la instancia que originó el caso,
con ocho reglas propias más, es bastante más. El porcentaje de aquella corrida no se volvió a calcular
—haría falta el journal— y los otros tres tramos del desglose tampoco: siguen como estaban.

## Relacionados

- **140** — el otro hallazgo de la misma corrida: la aceptación imposible que se descubre tarde.
- **OPS-005** — el catálogo vive en el paquete justamente para no copiarse a cada instancia; esto es la
  misma idea aplicada a lo que se inyecta en cada agente.
