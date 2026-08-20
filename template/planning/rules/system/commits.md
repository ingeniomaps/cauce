# Commits y entrega

## R8 — Un commit por tarea

Stagear rutas explícitas, revisar el diff staged y crear un Conventional Commit en inglés. No usar
`git add .`, `git add -A`, amend, force ni trailers de IA.

## R9 — El artefacto manda

Tests verdes no reemplazan build, paquete, imagen o migración cuando son parte del artefacto entregable.

Verde tampoco prueba lo que la tarea prometió. El criterio de aceptación que ningún test asercia no está
cubierto, y el que dice cubrirlo sin aserciar esa propiedad tampoco lo cubre. Eso se ve leyendo el fuente
del test, no su salida: un exit code no distingue la prueba que sostiene el criterio de la que lo nombra.
Y una prueba que nunca se vio fallar no muestra que su aserción funcione: el rojo previo es lo único que
la separa de una que pasa haga lo que haga el código.

## R10 — Publicación humana por defecto

Push, PR, merge, tags, deploy y rollback requieren la autorización configurada para el proyecto.
