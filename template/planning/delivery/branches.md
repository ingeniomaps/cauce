# Ramas y ciclo de integración

> Camino recomendado. Adaptar en `project.md` y registrar excepciones durables mediante ADR.

## Topología por defecto

```text
main                 tronco protegido y siempre integrable
<type>/<hito>        rama breve para una unidad revisable
release/vX.Y         opcional; solo para mantener un candidato congelado
hotfix/<slug>        emergencia desde la versión desplegada
```

No crear ramas permanentes por ambiente. `dev`, `staging` y `production` son destinos de despliegue.

## Unidad de cambio

- La épica organiza resultados de varias semanas; normalmente no es una rama.
- El hito puede ser unidad de rama y PR cuando sus tareas se revisan juntas.
- La tarea es unidad de aceptación y evidencia en DONE.
- El commit es una unidad coherente; una tarea puede necesitar varios commits.

Una rama por hito es el default, no un dogma. Dividirla si contiene grupos desplegables y revisables de forma
independiente. Si una rama vive más de una semana o acumula conflictos, reducir la unidad de integración.

## Nombres

Usar `<type>/<slug>` con un vocabulario corto, por ejemplo `feat`, `fix`, `refactor`, `perf`, `docs`, `test`,
`ci`, `build` y `chore`. El nombre documenta intención; nunca decide por sí solo versionado, permisos o CI.

## Ciclo recomendado

1. Crear la rama desde `main` actualizado.
2. Implementar tareas con commits revisables y pruebas proporcionales al riesgo.
3. Abrir PR hacia `main`; ejecutar lint, tipos, tests, integración, build y scans aplicables.
4. Usar preview efímero cuando aporte una validación que CI no puede responder.
5. Obtener las aprobaciones requeridas y mergear sin reescribir evidencia necesaria.
6. Eliminar la rama y desplegar `main` a dev si existe ese ambiente.

El proyecto decide entre merge commit, rebase o squash. Si `commitPerTask` es parte de la evidencia y los
commits son la unidad de revert, no usar squash. Si los commits intermedios no son durables, documentar por qué
el squash es preferible.

## Protección de main

- Sin commits directos, amend ni force-push.
- CI requerido sobre PR, sin depender de un whitelist frágil de nombres de rama.
- Reviews y ownership proporcionales al área cambiada.
- Lo incompleto entra apagado solo cuando existe un release toggle seguro y con plan de eliminación.

## Hotfix

Un hotfix parte del artefacto o tag desplegado, no necesariamente de `main`, porque el tronco puede contener
trabajo aún no liberado. El arreglo pasa por el camino de verificación más corto que conserve seguridad, se
versiona y vuelve a `main` mediante un cambio revisable. No termina hasta que ese retorno queda integrado.
