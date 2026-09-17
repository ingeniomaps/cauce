---
caso: 173
titulo: Un catálogo vacío y uno que no se pudo resolver dan la misma respuesta
estado: resuelto
resuelto-en: 0.96.0
prioridad: baja
version-detectada: 0.95.0
---

# 173 — Un catálogo vacío no se distingue de uno irresoluble

**🟢 resuelto en 0.96.0** · detectado en 0.95.0 · prioridad **baja** — son dos hechos distintos y `agents list`
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

## Cierre

**Resuelto en 0.96.0, por la salida 1: un aviso por `stderr`.**

- **«Un aviso cuando el paquete no resuelve» → se hizo**, y sólo cuando la lista sale **vacía**: con
  resultados a la vista no hay ambigüedad que aclarar, y avisar igual sería ruido sobre una respuesta
  correcta. Vale para `agents list` y `flow list`.
- **«Exit distinto de 0» → no se tomó.** El `--json` lo consume el cron del ciclo de aprendizaje; romperle
  el contrato para arreglar un mensaje sería cambiar lo que no está mal.
- **«Nada» → no se tomó**, aunque el 171 hiciera rara la situación: la ambigüedad seguía y la próxima causa
  iba a ser igual de muda.

### Qué se corrió

- **Rojo previo**: sin el paquete en ninguna parte, `agents list` y `flow list` contestaban vacío y callado.
- Después: los dos avisan por `stderr`, el exit sigue en 0 y el `--json` sigue devolviendo `[]`.
- **Dos mutaciones**: sin el aviso, rojo; avisando siempre —aun con cargos resueltos—, rojo también. La
  segunda es la que cuida que el aviso no se vuelva ruido.
- `npm run ci` exit 0, **911 pruebas**.
