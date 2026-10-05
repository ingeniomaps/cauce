---
caso: 262
titulo: Review anota en el INBOX lo que revisó y dio bien
estado: resuelto
resuelto-en: 0.101.0
prioridad: baja
version-detectada: 0.100.0
---

# 262 — Lo que Review deja «anotado sin frenar» incluye confirmaciones, y van al INBOX como propuestas

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **baja**.

**Prioridad baja**: no frena nada. Ensucia el INBOX, que es lo que una persona cura, y le come ranuras del tope a lo que sí
es una propuesta.

## Resumen

Review registra como hallazgo no bloqueante también lo que comprobó y encontró bien. Todo lo no
bloqueante va al INBOX por `review-noted`, así que una confirmación termina como entrada de Propuestas.

## Reproducción

Corrida real de `autobuild` en un banco sidecar instalado, 2026-10-05, una tarea `full`.

## Síntoma

Tres entradas en `planning/inbox/propuestas/`, y dos no proponen nada:

```
alta-cobertura-aceptacion-sin-hallazgo — [qa-engineer] La revisión de alta-exige-email no encontró nada que corregir en la cobertura de la aceptación
alta-rechazo-no-consume-id-cubierto — [qa-engineer] La propiedad extra que promete el comentario de app/src/alta.js:3 («no consume id») entró con su prueba
```

Y la entrada de `done/` dice «6 anotado(s) sin volcar al INBOX»: el tope de tres se gastó en parte en
esas dos.

## Causa raíz

`automatization/workflows/autobuild.js`, donde arma `noted`: toma todo hallazgo que no es decisión ni
bloqueante. El esquema de Review no tiene cómo decir «esto lo miré y está bien», así que cae ahí.

## Fix propuesto

Lo mismo que se hizo con Build en el 250: que el hallazgo no bloqueante declare si propone algo o si es
una constancia, y que la constancia quede en el hecho de revisión de `done/` y no en el INBOX.

## Tradeoffs

- Es un campo más en el esquema de Review, que ya lleva `ref`, `verified` y `decision`.
- Una propuesta real rotulada constancia se pierde del INBOX. Queda en `done/`, que se lee menos.

## Contexto de descubrimiento

La corrida real que probó los casos 248 a 260.

## Relacionados

- 250 — el recorrido registra como acción humana toda observación que no corrige.
- 101 — el tope del INBOX.

## Cierre

**Resuelto en 0.101.0.** Cada hallazgo no bloqueante de Review declara `proposes`. Lo que propone algo
sigue yendo al INBOX; la constancia queda en el hecho de revisión de `done/`, como «constató: …».

### El recorrido de lo que este caso enumeró

- **Fix — se hizo**, con el campo en el esquema y el criterio en el prompt.
- **Tradeoff «un campo más en el esquema de Review» — se paga.**
- **Tradeoff «una propuesta real rotulada constancia se pierde del INBOX» — acotado**: lo que no declara
  el campo sigue yendo al INBOX, y un bloqueante sin comprobar no puede ser constancia aunque lo diga.
- **Síntoma, «6 anotado(s) sin volcar» — baja**, porque las constancias ya no gastan ranuras del tope.

### Qué se corrió

- **Antes y después en el arnés**: las dos constancias iban al prompt de `review-noted`; ahora van al de
  Done, y con sólo constancias no se lanza a nadie a escribir en el INBOX.
- **Cuatro mutaciones.** Tres en rojo a la primera; **una sobrevivió** —un bloqueante tomado por
  constancia—, se agregó el caso y se vio en rojo.
- **Una sonda con un agente real**, con el texto literal del prompt y cinco hallazgos de la corrida que
  originó el caso, sin clasificar. Las tres constancias salieron `proposes: false` y las dos que piden
  algo —una aserción que no puede fallar, una prueba que falta— `true`.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: un Review real dentro de una corrida entera con el campo nuevo.

### Corridas enteras del 2026-10-05, en sesiones interactivas

Dos corridas reales de `autobuild` manejadas por una terminal virtual, en modo `auto`, con el motor de
este cambio: un banco sidecar con la raíz declarada como carpeta de repositorios y dos tareas del mismo
servicio, cortado a propósito en Build y retomado; y un banco con una instancia embebida.

En la corrida sidecar, Review devolvió nueve hallazgos sin bloquear: cinco con `proposes: false` —entre
ellos «Condición de la crítica CUMPLIDA»— y cuatro con `true`. Al INBOX llegaron tres propuestas, que es
el tope, y ninguna constancia.
