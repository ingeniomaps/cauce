---
caso: 235
titulo: el INBOX no le pide buscar antes de escribir a quien escribe a mano
estado: abierto
prioridad: baja
version-detectada: 0.99.2
---

# 235 — Los recorridos no repiten nombres del INBOX, pero un cargo que escribe a mano no tiene esa instrucción

**🔴 abierto** · detectado en 0.99.2 · prioridad **baja**.

**Prioridad baja**: puede que ya esté cubierto en buena parte. El INBOX de roax llegó a 3.586 líneas antes de su regla.

## Resumen

roax-ops (R51) y conorbi-ops (P19) dicen que en el INBOX se busca antes de escribir, va una entrada por cabecera, sin relatos de QA, y sale en el mismo cambio en que se decide. En Cauce los recorridos ya reciben los nombres que hay (caso 101) y `check` avisa lo promovido sin borrar (106); lo que falta es la instrucción para quien escribe fuera de un recorrido.

## Reproducción

Pendiente: contar en roax cuántas entradas duplicadas quedan con el INBOX por entrada de 0.100.0.

## Síntoma

Entradas repetidas que alguien tiene que limpiar a mano.

## Causa raíz

`template/planning/INBOX.md` da la forma de una entrada y no pide buscar antes.

## Fix propuesto

Una línea en el molde del INBOX y en el README de `inbox/`, si la medición muestra duplicados escritos por un cargo.

## Tradeoffs

- Puede no hacer falta: se mide antes.

## Contexto de descubrimiento

Relevamiento de roax-ops y conorbi-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala.

## Relacionados

- 101, 106, 123 y 216.
