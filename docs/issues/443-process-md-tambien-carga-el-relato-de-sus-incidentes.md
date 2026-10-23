---
caso: 443
titulo: process.md también carga en cada agente el relato de los incidentes que originaron R17, R25 y R28
estado: abierto
prioridad: baja
version-detectada: 0.115.0
---

# 443 — `process.md` también carga el relato de sus incidentes

**🔴 abierto** · detectado en 0.115.0 · prioridad **baja**. Sale de la revisión del 441.

## Resumen

El 441 sacó de las reglas cargadas las frases que cuentan el incidente que originó cada regla, pero sólo en
`conduct.md` y `runs.md`, que eran los archivos que el 439 había medido. `process.md` también se carga en cada agente
y trae el mismo tipo de frase: «en otra costó 327k tokens», «la corrida siguiente gastó 594k tokens», «a 42k tokens
por vez».

## Reproducción

Desde la raíz de este repositorio, con el patrón del 441 más las cifras en `k tokens`:

```bash
node -e 'const fs = require("fs")
const re = /originó|sesión que|instancia que|instancias? real|Pasó |pasó dos|se perdieron|millones de tokens|\d+k tokens|tokens? por vez|en la que|lo vivió|GB|cuatro cargos|de \d+ tareas/
for (const f of ["process", "code-shape", "conduct", "runs", "commits", "proof"]) {
  const t = fs.readFileSync("template/planning/rules/system/" + f + ".md", "utf8")
  const hits = t.split(/\n\s*\n/).filter((p) => !p.startsWith("#") && re.test(p))
  console.log(f, hits.length, hits.reduce((n, p) => n + p.split(/\s+/).filter(Boolean).length, 0))
}'
```

## Síntoma

Corrido el 2026-10-23 sobre la rama de 0.115.0, sin publicar: `process 4 355`, y 0 en `code-shape`, `conduct`,
`commits` y `proof`; `runs 1 55` es el falso positivo de R22 que el 441 ya identificó. Los cuatro párrafos de
`process.md` son mixtos, como los del 441: instrucción y argumento con una o dos frases de incidente, así que lo que
saldría es menos que esas 355 palabras.

## Causa raíz

El 441 se acotó a los tres archivos que nombraba el 439, y la prueba que agregó (`test/wiring/rules.test.js`, «el
relato de los incidentes no viaja en lo que carga cada agente») busca seis frases concretas, no la clase.

## Fix propuesto

El mismo del 441: el criterio escrito —relato es la frase que cuenta lo que pasó y se puede sacar sin que la regla
pierda instrucción ni porqué—, las frases a «De dónde salió cada regla» del README de reglas, y una medición antes y
después con un pedido donde la regla importe.

## Tradeoffs

- El ahorro es chico: menos de 355 palabras, del orden de 1 KB de los 46,3 que carga cada agente. El 441 se hizo por
  pedido explícito con un ahorro parecido; éste puede no valer la medición.
- Mueve la ventana de KB de `test/wiring/rules.test.js`.

## Contexto de descubrimiento

La revisión de código de los casos 439 a 441 marcó que `process.md:90,104,123` seguía cargando cifras de incidentes.

## Relacionados

- Caso 441: el mismo cambio en `conduct.md` y `runs.md`.
- Caso 439: de donde salió la medición original.
