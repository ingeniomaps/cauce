---
caso: 507
titulo: El motor lee el estado de la firma en todo el archivo, y un fixture lo confunde
estado: abierto
prioridad: baja
version-detectada: 0.119.0
---

# 507 — El motor lee el estado de la firma en todo el archivo, y un fixture lo confunde

**🔴 abierto** · detectado en 0.119.0 · prioridad **baja**: hoy ninguna propuesta ni caso trackeado trae una línea
`- Estado:` fuera de «Aprobación humana». Desde el 501, una propuesta trae el fixture de su caso nuevo, y una fila de
`HUMAN_ACTIONS.md` tiene esa forma. Sube a media el día que aparezca una.

## Resumen

Para saber si una propuesta está firmada, y para sellarla o archivarla, el motor busca la línea `- Estado:` en todo el
archivo, no en «Aprobación humana». Si un fixture trae esa línea, el motor lee la del fixture:

- Al sellar o archivar se reescribe el estado del fixture, y «Aprobación humana» sigue diciendo «aprobada»: la
  contradicción que el sello existe para cerrar. Y la propuesta deja de coincidir con su huella (casos 505 y 506).
- Una propuesta pendiente cuyo fixture dice `- Estado: aprobada` se cuenta como firmada: el aviso de propuestas firmadas
  la nombra, y archivarla se niega.

`sign-proposal.yml` ya acota su lectura y su escritura a «Aprobación humana» (casos 505 y 506). El motor no.

## Reproducción

Desde la raíz del repositorio, con las dos expresiones del motor copiadas tal cual:

```bash
node -e "
const text = '## Evaluación\n\n\`\`\`markdown\n- Estado: pendiente\n\`\`\`\n\n## Aprobación humana\n\n- Estado: aprobada\n'
const UNSEALED = /^-[ \t]*Estado:[ \t]*(?:pendiente|aprobada)[ \t]*$/mi
console.log(JSON.stringify(text.replace(UNSEALED, '- Estado: aplicada')))
const SIGNED = /^-[ \t]*Estado:[ \t]*aprobada[ \t]*$/mi
const pending = '## Evaluación\n\n\`\`\`markdown\n- Estado: aprobada\n\`\`\`\n\n## Aprobación humana\n\n- Estado: pendiente\n'
console.log('una pendiente se lee firmada:', SIGNED.test(pending))"
```

## Síntoma

```
"## Evaluación\n\n```markdown\n- Estado: aplicada\n```\n\n## Aprobación humana\n\n- Estado: aprobada\n"
una pendiente se lee firmada: true
```

## Causa raíz

- `engine/agents/learning-seal.js:24`, `UNSEALED`, que reemplaza la primera coincidencia del archivo al sellar (`:68`) y
  al archivar (`:160`).
- `engine/agents/learning-files.js:37`, `SIGNED`, que leen `learning-seal.js:131` (archivar) y `learning-sources.js:42`
  y `:271` (el aviso de firmadas).

## Fix propuesto

Las dos expresiones se aplican sólo a «Aprobación humana», igual que la detección y el `sed` de `sign-proposal.yml`.
Prueba: una propuesta con un fixture que trae cada una de las dos líneas, sellada, archivada y contada. Mutación:
devolver la búsqueda al archivo entero pone rojas las tres.

## Tradeoffs

- Una propuesta sin «Aprobación humana» deja de leerse como firmada. Los tres moldes del motor la traen.

## Contexto de descubrimiento

Cuarta pasada de la revisión independiente de los casos 505 y 506, el 2026-11-14, al acotar el `sed` de la firma.

## Relacionados

- 505 y 506, que acotaron lo mismo en el workflow.
- 501, que pone fixtures dentro de las propuestas.
