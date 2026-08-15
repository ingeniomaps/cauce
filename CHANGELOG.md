# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/) y versionado según
[SemVer](https://semver.org/lang/es/).

`cauce upgrade` reemplaza `system/` completo sin pedir confirmación. Este archivo es lo que hace que
esa operación sea confiable en vez de sólo cómoda: acá se lee qué cambió antes de aplicarlo. Por eso
un cambio en el protocolo, en las reglas del sistema o en un guard es visible para el usuario y sube
minor aunque no toque una sola línea de código.

## [0.2.0] - No publicado

### Añadido

- `cauce upgrade` actualiza una instancia sin tocar nada del proyecto, con `--check` para saber si hay
  algo pendiente y `--force` para descartar ediciones locales del runtime. Antes no existía forma de
  actualizar: cada proyecto quedaba congelado en la versión con la que nació.
- La frontera `system/` se extendió a `planning/rules/`, `teams/` y `agents/`. Un archivo propio con el
  mismo nombre, ID o slug reemplaza al del sistema, y `check` lo reporta como override explícito.
- Los 45 cargos del catálogo se instalan en el runner como skills invocables por nombre. Antes viajaban
  a cada proyecto sin que ningún runner los usara.
- `cauce agents list` resuelve la precedencia del catálogo y marca cuáles son propios del proyecto.
- El motor se declara como dependencia npm cuando el repo ya usa npm, y se copia sólo cuando no.
- Las instancias registran `cauceVersion` en `ops.config.json`.

### Cambiado

- Los cargos que trae Cauce se movieron a `agents/roles/system/`. Un proyecto que quiera su propia
  versión de un cargo la escribe en `agents/roles/` con el mismo slug.
- Las composiciones de equipo se movieron a `teams/system/`.
- `tools/ops.js`, el wrapper de hooks y el bridge de Antigravity resuelven el motor en cascada:
  dependencia npm, copia local, repositorio del toolkit.
- `automation install` reemplaza los guards que este mismo toolkit había registrado sueltos por el
  grupo que los cubre. Sin esa poda, una instalación previa ejecutaba cada guard dos veces por
  herramienta; con `verify` eso significaba correr la suite de tests dos veces en cada commit.

### Corregido

- `upgrade` ya no borra archivos que el proyecto agregó al runtime, como un guard propio.
- El README de `automatization/runners/` que recibe un proyecto es el que le habla al proyecto, no el
  que documenta el contrato de adaptadores; antes llegaba uno u otro según se usara `--force`.
- `team check` distingue entre un agente inexistente y uno ambiguo.

## [0.1.0] - 2026-08-14

Primera publicación como `@ingeniomaps/cauce`.

- CLI determinista de planificación: `init`, `check`, `tree`, `context`, `archive`.
- Protocolo agnóstico al runner con adaptadores para Claude, Codex, Gemini y Antigravity.
- Once guards portables agrupados por evento, un proceso por llamada de herramienta.
- Catálogo de 45 cargos con evaluaciones y ciclo de aprendizaje mensual.
- Integraciones por staging de sólo lectura, con Jira como primer proveedor.
