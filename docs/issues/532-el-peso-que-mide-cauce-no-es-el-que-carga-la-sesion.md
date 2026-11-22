---
caso: 532
titulo: el peso de instrucciones que mide Cauce es su bloque, no lo que carga la sesión contra el umbral de Claude Code
estado: abierto
prioridad: baja
version-detectada: 0.123.1
---

# 532 — el peso de instrucciones que mide Cauce es su bloque, no lo que carga la sesión contra el umbral de Claude Code

**🔴 abierto** · detectado en 0.123.1 · prioridad **baja**: Claude Code ya avisa por su cuenta. Lo que falta es verlo
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
