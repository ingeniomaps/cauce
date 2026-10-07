---
caso: 307
titulo: la tarea siguiente se apila en la rama de la anterior
estado: resuelto
resuelto-en: 0.103.5
prioridad: media
version-detectada: 0.103.4
---

# 307 — Dos tareas del mismo servicio terminan en una rama con el nombre de la primera

**🟢 resuelto en 0.103.5** · detectado en 0.103.4 · prioridad **media**.

**Prioridad media**: no se pierde nada. Las dos tareas quedan atadas a un solo PR, y la rama nombra una sola.

## Resumen

Al commitear una tarea el recorrido corta `<tipo>/<tarea>` si el repositorio está en una rama viva, y si
está en cualquier otra commitea ahí. Después del primer commit el repositorio queda en la rama de esa tarea,
así que la siguiente del mismo servicio cae en ella.

## Reproducción

Dos tareas seguidas del mismo servicio, en una corrida o en dos sin mergear entre medio.

## Síntoma

En una instancia real la segunda tarea se commiteó sobre `feat/<primera-tarea>`, y hubo que abrir las dos en
un solo PR. En un banco, lo mismo: dos commits en `feat/config-lee-timeout`.

## Causa raíz

`automatization/workflows/autobuild.js`, `BRANCHED`: «si el repositorio ya está en una rama que no es viva,
commiteá en ésa».

## Fix propuesto

- Una rama por tarea: si el repositorio está en la rama de otra tarea, cortar la propia desde ahí.
- Respetar la rama que la persona eligió y no es de ninguna tarea.

## Tradeoffs

- Las ramas quedan apiladas: la segunda sale de la primera y no de la rama viva. Cortarla de la viva dejaría
  afuera lo que la segunda necesite de la primera.
- Distinguir «rama de otra tarea» de «rama que eligió la persona» fuera de la corrida lo hace el agente, por
  el nombre y por la entrada en `done/`.

## Contexto de descubrimiento

La corrida del 304.

## Relacionados

- 251 — el commit no cae en la rama viva.

## Cierre

**Resuelto en 0.103.5.**

### El recorrido de lo que este caso enumeró

- **Una rama por tarea — se hizo.** El recorrido lleva la cuenta de las ramas donde ya commiteó en esta
  corrida y se las nombra al commit siguiente. Para lo que viene de una corrida anterior, el prompt dice cómo
  reconocerla: su nombre termina en el identificador de una tarea con entrada en `done/`.
- **La rama de la persona — se respeta**, como antes.
- **Tradeoffs — se pagan los dos.**

### Qué se corrió

- **Dos tareas del mismo servicio en una corrida real**, con el motor de esta rama:

  ```
  * cbcef24 (HEAD -> feat/producto-dos-numeros) feat: add product of two numbers
  * 52268f1 (feat/resta-dos-numeros) feat: add subtraction of two numbers
  * e03c6ee (main) feat: suma
  ```

  Cada entrada de `done/` nombra su rama. `ops check` válido.
- **Dos mutaciones en rojo, en una copia**: sin nombrarle al commit las ramas ya usadas, y sin registrarlas.
- **La puerta entera**, `npm run ci`.
- **Entre dos corridas**, que es como pasó en la instancia: una corrida con `--max 1` cerró la primera tarea
  y dejó el repositorio en su rama; una sesión nueva lanzó la segunda, que cortó la suya desde ahí.

  ```
  * 2694e0c (HEAD -> feat/producto-dos-numeros) feat: add product of two numbers
  * b527d79 (feat/resta-dos-numeros) feat: add subtraction of two numbers
  * 1c3930a (main) feat: suma
  ```
