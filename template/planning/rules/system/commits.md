# Commits y entrega

## R8 — Un commit por naturaleza

Stagear rutas explícitas, revisar el diff staged y crear un Conventional Commit en inglés. No usar
`git add .`, `git add -A`, amend, force ni trailers de IA.

Dónde corta un commit lo decide la naturaleza del diff, no su tamaño ni un conteo. Una tarea suele
tener una sola, y por eso un commit por tarea es lo habitual; cuando tiene dos, se hacen dos. Un
refactor y el arreglo de traducción que lo acompaña, juntos en un commit, ya no se pueden revertir
por separado, y quien revise tiene que volver a separarlos a mano.

La unidad de aceptación y de evidencia sigue siendo la tarea: su entrada de DONE registra todos los
commits que produjo, separados por `;`. Partir el diff no parte la aceptación.

## R9 — El artefacto manda

Tests verdes no reemplazan build, paquete, imagen o migración cuando son parte del artefacto entregable.

Verde tampoco prueba lo que la tarea prometió. El criterio de aceptación que ningún test asercia no está
cubierto, y el que dice cubrirlo sin aserciar esa propiedad tampoco lo cubre. Eso se ve leyendo el fuente
del test, no su salida: un exit code no distingue la prueba que sostiene el criterio de la que lo nombra.
Y una prueba que nunca se vio fallar no muestra que su aserción funcione: el rojo previo es lo único que
la separa de una que pasa haga lo que haga el código.

Pero el rojo previo prueba ausencia —el método no existe, la pantalla no está montada—, y eso no distingue
una implementación sutilmente equivocada de una correcta. Lo que sí la distingue es romper, ya con el código
puesto, exactamente lo que el caso dice cuidar, y verlo ponerse rojo por eso. Si no se pone rojo, no lo cuida,
y la cobertura no lo va a decir: mide qué líneas se ejecutan, no qué defectos se atrapan.

La precondición del caso también cuenta. Si el estado en que arranca no puede ocurrir por el camino de
producción, lo que prueba tampoco: queda verde para siempre sobre algo que nadie va a vivir.

## R10 — Publicación humana por defecto

Push, PR, merge, tags, deploy y rollback requieren la autorización configurada para el proyecto.
