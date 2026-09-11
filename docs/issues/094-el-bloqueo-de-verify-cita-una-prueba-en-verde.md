---
caso: 094
titulo: El bloqueo de verify cita una prueba en verde cuando su nombre contiene «error»
estado: abierto
prioridad: media
version-detectada: 0.79.0
---

# 094 — `fallo()` elige la primera línea que dice «error», y un nombre de prueba lo dice

**🔴 abierto** · detectado en 0.79.0 · prioridad **media** — no deja pasar nada; manda a buscar el fallo donde
no está. Sube a **alta** si otro proyecto con `node --test` o `jest` nombra sus pruebas en lenguaje natural,
que es lo común

## Resumen

Cuando un gate falla, `verify` muestra una sola línea de su salida para que se sepa qué pasó. La elige
`fallo()` como la primera que coincide con `/error|err[_!]|fail|abort|not found|cannot|no such/i`
(`engine/hooks/shell.js:515-528`). Un reporte de pruebas lista **todas** las pruebas, las verdes también, y
basta que el nombre de una verde lleve la palabra «error» para que gane.

## Reproducción

`fallo` no se exporta, así que se reproduce por el guard: un commit de código bajo `verify` con una prueba
en rojo que aparezca en la salida después de una verde cuyo nombre lleve «error». En este repositorio, la
reproducción del caso 093 sobre `HEAD` = `35ef0a11` hace exactamente eso, y la primera línea que coincide
es `✔ el error de --bench dice qué hacer, no un fork que no cambia nada`, que está en verde.

## Síntoma

Salida real del guard, 2026-09-10, en las dos veces que frenó el commit del 088:

```
BLOQUEADO: Verify falló en cauce: test (exit 1, 43.7 s): ✔ el error de --bench dice qué hacer, no un fork que no cambia nada (392.835657ms)
```

La prueba que fallaba era otra —`la copia recibe la palanca…`, caso 093—, y no aparece en el mensaje.
Encontrarla costó cinco corridas.

## Causa raíz

`fallo()` descarta el eco de npm (`>`) pero no distingue una línea de resultado exitoso de una de fallo.
`node --test` marca las verdes con `✔` y las rojas con `✖`, y resume las rojas bajo `✖ failing tests:`;
nada de eso se consulta.

## Fix propuesto

Antes de buscar por palabra, preferir las líneas que un reporte de pruebas marca como fallo: `✖`, `not ok`,
`FAIL`. Y descartar las que marca como éxito —`✔`, `ok `, `PASS`— antes de la búsqueda por palabra, que
queda como último recurso para gates que no son suites.

## Tradeoffs

- Una lista de marcadores envejece: `jest`, `vitest`, `pytest` y `go test` los escriben distinto. Lo que
  no coincida con ninguno cae en la búsqueda por palabra de hoy, así que no empeora.
- Descartar las líneas con `✔` podría esconder un error real que alguien imprima con ese prefijo; es
  improbable, y el volcado completo sigue disponible corriendo el gate a mano.

## Contexto de descubrimiento

2026-09-10, commiteando el arreglo del 088: el guard frenó dos veces citando una prueba verde, y la real
recién apareció reproduciendo el entorno del guard a mano (caso 093).

## Relacionados

- **093** — el fallo que este mensaje escondió.
- **066** — el caso que decidió mostrar una sola línea; este caso no discute eso, discute cuál.
