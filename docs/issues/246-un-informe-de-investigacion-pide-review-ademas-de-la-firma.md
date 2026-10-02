---
caso: 246
titulo: un informe de investigación pide review además de la firma de la propuesta que lo consolida
estado: abierto
prioridad: media
version-detectada: 0.100.0
---

# 246 — Un informe de investigación pide review además de la firma de la propuesta

**🔴 abierto** · detectado en 0.100.0 · prioridad **media**.

**Prioridad media**: no rompe nada, pero cada mes pone a una persona a revisar decenas de PR que no deciden nada,
y el que no se revisa a tiempo pierde su hallazgo.

## Resumen

El ciclo de aprendizaje pide la mirada humana dos veces sobre lo mismo. Primero en el PR de cada informe con
`propone: si`, que queda sin auto-merge esperando review. Después en la firma de la propuesta mensual que
consolida esos informes, que es lo único que cambia un cargo. La primera mirada no decide nada: un informe es
evidencia. Además, como la consolidación lee `main`, un informe sin mergear antes del 1 no entra a la propuesta
y su hallazgo se pierde.

`propone` mezcla dos cosas. Dice si el informe alimenta la propuesta, y eso hace falta. Y dice si alguien lo
revisa, que ya lo cubre la firma.

## Reproducción

La investigación mensual lanzada a mano el 2026-10-02 (corrida `37041778395`, 52 cargos) y la trimestral
(`37041811673`, 1 cargo).

## Síntoma

De 53 PR, 29 dijeron `propone: no` y quedaron con auto-merge, y 24 dijeron `propone: si` y quedaron esperando
review. Leídos uno por uno, ninguno de los 24 pide tocar `SKILL.md`, las conductas ni los casos:

- 13 son mantenimiento del catálogo (una fecha, una URL, un comentario, una fuente de `pending` a `sources`);
- 10 agregan una fuente nueva;
- 1 agrega texto de práctica en `operating-model.md` (`ux-designer`).

El molde define bien el campo («si» cuando el informe pide tocar **algún** archivo del cargo, `sources.yaml`
incluido): el problema no es cómo se contesta, sino qué decide.

## Causa raíz

- `.github/workflows/agent-learning.yml`, paso `Open research pull request`: arma auto-merge sólo
  `if grep -qx 'propone: no'`.
- `engine/agents/learning.js`, molde del informe: «Un "no" se mergea sin revisión humana… Ante la duda va
  "si", que sólo cuesta una mirada».
- `AGENTS.md`, «Destrabar una tanda de investigación», punto 4: «Dejar abiertos los `propone: si`».

## Fix propuesto

Lo decidió Manuel el 2026-10-02: la única mirada humana del ciclo es la firma de la propuesta.

- `research-pr` arma auto-merge para todo informe, sin condición.
- `propone` sigue contestándose y pasa a decidir sólo si el informe alimenta la propuesta.
- El molde y `AGENTS.md` dicen eso, y la autorización del CI de los PR del bot queda como un control mecánico
  (que el diff sea sólo el informe), no como una lectura.

## Tradeoffs

- Un informe con un hallazgo malo llega a `main` sin que nadie lo lea. Es evidencia y no contrato: lo que pueda
  hacer daño pasa por la propuesta, que sí se firma. Lo que traiga de afuera sigue siendo dato y no instrucción
  (R19).
- El CI de los PR del bot sigue esperando autorización (caso 146). Este caso no lo cambia.

## Contexto de descubrimiento

Manuel esperaba que una investigación sin grandes cambios trajera «pocas» propuestas y que el resto se cerrara
solo. Llegaron 24 PR para revisar. La conversación de por qué llevó a ver que la revisión del informe duplica
la firma.

## Relacionados

- **242**: el mismo principio para la propuesta, que se archiva sola cuando no cambia nada.
- **146**: por qué el CI de un PR del bot espera autorización.
