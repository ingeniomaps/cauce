---
caso: 532
titulo: el peso de instrucciones que mide Cauce es su bloque, no lo que carga la sesión contra el umbral de Claude Code
estado: resuelto
resuelto-en: 0.124.0
prioridad: baja
version-detectada: 0.123.1
---

# 532 — el peso de instrucciones que mide Cauce es su bloque, no lo que carga la sesión contra el umbral de Claude Code

**🟢 resuelto en 0.124.0** · detectado en 0.123.1 · prioridad **baja**: Claude Code ya avisa por su cuenta. Lo que falta es verlo
venir en el cambio que cruza la línea, y saber qué parte puso cada uno. Sube a media si una instancia cruza el umbral
sin enterarse.

## Resumen

`install` y `check` informan cuánto pesa el bloque de reglas que Cauce mete en `CLAUDE.md`, en bytes y contra un umbral
propio de 64 KB sobre lo que agregó la empresa (`HEAVY`). Claude Code mide otra cosa: **todos** los archivos de
instrucciones que carga la sesión —el `CLAUDE.md` del usuario, el del workspace, lo que importan con `@`, las reglas—,
en caracteres y contra un umbral que depende del modelo. Los dos números no se pueden comparar, y el que importa para el
aviso de Claude Code no lo da nadie.

## Reproducción

Sobre una instancia sidecar real, de sólo lectura:

```bash
node -e 'console.log(require("./engine/automation/rules.js").weightLine(process.argv[1]))' <instancia>
node <instancia>/automatization/bin/<su-script-de-presupuesto>.js   # el total que mide la instancia
```

Y el umbral de Claude Code, leído del binario instalado (2.1.330, fuente minificado):

```bash
LC_ALL=C strings -n 8 "$(readlink -f "$(command -v claude)")" > claude.strings
# se busca «Instruction files will impact performance» y las funciones que calculan el límite
```

## Síntoma

```
el bloque de reglas carga 9 archivo(s), 81.5 KB en cada agente (49.7 KB propias) (las más grandes: process.md, conduct.md)
instrucciones cargadas: 107044 de 150000 caracteres (umbral 140000); las más grandes: process.md (16914), conduct.md (16726), code-shape.md (13738)
```

La diferencia (~25 mil caracteres) es el `CLAUDE.md` global y el del workspace, que Cauce no cuenta.

Lo que dice Claude Code 2.1.330 (**verificado** en el binario, con nombres minificados):

```js
var u8r=0.05,RQt=4194304,c8r=40000;
function b_t(e=dt()){…;return Math.max(c8r,Math.round(r*u8r*NS(e)))}   // por archivo
var f8r=120000;function p8r(e){return Math.max(f8r,b_t(e))}             // total
function NS(e){if(!e)return 4;…;return KK.has(o)?4:3}                   // caracteres por token según el modelo
u.push(`Instruction files will impact performance: ${…fileCount} files, ${…totalChars} chars in total > ${…totalLimitChars}`)
u.push(`Large ${v} will impact performance (${…} chars > ${…})`)
```

O sea: por archivo, `max(40.000, ventana_de_contexto × 0,05 × 3 o 4)`; en total, `max(120.000, ese mismo número)`, sin
contar los archivos que ya pasaron su límite propio. Con un modelo de 1M de contexto y factor 3 da 150.000, que es el
número que usa la instancia. Con 200k de contexto, el total es 120.000. **El umbral no es una constante**: cambia con
el modelo de la sesión.

## Causa raíz

`engine/automation/rules.js:68-90` (`weight`) suma sólo `split(root).loaded`, y `rules.js:109-116` (`weightLine`) lo
informa en bytes. El cierre del 141 lo decidió así a propósito («se declara sólo el bloque»), y `HEAVY`
(`rules.js:105`) mide lo propio de la empresa para que el piso de Cauce no le coma el margen. Las dos decisiones siguen
siendo correctas para lo que miden; lo que no existe es la otra medida.

## Fix propuesto

Una línea informativa en `doctor` de Claude —no en `check`, que corre en CI sin sesión— con el total que cargaría una
sesión abierta en la carpeta del runner: `~/.claude/CLAUDE.md`, el `CLAUDE.md` de esa carpeta, sus `@` y las reglas que
carga el bloque, **en caracteres**, partido en «del usuario», «del proyecto» y «de Cauce». Compararlo contra el piso
de 120.000 y decir que el umbral real depende del modelo, citando la versión de Claude Code en que se leyó.

## Tradeoffs

- Leer `~/.claude/CLAUDE.md` es leer un archivo del usuario: sólo se mide su largo, nunca se imprime su contenido.
- El umbral lo fija Claude Code y puede cambiar sin aviso. Copiarlo como constante envejece; por eso la línea informa
  el total y el piso, y no frena.
- Que el aviso de Claude Code degrade algo de verdad («will impact performance») no lo midió nadie acá: es lo que dice
  el texto del aviso, no un dato.

## Contexto de descubrimiento

Auditoría del 2026-11-21 sobre una instancia sidecar real, que mide el total en su `check` y frena el commit a 140.000
caracteres. El número lo trajo de otra instancia que se topó con el aviso a 150.000. Acá se comprobó de dónde sale.

## Relacionados

- 141: el peso del bloque y por qué se mide sólo el bloque.
- 439: lo que las reglas del sistema cargan en cada agente.

## Cierre

Se recorrió el caso entero:

- **Fix propuesto, una línea en `doctor` de Claude**: se hizo, en `engine/automation/session-load.js`, impresa por
  `automation doctor <dir> claude` (`engine/cli/wiring.js`) y no en `check`, como decía el caso. Da en caracteres lo
  que cargaría una sesión abierta en la carpeta del runner, partido en «del usuario», «del proyecto» y «de Cauce», y
  lo compara con el piso de 120.000 citando la versión de Claude Code.
- **Qué cuenta**: se hizo contra la documentación y no de memoria (code.claude.com/docs/en/memory, leída el
  2026-11-22). Al arrancar entran:
  - la política de la organización;
  - el `CLAUDE.md` y las reglas del usuario;
  - en la carpeta y en cada ancestro, `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md` y las reglas sin `paths:`;
  - los `@` hasta «a maximum depth of four hops», sin los de un bloque de código o un `span`.

  El primer borrador decía cinco saltos, de memoria, y la documentación lo corrigió. También se cuentan aparte los
  archivos de más de 40.000, que Claude Code avisa por separado y no suma al total, y no cuentan los comentarios HTML.
- **Quién puso qué**: se hizo distinto de como lo pensaba el caso, que decía «las reglas que carga el bloque».
  - De Cauce son sus reglas, su paquete, las instrucciones del runner que `install` entregó y nadie tocó (el estado de
    entrega de `doctor`) y sus archivos del sistema (`SYSTEM_FILES`, incluidos `AGENTS.md` y `PROTOCOL.md`) mientras
    sigan como el manifiesto los anotó.
  - Un archivo de la empresa, o uno del sistema que ella editó, se parte por sus bloques `cauce:<nombre>`.
  - Lo encontraron tres revisiones, una por vuelta: que `AGENTS.md` y `PROTOCOL.md` salían como del proyecto; que en
    una instancia embebida el `CLAUDE.md` de la empresa salía entero como de Cauce; y que, con Codex instalado, el
    bloque que `install` mete en el `AGENTS.md` entregado mandaba al proyecto todo lo de alrededor. Que haya un bloque
    no dice quién escribió lo de alrededor; lo dice el manifiesto.
- **Tradeoffs, leer `~/.claude/CLAUDE.md`**: hecho. Sólo se mide su largo, y una prueba con un texto marcado comprueba
  que no aparece en la salida.
- **Tradeoffs, el umbral envejece**: la línea informa y no frena, y dice en qué versión se leyó.
- **Tradeoffs, que el aviso degrade algo**: no se midió, como decía el caso; la línea no afirma que degrade.

Lo que se corrió:

- Línea de base, en «Síntoma»: el único número era el del bloque, 81,5 KB en bytes.
- Contra una sesión real: la transcripción de la corrida real del 538 (`/var/tmp/cauce-run-538a`, Claude Code 2.1.330)
  nombra con «Contents of …» los 9 archivos que cargó, y `loadedFiles` devuelve esos mismos 9, sin uno de más ni de
  menos. La línea da 101.065 caracteres: 12.658 del usuario, 0 del proyecto y 88.407 de Cauce.
- `test/wiring/session-load.test.js`, 7 pruebas. Dos pasan por el `doctor` real: Claude imprime la línea y Gemini no,
  y en una instancia embebida con Claude y Codex instalados lo del proyecto es exactamente lo que escribió la empresa;
  y sin `CLAUDE.md` propio, el `AGENTS.md` que entregó Cauce sigue siendo de Cauce.
- 22 mutaciones en una copia, las 22 rojas. Dos que sobrevivieron en el camino, cambiar el orden de las raíces y
  deduplicar por la ruta y no por la real, no cambian el resultado y se descartaron como equivalentes. La que mostraba
  que `doctor` podía no pasar la raíz ops sumó su caso.

**Sin probar:** con un `AGENTS.md` de la empresa conservado por `init --force` y Codex instalado, lo de la empresa
cuenta como de Cauce, porque `install` blanquea su edición en el manifiesto (caso 546, que lo arregla); la política de la organización en macOS y Windows, que viven en otra ruta; el `AGENTS.md` que Claude
Code lee cuando no hay ningún `CLAUDE.md`, que con el runner de Claude no pasa porque `install` siempre deja uno;
`claudeMdExcludes`; si Claude Code sigue un `@` dentro de una regla de `.claude/rules/` o dentro de un comentario HTML
(el código los sigue); y un `~/.claude/CLAUDE.md` que es un enlace, que se clasificaría por su destino.

### Lista de cierre

1. hecho: la línea de base en «Síntoma» y, después, la línea contra la sesión real de la corrida del 538.
2. hecho: rama `fix/cases-from-an-instance-audit`.
3. hecho: las pruebas en rojo sin el módulo y en verde después.
4. hecho: 22 mutaciones en una copia, las 22 rojas; dos equivalentes descartadas y una que sumó su caso.
5. no aplica: no quita ni reemplaza nada; agrega una línea a `doctor`.
6. hecho: contrastado con la transcripción de una sesión real de Claude Code, archivo por archivo.
7. hecho: lo que depende de Claude Code se contrastó contra su documentación y una sesión real, no contra un doble.
8. hecho: el contraste con la sesión real y las mutaciones corrieron sobre la versión final.
9. hecho: sidecar y embebida, con un `CLAUDE.md` entregado por Cauce y otro de la empresa, y con uno y dos runners instalados.
10. hecho: depende sólo `doctor` de Claude; `index.js` exporta `deliveryState` y nada más cambió ahí.
11. hecho: cuatro pasadas de revisión independiente; las tres primeras hallaron cada una un bloqueante de la partición, que se arregló y se revisó en la siguiente. La cuarta no halló nada de este cambio: halló que `install` blanquea la edición de un `AGENTS.md` de la empresa, que ya pasaba antes y sale como caso 546. Su último arreglo, la prueba embebida que carga `AGENTS.md`, se cerró con su mutación en rojo.
12. hecho: pasada de comentarios sobre `session-load.js` y `wiring.js`; el comentario que afirmaba un bloque que `install` no escribe se corrigió.
13. hecho: `npm run ci` con los archivos nuevos stageados, 1934 de 1934, exit 0.
14. hecho: este cierre recorre el Fix propuesto y los Tradeoffs.
15. hecho: nombra lo corrido con su salida, lo que el enunciado no preveía, y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.124.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.124.0.
