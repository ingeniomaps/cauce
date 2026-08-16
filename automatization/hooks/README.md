# Hooks

Los hooks convierten invariantes comprobables en gates mecánicos. La base recomienda proteger:

- comandos destructivos, force, amend y stage indiscriminado;
- escritura de secretos o credenciales;
- edición manual de código generado y drift respecto a OpenAPI/SQL;
- commits sin Verify aplicable;
- cierre de sesión con planning o integraciones inválidas;
- modificación del protocolo durante una tarea de producto.
- escrituras fuera de las raíces declaradas del workspace;
- reescritura de migraciones y SQL destructivo;
- publicación, instalaciones globales y drift entre manifests y lockfiles.

La lógica portable vive en `engine/hooks/run.js`; los `guard-*.sh` son entradas ejecutables comunes. Cada
adaptador de `runners/` conecta los eventos de su herramienta con esos mismos guards.

## Cómo se ejecutan

```text
Claude / Codex / Antigravity / Gemini
        ↓ evento del runner
automatization/hooks/guard-shell.sh · guard-files.sh   (grupo)
o automatization/hooks/guard-<nombre>.sh               (guard suelto)
        ↓ nombre del grupo o del guard
automatization/hooks/run-hook.sh
        ↓ localiza el runtime
node_modules/@ingeniomaps/cauce/engine/hooks/run.js (instancia)
o engine/hooks/run.js (repositorio del toolkit)
```

Los `guard-*.sh` son wrappers pequeños a propósito: ofrecen una entrada ejecutable estable para cada
runner, mientras la lógica se prueba y mantiene una sola vez en `engine/hooks/run.js`.

## Grupos por evento

`hookGroups` en `engine/hooks/run.js` es la única definición de qué guards corren en cada evento:

| Grupo | Guards | Wrapper |
|---|---|---|
| `pre-shell` | destructive, git-add, dependencies, governance, verify | `guard-shell.sh` |
| `pre-files` | secrets, generated, workspace-boundary, engine, migrations, integration-snapshot | `guard-files.sh` |
| `stop` | planning-drift | `guard-planning-drift.sh` |

Registrar el grupo gasta un proceso por herramienta en lugar de cinco, con el mismo orden y la misma
semántica: el primer guard que bloquea corta la ejecución. Un runner que necesite granularidad fina puede
seguir registrando los wrappers individuales.

Para inspeccionar qué hace cada hook y cuándo se ejecuta:

```bash
node tools/ops.js automation list-hooks .
```

## El motor no se edita desde la empresa

`engine` es el único guard cuyo comportamiento depende de dónde corre, y la distinción es deliberada:
en una instancia bloquea toda escritura bajo `node_modules/@ingeniomaps/cauce`; en el repositorio del
toolkit —`mode: toolkit` en `ops.config.json`— queda inerte, porque ahí el motor es el producto.

`workspace-boundary` no alcanzaba: en una instalación `node_modules/` cae dentro de la raíz declarada,
así que editar el motor le parecía legítimo. Y el daño de esa edición es silencioso por partida doble.
El próximo `npm install` la borra, de modo que el arreglo se pierde justo cuando alguien creyó haberlo
hecho; y hasta entonces la empresa corre un motor que no coincide con la versión que declara, que es la
forma habitual de un bug irreproducible.

La regla que codifica: **un problema del motor se reporta y se arregla arriba.** Lo que sí es de cada
empresa —sus cargos, sus equipos, sus integraciones, su planificación— queda abierto y el guard no lo
toca.
