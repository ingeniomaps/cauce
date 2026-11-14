---
caso: 507
titulo: El motor lee el estado de la firma en todo el archivo, y un fixture lo confunde
estado: resuelto
resuelto-en: 0.120.0
prioridad: baja
version-detectada: 0.119.0
---

# 507 — El motor lee el estado de la firma en todo el archivo, y un fixture lo confunde

**🟢 resuelto en 0.120.0** · detectado en 0.119.0 · prioridad **baja**: hoy ninguna propuesta ni caso trackeado trae fuera de
«Aprobación humana» una línea `- Estado:` que el motor confunda. La única que hay,
`technical-writer/learning/proposals/2026-11.md:119`, dice «borrador» y no coincide con ninguna de las dos expresiones.
Desde el 501, una propuesta trae el fixture de su caso nuevo, y una fila de `HUMAN_ACTIONS.md` tiene esa forma. Sube a
media el día que aparezca una que coincida.

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
  al archivar (`:160`). Las líneas son las de `f0fc1adc`.
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

## Cierre

El motor lee y escribe la firma sólo dentro de «Aprobación humana», desde su primer título hasta el final: `approval` y
`inApproval` en `engine/agents/learning-files.js`. Es el mismo tramo donde corta la huella y el que lee y reescribe
`sign-proposal.yml`. Lo usan:
- sellar: la guarda de ya sellada, el responsable, el estado y la fecha;
- archivar: la guarda de firmada, el estado, el responsable, la fecha y el motivo;
- leer la huella;
- contar firmadas, para cargos y para recorridos;
- leer el motivo de una archivada, que lee el informe siguiente.

Línea de base: la reproducción del caso, con la salida en «Síntoma», y la prueba nueva en rojo sobre el motor de antes.

Contra el caso:

- **Fix, las dos expresiones sólo en «Aprobación humana»:** se hizo. Además se acotaron `Responsable:`, `Fecha:`,
  `Huella:` y `Motivo:`, que tenían el mismo defecto: el caso nombraba sólo `Estado:`.
- **Fix, la prueba y la mutación:** `test/agents/learning-approval.test.js` sella, vuelve a sellar, archiva, cuenta y
  lee el motivo de una propuesta cuyo fixture trae las líneas de la firma. `flows-learning.test.js` cuenta una de
  recorrido.
- **Tradeoff, una propuesta sin «Aprobación humana» deja de leerse como firmada:** se acepta. Las 163 propuestas
  trackeadas tienen exactamente una.

Lo que el caso no preveía:

- **El ayudante de las pruebas firmaba como el workflow viejo**, reemplazando en todo el archivo. Se acotó como el
  workflow de ahora, y falla si la propuesta no tiene «Aprobación humana», en vez de no firmar y seguir.
- **El encabezado del caso afirmaba de más.** Decía que ninguna propuesta trae `- Estado:` fuera de la firma, y
  technical-writer 2026-11 trae una, que no coincide con ninguna expresión. Se corrigió.
- **Dos «Aprobación humana»** — un fixture que trae una propuesta entera — dejan al motor y al workflow en desacuerdo.
  Los dos empiezan en la primera, pero el `sed` del workflow reescribe cada línea del tramo, y el motor sólo la
  primera. Hoy ninguna propuesta trackeada la tiene. Se anota y no se arregla: pide decidir si una propuesta así se
  firma.
- **Un `### Aprobación humana`** pasa la validación de secciones de `learning-sources.js`, que busca la cadena sin
  anclar, y el motor no lo reconoce como la sección. Ningún molde lo produce. Se anota.
- **`ci.yml` avisa que una propuesta «no se va a poder firmar»** buscando `- Estado: pendiente` en todo el archivo. Con
  un fixture así, el aviso sale sin motivo. Es una advertencia y ninguna prueba corre ese paso: se anota.

### Lista de cierre

1. hecho: la reproducción del caso, antes del cambio, y las dos pruebas de `learning-approval.test.js` en rojo sobre el
   motor de antes («leyó la huella del fixture», «una pendiente cuyo fixture dice «aprobada» se contó como firmada»).
2. hecho: en la rama de la tanda, `fix/484-re-review-checks-what-it-asked`.
3. hecho: las pruebas nuevas en rojo antes y en verde después, también la del motivo y la del recorrido.
4. hecho: nueve mutaciones, una por cada lectura o escritura acotada, devolviéndola al archivo entero. Todas en rojo. Dos
   sobrevivieron al principio, la guarda de ya sellada y la de no archivar una firmada; se les sumó el caso. Otra
   sobrevivía al separar las dos lecturas de firmadas: la de recorridos, que ganó su prueba en `flows-learning`.
5. hecho: no se quita nada. Lo que cambió de quién escribe es el ayudante de pruebas, y las 48 pruebas del ciclo que lo
   usan siguen en verde.
6. hecho: el motor real sobre instancias armadas por las pruebas, sin dobles: `prepareProposal`, `seal`, `archive`,
   `evaluate`, `evaluateTeam`, `checkSignature` y `discardedProposals`.
7. no aplica: no depende de un modelo ni de un sistema externo.
8. hecho: corrieron sellar, archivar, contar (cargo y recorrido), leer el motivo y leer la huella. No corrió el CLI
   sobre una propuesta real con un fixture así, porque no hay ninguna.
9. hecho: el motor y el workflow, comparados en las pruebas del 505 y el 506, que siguen en verde.
10. hecho: dependen de estas lecturas `learning-sources.js` (dos), `learning-seal.js` y `learning-files.js`, y se
    acotaron todas. `agent-promote.js` le pide al agente que lea la firma en «Aprobación humana».
11. hecho: una pasada independiente, sin nada que impidiera entregar. Encontró el motivo sin acotar, el ayudante sin
    aviso y la frase falsa del caso, que se arreglaron, y los tres bordes anotados arriba.
12. hecho: pasada uno por uno sobre los comentarios nuevos.
13. hecho: `npm run ci` con los cambios stageados.
14. hecho: recorrido arriba contra Fix y Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba.
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.120.0`, y entrada en el CHANGELOG.

**Sin probar:** el CLI sobre una propuesta real con un fixture así, y una propuesta con dos «Aprobación humana».
