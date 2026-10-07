---
caso: 319
titulo: timeZone acepta husos que no son IANA
estado: descartado
prioridad: baja
version-detectada: 0.103.5
---

# 319 — `check` dice «debe ser un huso IANA» y acepta `EST`, `+05:00` y `utc`

**⚪ descartado** · detectado en 0.103.5 · prioridad **baja**.

**Prioridad baja**: no produce ninguna fecha equivocada: es un mensaje más estricto que la comprobación.

## Resumen

`timeZone` se valida preguntándole a `Intl` si conoce el huso. `Intl` conoce más que los nombres IANA.

## Reproducción

```
EST=true  +05:00=true  utc=true  america/bogota=true  America/Bogota=true
```

## Causa raíz

`engine/config/validate.js`, `validZone`: lo que decide es si `Intl.DateTimeFormat` lo acepta.

## Fix propuesto

- Cambiar el mensaje para que diga lo que se comprueba: «un huso que el sistema conozca».
- O exigir la forma `Región/Ciudad`.

## Por qué hacerlo

Sólo por coherencia entre lo que el mensaje promete y lo que la comprobación hace.

## Riesgos y regresiones

- **Exigir la forma estricta rompe a quien ya declaró `UTC`**, que es válido y razonable.
- Cambiar sólo el mensaje no tiene riesgo.

## Cierre

**Descartado.** Lo decidió el dueño el 2026-10-07, con la recomendación de no hacerlo.

- **Se decidió que no**, porque todas las formas que `Intl` acepta fechan bien, así que no hay ninguna fecha equivocada que corregir. Exigir la forma `Región/Ciudad` rompería a quien ya declaró `UTC`.
- **Cuándo reabrirlo**: si llega a verse fallar una vez.
- **Qué se corrió**: la sonda de arriba: cinco valores contra `validZone`.

## Relacionados

- 303.
