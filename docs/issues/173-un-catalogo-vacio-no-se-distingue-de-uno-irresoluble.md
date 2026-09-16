---
caso: 173
titulo: Un catálogo vacío y uno que no se pudo resolver dan la misma respuesta
estado: abierto
prioridad: baja
version-detectada: 0.95.0
---

# 173 — Un catálogo vacío no se distingue de uno irresoluble

**🔴 abierto** · detectado en 0.95.0 · prioridad **baja** — son dos hechos distintos y `agents list`
contesta lo mismo para los dos

## Resumen

`agents list` devuelve una lista vacía con exit 0 tanto cuando la instancia no tiene cargos como cuando el
paquete no se pudo resolver. Quien lo lee no puede distinguirlos, y las acciones son opuestas: en un caso
no hay nada que hacer, en el otro falta una instalación.

El **171** cerró la causa más común de la segunda —el catálogo no miraba la raíz declarada—, así que hoy el
silencio ocurre menos. Lo que no cambió es que las dos situaciones sigan viéndose igual.

## Reproducción

Verificado el 2026-09-16 sobre el paquete 0.95.0, antes del arreglo del 171:

```
$ node tools/ops.js agents list --json
[]
$ echo $?
0
```

La instancia tenía el paquete un nivel arriba y los 53 cargos estaban ahí.

## Lo que se decide

Si `agents list` —y `flow list`— deben distinguir «no hay» de «no pude resolver el paquete», y cómo:

1. **Un aviso por `stderr` cuando el paquete no resuelve**, dejando el exit y la lista como están. No rompe
   a ningún consumidor: el cron que lee el `--json` sigue leyendo lo mismo.
2. **Exit distinto de 0** cuando no resuelve. Más claro para una persona y más ruidoso para lo que consume
   la salida — hay un cron que la lee.
3. **Nada.** Con el 171 cerrado, la situación que confundía casi no ocurre, y un catálogo genuinamente
   vacío es un estado normal de una instancia recién creada.

La 1 parece la que paga: separa los dos hechos sin tocar lo que otros leen.

## Prioridad

**Baja.** Después del 171 la segunda situación es rara. Queda registrado porque la ambigüedad sigue ahí y
la próxima causa que la produzca va a ser igual de muda.

## Contexto de descubrimiento

2026-09-16, en el cierre del 171: el caso mismo lo dejó nombrado como algo que valía la pena mirar aparte.

## Relacionados

- **171** — el defecto que hacía frecuente esta ambigüedad.
