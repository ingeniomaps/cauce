---
caso: 262
titulo: Review anota en el INBOX lo que revisó y dio bien
estado: abierto
prioridad: baja
version-detectada: 0.100.0
---

# 262 — Lo que Review deja «anotado sin frenar» incluye confirmaciones, y van al INBOX como propuestas

**🔴 abierto** · detectado en 0.100.0 · prioridad **baja**.

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
