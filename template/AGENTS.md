# Reglas de construcción

Este archivo gobierna el qué y el cuándo. `planning/PROTOCOL.md` gobierna el flujo y
`planning/rules/` el cómo.

## Mapa real

Completar antes de la primera tarea:

- Qué producto se construye.
- Qué repos o servicios existen y dónde viven.
- Dónde documenta cada servicio sus comandos de test, lint y build.
- Qué directorios son legacy o están fuera de alcance.

El mapa no debe duplicar documentación técnica: enlaza a la fuente de verdad de cada servicio.

## Integraciones y ambientes

Por defecto, todo sistema externo se considera real y de solo lectura. Sin aprobación humana explícita:

- no desplegar, publicar, enviar mensajes ni escribir en producción;
- no cobrar, reembolsar, gastar créditos ni llamar APIs con costo de forma repetida;
- no editar secretos, credenciales, DNS, permisos o cuentas;
- no borrar datos ni ejecutar migraciones irreversibles.

Documentar excepciones concretas aquí. Un entorno de desarrollo o sandbox debe nombrarse explícitamente.

## Cargos disponibles

`agents/` es un catálogo de cargos reutilizables. Cada uno declara en su `SKILL.md` cuándo actuar, qué
decide, qué no le corresponde y cuál es su entrega mínima; sus métodos viven en `references/`.

Antes de resolver algo que cae claramente en un cargo —una decisión de producto, un diseño de
arquitectura, una estrategia de pruebas—, adoptá ese contrato en vez de improvisar el criterio. Los
límites del cargo no son sugerencias: un cargo que no puede decidir solo, no decide solo.

En Claude y Antigravity los cargos aparecen como skills invocables por nombre. En Codex y Gemini no hay
mecanismo nativo: leé directamente el `SKILL.md` del cargo. Los que trae
Cauce están en `agents/roles/system/`; los propios del proyecto, en `agents/roles/`, donde un mismo
slug reemplaza al del sistema.

`teams/` compone varios cargos en etapas con gates de salida y un dueño por dominio de decisión;
`node tools/ops.js team show <slug>` muestra el recorrido.

## Qué se puede editar y qué no

Todo directorio `system/` pertenece a Cauce y se reemplaza completo al actualizar. **Nunca editar nada
dentro de `system/`**: el cambio se pierde en la siguiente actualización y, mientras tanto, ese archivo
deja de recibir mejoras.

Para cambiar algo del sistema hay dos operaciones, las dos junto a `system/`, nunca dentro:

- **Anexar**: un archivo nuevo con nombre o ID propio. Convive con los del sistema.
- **Reemplazar**: un archivo con el mismo nombre o ID que uno de `system/`. El del proyecto manda y
  `check` lo reporta como override explícito en vez de fallar.

Aplica a `planning/business-rules/`, `planning/adr/`, `planning/rules/`, `teams/` y `agents/`. El resto de
`planning/` —roadmap, backlog, WIP, done, inbox y acciones humanas— es del proyecto y no se toca al
actualizar.

`automatization/hooks/` es runtime del toolkit y se reemplaza entero. No tiene `system/` porque no hace
falta: lo que un proyecto necesita ya funciona sin editarlo. Los adaptadores de runner y los workflows ni
siquiera están acá — los lee el motor desde el paquete.

- **Agregar un guard propio**: creá `automatization/hooks/guard-<nombre>.sh` y registralo en la
  configuración de tu runner. Sobrevive a cada actualización, porque el toolkit no lo conoce.
- **Desactivar un guard**: quitalo de esa configuración, que es del proyecto. El archivo sigue ahí.
- **Cambiar un comportamiento**: agregá el tuyo, no edites el del toolkit.

Un guard existente **no se edita**: `upgrade` detecta el cambio y se detiene antes de pisarlo, y con
`--force` deja registrado qué descartó.

## Cómo leer el estado

Antes de abrir un archivo de `planning/`, preguntarle al CLI: es determinista, no gasta contexto y no
muta nada.

- `node tools/ops.js context planning` — gate, mutex de WIP y la tarea que corresponde ahora, con su
  aceptación y sus criterios. Es la entrada correcta para empezar a trabajar.
- `node tools/ops.js tree planning` — panorama de roadmap, backlog, WIP, inbox y done.
- `node tools/ops.js check planning` — validación de contratos y trazabilidad.

Los tres aceptan `--json`. Leer `BACKLOG.md`, `WIP.md` o `HUMAN_ACTIONS.md` completos sólo cuando haga
falta editarlos o cuando el CLI no responda la pregunta.

## Autonomía

El runner puede implementar una tarea promovida dentro del servicio declarado, crear pruebas y hacer
refactors locales necesarios para su aceptación.

Debe detenerse cuando falte una decisión de producto, credencial, cuenta o acción externa; cuando una
verificación siga roja tras un intento razonable; o al cruzar un hito si el protocolo exige checkpoint.
Registra la acción exacta en `planning/HUMAN_ACTIONS.md` y, si bloquea todo, crea
`planning/AWAITING_REVIEW.md`.

Nunca amplía el alcance, promueve sus propias ideas, reescribe el proceso durante una tarea, usa
`git add .`/`git add -A`, hace push/force/amend, ni afirma éxito sin evidencia real.

## Definición de terminado

1. La aceptación se observa y queda cubierta por pruebas cuando existe superficie testeable.
2. Tests, lint, tipos y build aplicables terminan con exit code real.
3. QA valida el comportamiento por el camino real, no por un atajo interno.
4. La deuda residual va a `planning/INBOX.md`.
5. El cambio se commitea por tarea en el repo del servicio y el hash real queda en `DONE.md`.
6. `node tools/ops.js check planning` queda verde.
