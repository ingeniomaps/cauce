---
caso: 272
titulo: la deuda que anota Build llega recortada al INBOX
estado: resuelto
resuelto-en: 0.101.0
prioridad: baja
version-detectada: 0.100.0
---

# 272 — Una entrada de `inbox/deuda/` escrita por Build termina en «…», y el resto del texto no queda en ningún lado

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **baja**.

**Prioridad baja**: no frena nada, pero la entrada no se puede leer entera y la revisión siguiente gasta una ranura del
INBOX en proponer completarla.

## Resumen

Lo que el recorrido manda al INBOX se recorta a una línea de 240 caracteres. Para lo que anota Review eso
está bien: el hallazgo sigue entero en `done/`. La deuda que anota Build, desde el 250, no queda en ningún
otro lado.

## Reproducción

Corrida real de `autobuild` en un banco con una instancia embebida, 2026-10-05.

## Síntoma

En `planning/inbox/deuda/`:

```
- **precio-consumidores-base-negativa** — Quién llama a `precio` con base negativa no se revisó […] Un consumidor externo que hoy pase bases nega… (autobuild · precio-rechaza-negativos · 2026-10-05)
```

Y en `planning/inbox/propuestas/`, de la revisión de la misma tarea:

```
- **deuda-precio-consumidores-truncada** — El ítem de deuda […] está truncado en el propio archivo […] se decide si se completa esa entrada y con qué texto, que hoy no consta en ningún lado.
```

## Causa raíz

`automatization/workflows/autobuild.js`, el paso `build-debt`: usa `withOrigin`, que recorta.

## Fix propuesto

Que la deuda de Build viaje entera, en una sola línea, con su remitente.

## Tradeoffs

- Una entrada de deuda puede salir larga. Es lo que Build escribió; recortarla no la mejora.

## Contexto de descubrimiento

Las corridas reales en bancos.

## Relacionados

- 250 — el recorrido registra como acción humana toda observación que no corrige.
- 101 — el tope del INBOX.

## Cierre

**Resuelto en 0.101.0.** La deuda de Build va entera: su primera línea, sin tope, y el remitente.

### El recorrido de lo que este caso enumeró

- **Fix — se hizo.**
- **Tradeoff — se paga.**
- **Lo que anota Review sigue recortándose**, a propósito: eso sí queda entero en `done/`.

### Qué se corrió

- **Antes y después en el arnés**: una deuda de más de 300 caracteres llegaba cortada con «…»; ahora llega
  entera, en una línea y con su remitente.
- **Una mutación en rojo**, en una copia: el recorte de vuelta.
- **La puerta entera**, `npm run ci`.
- **Una corrida real con una deuda larga** se corrió después, abajo.

### Una deuda larga en una corrida real, el 2026-10-05

Sesión real en una línea, lanzada pidiéndole a Build que anotara una deuda con todo su detalle. El archivo
de `inbox/deuda/` quedó en una sola línea de 1526 bytes, sin «…», con qué se decide, con qué se cierra y la
procedencia al final: `(autobuild · informe-cuenta-con-email · 2026-10-05)`.
