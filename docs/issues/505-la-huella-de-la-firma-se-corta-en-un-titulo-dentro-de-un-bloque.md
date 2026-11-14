---
caso: 505
titulo: La huella de la firma se corta en un título que está dentro de un bloque de código
estado: abierto
prioridad: media
version-detectada: 0.120.0
---

# 505 — La huella de la firma se corta en un título que está dentro de un bloque de código

**🔴 abierto** · detectado en 0.120.0, sin publicar · prioridad **media**: deja sin firmar parte de lo que se aprobó
en 8 de las 163 propuestas trackeadas. La huella todavía no salió y ninguna propuesta trackeada la tiene, así que
corregirla ahora no invalida ninguna firma. Sube a alta si sale publicada sin corregir: desde ahí, cambiarla invalida
las firmas que ya la tengan.

## Resumen

La firma de una propuesta guarda una huella sha256 de «Cambio propuesto», para que `agent-promote` no aplique lo que
cambió después de aprobar (caso 486). La huella termina en la primera línea que empieza con `## `, aunque esa línea
esté dentro de un bloque de código. Una propuesta que trae entero un markdown con sus propios títulos, como un
changelog o un SKILL.md, deja fuera de la huella todo lo que sigue al primero de esos títulos. Se puede editar después
de la firma y `--check-signature` sale en 0.

## Reproducción

Desde la raíz del repositorio, en `f0fc1adc`, con el `fingerprint` del motor y el `awk` del workflow:

```bash
f=agents/roles/system/product-marketing-manager/learning/proposals/2026-11.md
node -e "
const L = require('./engine/agents/learning-files')
const lines = require('fs').readFileSync('$f', 'utf8').split('\n')
const base = L.fingerprint(lines.join('\n'))
const edit = (n) => { const copy = [...lines]; copy[n - 1] += ' EDITADO'; return L.fingerprint(copy.join('\n')) !== base }
console.log('editar la 451 cambia la huella:', edit(451), '· editar la 498:', edit(498))"
awk '/^## Cambio propuesto/ && !d {f=1; d=1; next} /^## /{f=0} f' "$f" | wc -l
awk '/^## Cambio propuesto/{f=1; next} /^## (Riesgos|Evaluación|Aprobación)/{f=0} f' "$f" | wc -l
```

Y cuántas propuestas trackeadas tienen un `## ` dentro de un bloque de código en «Cambio propuesto»:

```bash
for p in $(git ls-files 'agents/roles/*/learning/proposals/*.md' 'flows/*/learning/proposals/*.md'); do
  awk '/^## Cambio propuesto/{f=1; next} f && /^```/{b=!b} f && !b && /^## /{exit} f && b && /^## /{n++} END{if (n) print FILENAME}' "$p"
done | wc -l
git ls-files 'agents/roles/*/learning/proposals/*.md' 'flows/*/learning/proposals/*.md' | wc -l
```

## Síntoma

```
editar la 451 cambia la huella: true · editar la 498: false
103
125
8
163
```

La línea 498 está dentro del changelog de Northlake, el fixture del caso 07, que la propuesta trae entero en un bloque
entre las líneas 486 y 504. El `awk` del workflow firma 103 de las 125 líneas de la sección. El motor y el workflow
cortan en el mismo lugar, así que hoy nada falla: los dos se quedan cortos.

Las 8 propuestas: data-engineer 2026-10, database-administrator 2026-08, procurement-manager 2026-08,
product-marketing-manager 2026-11, qa-engineer 2026-08, release-manager 2026-08, security-engineer 2026-08 y
solutions-engineer 2026-10.

## Causa raíz

- `engine/agents/learning-files.js:42-52`, `fingerprint`: corta en `/^## /` sin mirar si la línea está dentro de un
  bloque de código.
- `.github/workflows/sign-proposal.yml:88`: el `awk` hace lo mismo. Los dos tienen que coincidir, o toda propuesta
  firmada se lee como editada.

## Fix propuesto

1. El motor y el `awk` llevan la cuenta de los bloques de código (líneas que empiezan con ```` ``` ````) y sólo cortan
   en un `## ` que esté fuera de uno.
2. Una prueba que compara las huellas del motor y del `awk` sobre las 163 propuestas trackeadas, más una con un `## `
   dentro de un bloque. Toca `.github/workflows/`, así que el merge es de quien firma.
3. Mutación: volver a cortar sin mirar los bloques pone roja la propuesta con el bloque.

## Tradeoffs

- **Cambia el hash.** Una propuesta firmada con la definición actual se leería como editada. Hoy no hay ninguna: la
  línea `Huella:` no aparece en ninguna propuesta trackeada.
- Un bloque sin cerrar deja dentro de la huella todo lo que sigue, hasta el final del archivo. Es la dirección segura:
  firma de más, no de menos.
- Un bloque abierto con `~~~` no se cuenta. Ninguna propuesta trackeada lo usa.

## Contexto de descubrimiento

Revisión independiente del caso 501, el 2026-11-14: el fixture de un caso nuevo trae su markdown entero, y a veces
con títulos. Medido ese día.

## Relacionados

- 486, que introdujo la huella.
- 506: lo que la huella no cubre por diseño, «Evaluación». Se construyen juntos porque los dos cambian el hash, y
  conviene cambiarlo una sola vez.
