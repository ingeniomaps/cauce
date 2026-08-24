# Pruebas del toolkit

Esta carpeta contiene las pruebas del toolkit fuente; no se copia a los proyectos creados con `ops init`.

## Organización

Un archivo por frontera, y cada uno la declara en su encabezado. El eje que decide dónde va un caso es
la **altura**: correr el CLI como lo corre quien lo usa, o llamar la unidad directo. Un mismo módulo
aparece en los dos lados, y lo que cambia es qué se prueba de él.

### El CLI, en un proceso aparte

- `ops.test.js`: la puerta de entrada — cómo parsea, qué banderas rechaza y cuándo se niega a correr.
- `instance.test.js`: `init`, `upgrade`, `destroy`, y el `scan` y el `onboard` que reconocen un workspace.
- `planning.test.js`: `check`, `tree`, `context` y `archive` contra una instancia de verdad.
- `wiring.test.js`: `automation` e `integration` — qué queda instalado en una instancia.
- `agents.test.js`: el catálogo de cargos y el ciclo que va del informe semanal a la propuesta aplicada.
- `flows.test.js`: el catálogo de equipos leído como contrato — DAG de etapas, entregables, casos.
- `bench.test.js`: el banco de evaluación, la instancia desechable donde se mide un cargo.
- `fork.test.js`: adoptar un cargo del catálogo y la deriva que se abre después.
- `lifecycle.test.js`: el ciclo de una empresa contra el **tarball**, que es lo único que un consumidor
  ve. Los demás corren contra el repositorio, así que es el único que detecta un `files` incompleto.

### Las unidades, sin levantar un proceso

- `contracts.test.js`: los contratos de planificación como datos — parser, validadores, evidencia.
- `integrations.test.js`: el registro y el adaptador de Jira. Vive aparte porque cambia cuando cambia
  Jira, no cuando cambia el protocolo.
- `core.test.js`: lo que el motor sabe de sí mismo — ownership, changelog, manifiesto, esquema de config.
- `bootstrap.test.js`: el recorrido interactivo posterior a `init`, sin npm, sin terminal y sin red.
- `hooks.test.js`: qué decide cada guard. Los dos lados siempre: qué bloquea y qué deja pasar, y por qué
  motivo — un guard que bloqueara todo pasaría un archivo que sólo probara frenos.
- `runners.test.js`: qué instala cada adaptador y que ninguna ruta suponga dónde quedó instalado.
- `workflows.test.js`: los recorridos leídos como **fuente**. Afirma lo que sólo se ve leyendo —schemas
  y texto de prompt—; que un freno frene lo comprueban las suites que lo ejecutan.

### Los recorridos, ejecutados

- `autobuild.test.js` y `flow.test.js`: los mismos recorridos **corridos**, con los subagentes simulados.
  Leer el fuente ve que un freno está escrito; sólo ejecutarlo ve que frene cuando toca y deje pasar
  cuando no.

### El repositorio y su fábrica

- `repo.test.js`: lo que este repo se promete a sí mismo — que la documentación no cite un comando que no
  existe, que el código respete sus convenciones y que el tarball no lleve lo que no debe.
- `ci.test.js`: los workflows de GitHub Actions, que comparten la palabra con los recorridos de Cauce y
  nada más.

### Arnés y herramientas

- `environment.js`: limpia el entorno heredado y da lo que casi toda suite monta: `tempRoot()`, la raíz
  que se borra al salir; `run()`, el CLI en un proceso aparte; `linkEngine()`, el paquete de una
  instancia; y las fábricas compartidas, `opsConfig()` y `filesBelow()`.
- `workflow.js`: renderiza un workflow y lo vuelve invocable. Lo usan las dos suites que ejecutan uno; el
  guion y el arnés de cada una siguen siendo suyos.
- `coverage.sh` y `coverage-files.js`: el umbral global y el piso por archivo.
- `dead-imports.js`: imports que ninguna suite usa, buscados sacándolos y corriendo el archivo. Tarda
  ~90 s y por eso queda fuera de `ci`: se corre con `make dead-imports` cuando se mueven imports.
- `hooks-smoke.sh`: ejecutabilidad de los wrappers POSIX.
- `fixtures/`: respuestas externas deterministas y sin credenciales.

## Comandos

```bash
make test
make coverage
```

`make coverage` mide únicamente `engine/**/*.js` y `automatization/**/*.js`, y excluye las copias de
instancias creadas en proyectos temporales. Exige dos cosas: un umbral global de líneas, funciones y
ramas, y un piso por archivo registrado en `coverage-baseline.json`. Los valores viven en
`coverage.sh` —no se repiten acá, porque un número copiado envejece sin que nada falle—.

Los pisos van unos puntos debajo de lo real, para que el trabajo normal no los toque y para absorber lo
que varía entre corridas. Se suben con `npm run coverage:update`, que mide tres veces y toma el mínimo:
una sola corrida deja subir un piso por suerte y el gate queda fallando al azar.

Las pruebas no deben autenticar cuentas, escribir en proveedores externos ni depender de red. Cada caso que
necesite un proyecto mutable debe crearlo bajo el directorio temporal del sistema.
