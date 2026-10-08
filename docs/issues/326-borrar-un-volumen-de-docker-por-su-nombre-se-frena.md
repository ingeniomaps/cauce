---
caso: 326
titulo: borrar un volumen de docker por su nombre se frena
estado: descartado
prioridad: baja
version-detectada: 0.103.5
---

# 326 — `docker volume rm <nombre>` pide a una persona aunque el agente lo haya creado

**⚪ descartado** · detectado en 0.103.5 · prioridad **baja**.

**Prioridad baja**: deja un sobrante por corrida; no pierde nada.

## Resumen

El guard de destructivos frena `docker volume rm`. En una corrida real el agente había creado un volumen para
una copia de trabajo y no pudo borrarlo al terminar.

## Reproducción

Instancia real con 0.103.5:

```
docker volume rm <volumen que el agente creó>
BLOQUEADO: La limpieza global de Docker puede borrar datos compartidos.
```

## Por qué no se arregla

- **Un volumen con nombre puede tener datos**: una base, un almacén de dependencias. El guard no tiene cómo
  saber que éste lo creó el agente hace diez minutos.
- **Esa misma instancia perdió una base** por un volumen que no estaba donde se creía.
- R23: un borrado alcanza sólo lo desechable, y eso se comprueba. Acá no se puede.

## Cierre

**Descartado.**

- **Se decidió que no**: frenar es lo correcto, y el costo es un volumen sobrante que una persona borra.
- **Lo único mejorable** es el mensaje: dice «limpieza global» para un borrado por nombre. No amerita un caso.
- **Qué se corrió**: se leyó el freno en el transcripto de la corrida real, con su comando.

## Relacionados

- R23.
