---
caso: 224
titulo: check no ve una regla propia que contradice una del sistema
estado: resuelto
resuelto-en: 0.100.0
prioridad: baja
version-detectada: 0.99.2
---

# 224 — Una regla propia escrita como `## Regla 8` no la lee `check`, y contradice a R8 sin que nada lo diga

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **baja**.

**Prioridad baja**: no rompe nada, pero un agente lee dos reglas opuestas y elige una.

## Resumen

`check` reconoce las reglas por el encabezado `## <letra><número> —`. conorbi-ops escribió las suyas como `## Regla 8` y `## Regla 9`: no entran en la comparación de ids, y su «Regla 8» pide Conventional Commits en español, al revés que R8 del sistema.

## Reproducción

Pendiente de correr al tomar el caso: un archivo de reglas propio con `## Regla 8 — Commits en español` y `ops check`, que se espera verde.

## Síntoma

Una contradicción entre una regla de la empresa y una del sistema que ninguna herramienta ve.

## Causa raíz

`engine/planning/structure.js:114`, `ruleIds`: `/^##\s+([A-Z]\d+)\s+[—-]/gm`. Un encabezado sin esa forma no existe para `check`.

## Fix propuesto

Que `check` avise un encabezado `##` de `rules/` que parece una regla y no tiene la forma (`Regla N`, `R-N`), diciendo cuál es la forma. Detectar la contradicción misma pide juicio y no entra.

## Tradeoffs

- Avisar por forma puede marcar secciones legítimas de un archivo de reglas: acotarlo a encabezados que empiezan con «Regla» o con letra y número.

## Contexto de descubrimiento

Relevamiento de roax-ops y conorbi-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala. En `conorbi-ops/planning/rules/commits-and-release.md` y `ports.md`.

## Relacionados

- 160 — por qué las reglas se pisan por archivo.

## Cierre

Resuelto en 0.100.0.

- **Reproducción, antes de tocar nada:** un `rules/commits-propios.md` con `## Regla 8 — Commits en español` y
  `## Regla 9: puertos`. Con el motor de `main`, `check` salió `ok=true` sin mencionar ninguna de las dos.
- **Que `check` avise un encabezado que parece una regla y no tiene la forma** — se hizo:
  `looseRuleHeadings` (`engine/planning/structure.js`). Avisa, con la forma correcta y el número de la regla,
  estos encabezados de `rules/*.md`: `## Regla N`, `## Rule N`, `## R-N` y un `## P12` sin raya. Las secciones
  comunes (`## Cómo se aplica`) y las reglas bien escritas no.
- **Acotarlo para no marcar secciones legítimas** — se hizo con esas formas, que empiezan con «Regla» o «Rule»,
  o con letra y número. El molde no da ningún aviso.
- **Detectar la contradicción misma** — se decidió que no, como decía el fix: pide juicio. Lo que se arregla es
  que la regla no se esté leyendo, que es lo que dejaba la contradicción invisible.

Prueba real:

- **La reproducción con el motor de esta rama:** `check` sigue `ok=true` y avisa `rules/commits-propios.md:
  «## Regla 8 — Commits en español» parece una regla y check no la lee; se escribe «## P8 — título» …` y lo
  mismo para la 9. La `## P1 — …` bien escrita y la sección común no se marcan.
- **Cuatro mutaciones en una copia, cada una en rojo por `test/planning/rule-headings.test.js`:**
  - Sin las formas «Regla» y «Rule».
  - Sin la forma sin raya.
  - El número fijo en el mensaje.
  - `check` no lo muestra.
