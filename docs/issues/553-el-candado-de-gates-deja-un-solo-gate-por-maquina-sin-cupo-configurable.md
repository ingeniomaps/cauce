---
caso: 553
titulo: el candado de gates deja un solo gate por máquina, sin cupo configurable
estado: aplazado
reabrir-si: los diarios de corridas o una instancia miden tiempo perdido por gates esperando uno detrás de otro, con la espera en minutos por semana
prioridad: baja
version-detectada: 0.124.0
---

# 553 — el candado de gates deja un solo gate por máquina, sin cupo configurable

**⏸ aplazado** · detectado en 0.124.0 · prioridad **baja**: nadie midió que esperar en serie cueste tiempo, y subir el
cupo deshace lo que cerró el 240.

## Decisión del 2026-11-22

Partido del 550, a pedido de Manuel: el freno por memoria se construye allá y el cupo espera a su `reabrir-si`.

## Resumen

`engine/hooks/machine-lock.js` deja un gate por vez en la máquina (caso 240), con un archivo con el pid. Una instancia
sidecar real propuso extenderlo a N lugares por configuración.

## Reproducción

La sonda del 550 (`case550/probe.js`, en el scratchpad de la sesión que lo escribió) tomó el candado real con
`CAUCE_VERIFY_LOCK` apuntando al scratchpad:

```
A +   35 ms lo obtuvo tras esperar 0 ms
B +  236 ms pide el candado
A + 2036 ms lo soltó
B + 2241 ms lo obtuvo tras esperar 2005 ms
```

## Síntoma

Un segundo gate espera al primero entero, siempre.

## Causa raíz

`holdMachine` tiene un solo archivo de candado y ninguna llave de configuración.

## Fix propuesto

El que el 550 dejó escrito: `runner.gateSlots` (default 1), lugares `lock`, `lock.1`… tomados con el mismo `wx`
atómico, el lugar 0 con el nombre de hoy, y `check` rechazando un cupo mayor que 1 sin `gateMinFreeMb`.

## Tradeoffs

- Con `gateSlots: 3` vuelven las tres suites en paralelo que el 240 cerró porque `systemd-oomd` mataba la sesión.
- La memoria se mira sólo al arrancar: dos gates que arrancan a la vez pasan los dos el freno del 550.

## Contexto de descubrimiento

Auditoría del 2026-11-21 sobre una instancia sidecar real.

## Relacionados

- 550: el freno por memoria, que este cupo necesitaría para subir sin riesgo.
- 240: el candado de un gate por vez.
