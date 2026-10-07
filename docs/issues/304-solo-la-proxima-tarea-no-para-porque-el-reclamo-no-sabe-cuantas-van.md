---
caso: 304
titulo: solo la proxima tarea no para porque el reclamo no sabe cuantas van
estado: resuelto
resuelto-en: 0.103.5
prioridad: alta
version-detectada: 0.103.4
---

# 304 — «Sólo la próxima tarea de la cola; al cerrarla, parar» cerró dos y frenó en la tercera

**🟢 resuelto en 0.103.5** · detectado en 0.103.4 · prioridad **alta**.

**Prioridad alta**: 45 agentes y 4 millones de tokens para un pedido de una tarea, con dos tareas de más
construidas y una a medias.

## Resumen

El 297 hizo que el reclamo recibiera el pedido. Con «sólo la tarea X» alcanza, porque el agente compara un
nombre. Con «sólo la próxima» no: la próxima es siempre la que le toca reclamar. Lo que falta para leer ese
pedido es cuántas tareas cerró ya la corrida, y eso lo sabe el recorrido y no el agente.

## Reproducción

Instancia real con 0.103.4:

```
/autobuild Sólo la próxima tarea de la cola; al cerrarla, parar. Sin push ni PR.
```

## Síntoma

Tres reclamos, los tres `claimed: true, declined: false`. El segundo recibió el pedido por las dos vías —la
que releva el harness y la que cita el recorrido— y corrió el comando sin más. El log de la corrida no dice
nada sobre parar. Cerró dos tareas y frenó en Build de la tercera, con su reclamo y su WIP puestos.

## Causa raíz

`automatization/workflows/autobuild.js`, `DECLINABLE`: lleva el pedido y no lleva `completed`, que el
recorrido tiene en la mano en esa misma línea.

## Fix propuesto

- Decirle al reclamo cuántas tareas cerró la corrida y cuáles, y qué número sería ésta.
- Nombrar entre los motivos para declinar una cantidad que ya se cumplió.

## Tradeoffs

- Sigue decidiendo un agente. `--max N` sigue siendo la única forma que no depende de una lectura.

## Contexto de descubrimiento

La prueba del 297 en una instancia real, pedida con otras palabras que las del banco.

## Relacionados

- 297 — el reclamo recibe el pedido.
- 293 — `--max N` y la salida `declined`.

## Cierre

**Resuelto en 0.103.5.**

### El recorrido de lo que este caso enumeró

- **La cuenta en el reclamo — se hizo.** «Esta corrida ya cerró N tarea(s) —cuáles—, y ésta sería la número
  N+1».
- **La cantidad cumplida como motivo — se hizo.**
- **Tradeoff — se paga.**

### Qué se corrió

- **La frase de la instancia, en una corrida real.** Banco sidecar con el motor de esta rama y dos tareas en
  cola, lanzado con las mismas palabras. Cerró la primera y terminó por el cierre normal, 18 agentes:

  ```
  producto-dos-numeros no se tomó, a pedido de quien lanzó la corrida: No se corrió el comando. El pedido
  dice: «Sólo la próxima tarea de la cola; al cerrarla, parar. Sin push ni PR.». Esta corrida ya cerró 1 tarea …
  ```

  El reclamo declinado hizo una llamada y escribió 3.941 tokens. No quedó reclamo ni fila.
- **El pedido que no habla de cantidades no declina.** Otra corrida real con «Sin push ni PR.» y las mismas
  dos tareas: cerró las dos.
- **Dos mutaciones en rojo, en una copia**: el prompt sin la cuenta, y el reclamo recibiendo siempre cero.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: la instancia real con el arreglo.
