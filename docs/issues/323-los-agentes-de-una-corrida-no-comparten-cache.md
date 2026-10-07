---
caso: 323
titulo: los agentes de una corrida no comparten caché
estado: descartado
prioridad: baja
version-detectada: 0.103.5
---

# 323 — Cada agente escribe su arranque entero aunque sea igual al del anterior

**⚪ descartado** · detectado en 0.103.5 · prioridad **baja**.

**Prioridad baja**: es lo que más pesa en el costo de una corrida, y no es de Cauce.

## Resumen

Dos tercios de lo que cuesta una tarea es la primera llamada de cada agente. Esa primera llamada escribe a
caché todo lo que carga, y el agente siguiente vuelve a escribirlo en vez de leerlo.

## Lo medido

Corrida real de dos tareas, primera llamada de los 16 agentes completos:

- leído de caché: 95.955 tokens;
- escrito a caché: 1.055.700 tokens.

Sólo se reusa cuando dos agentes reciben exactamente el mismo pedido.

## Por qué no es un caso de Cauce

El arranque común —las herramientas, las instrucciones del proyecto— lo arma el harness, y qué parte se marca
para caché también. Desde el recorrido no hay cómo cambiarlo. **Hipótesis, no comprobada acá**: la marca de
caché cubre el mensaje entero, incluido el pedido propio de cada agente, y por eso sólo coincide cuando el
pedido es idéntico.

## Cierre

**Descartado como arreglo; queda como dato.**

- **Se decidió que no**, porque no hay nada que cambiar en este repositorio.
- **Lo que sí corresponde**: reportarlo a quien mantiene el harness, con los números de arriba. Es una
  decisión del dueño y no se tomó.
- **Qué se corrió**: el recuento de las primeras llamadas de dos corridas reales, contando cada mensaje una
  vez por su id.

## Relacionados

- 295 — lo que carga cada agente.
