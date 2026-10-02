---
caso: 235
titulo: el INBOX no le pide buscar antes de escribir a quien escribe a mano
estado: descartado
prioridad: baja
version-detectada: 0.99.2
---

# 235 — Los recorridos no repiten nombres del INBOX, pero un cargo que escribe a mano no tiene esa instrucción

**⚪ descartado** · detectado en 0.99.2 · prioridad **baja** — se midió y no se construye: los duplicados
masivos los escribía el loop, que ya cubrió el caso 101.

**Prioridad baja**: puede que ya esté cubierto en buena parte. El INBOX de acme llegó a 3.586 líneas antes de su regla.

## Resumen

acme-ops (R51) y globex-ops (P19) dicen que en el INBOX se busca antes de escribir, va una entrada por cabecera, sin relatos de QA, y sale en el mismo cambio en que se decide. En Cauce los recorridos ya reciben los nombres que hay (caso 101) y `check` avisa lo promovido sin borrar (106); lo que falta es la instrucción para quien escribe fuera de un recorrido.

## Reproducción

Medido el 2026-10-02 sobre los INBOX de las cuatro instancias reales; los números están en el Cierre.

## Síntoma

Entradas repetidas que alguien tiene que limpiar a mano.

## Causa raíz

`template/planning/INBOX.md` da la forma de una entrada y no pide buscar antes.

## Fix propuesto

Una línea en el molde del INBOX y en el README de `inbox/`, si la medición muestra duplicados escritos por un cargo.

## Tradeoffs

- Puede no hacer falta: se mide antes.

## Contexto de descubrimiento

Relevamiento de acme-ops y globex-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala.

## Relacionados

- 101, 106, 123 y 216.

## Cierre

Descartado el 2026-10-02 por decisión de Manuel, sobre la medición que el caso pedía. Lo que habría justificado
construir estaba escrito antes de medir: duplicados escritos a mano por un cargo, sin haber buscado.

**La medición.** Un agente leyó en sólo lectura el INBOX de las cuatro instancias. Ninguna tiene todavía
`planning/inbox/`: las cuatro usan `INBOX.md`. Comprobé a mano el número que más pesa: en
`acme-ops/planning/archive/INBOX-2026-09-11.md`, `grep -c` de «DUPLICADO de» y «### duplicado de» devuelve 29.

**Lo que devolvió.**

- **Hoy**: una superposición parcial en acme (unas 86 entradas), ninguna en initech (76) ni en globex (13), y
  un casi-duplicado en hooli (95). En hooli quien escribió la segunda entrada citaba la primera, así que vio
  la anterior y abrió otra igual. Buscar antes no lo habría evitado.
- **La historia**: los 29 duplicados de acme y los 43 que initech consolidó en 6 salieron del loop. Lo dicen el
  «Origen: review de `<tarea>`» de cada entrada y la cabecera de esos INBOX. Esa vía es la que ya cerró el
  caso 101: los recorridos reciben los nombres que hay.

**Recorrido de lo que el caso enumeraba:**

- **Contar duplicados** — se hizo; es lo de arriba.
- **Una línea en el molde del INBOX y en el README de `inbox/`** — se decidió que no: la medición no encontró
  duplicados escritos a mano sin buscar, que era la condición que el propio caso ponía.
- **Tradeoff: puede no hacer falta** — es lo que mostró la medición.

**Condición para reabrirlo.** Si una instancia con `inbox/` por entrada (0.100.0) junta duplicados sin
procedencia de recorrido, ahí sí falta la instrucción para quien escribe a mano.
