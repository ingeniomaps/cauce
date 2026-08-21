# Pruebas del toolkit

Esta carpeta contiene las pruebas del toolkit fuente; no se copia a los proyectos creados con `ops init`.

## Organización

- `agents.test.js`: distribución, aprendizaje y evaluación de agentes.
- `fork.test.js`: adoptar un cargo del catálogo, devolverlo y la deriva que se abre mientras tanto.
- `engine.test.js`: configuración e integraciones en aislamiento.
- `hooks.test.js`: decisiones permitidas y bloqueadas por los guards.
- `ops.test.js`: recorridos end-to-end del CLI y de una instancia generada.
- `runners.test.js`: contratos y capacidades declaradas por cada runner.
- `workflows.test.js`: fases y neutralidad de los workflows, leídos como fuente. Afirma lo que sólo se ve
  leyendo —schemas y texto de prompt—; que un freno frene lo comprueban las suites que lo ejecutan.
- `autobuild.test.js`: el mismo recorrido **ejecutado**, con los subagentes simulados. Leer el fuente ve
  que un freno está escrito; sólo ejecutarlo ve que frene cuando toca y deje pasar cuando no.
- `teams.test.js`: manifiestos, agentes, dependencias, gates, precedencia y comandos de equipos.
- `bench.test.js`: el banco de evaluación, la instancia desechable donde se mide un cargo.
- `ci.test.js`: los workflows de GitHub Actions del repositorio, que comparten la palabra con los
  recorridos de Cauce y nada más.
- `lifecycle.test.js`: el ciclo de una empresa contra el **tarball**, que es lo único que un consumidor
  ve. Los demás corren contra el repositorio, así que es el único que detecta un `files` incompleto.
- `environment.js`: limpia el entorno heredado y da lo que casi toda suite monta: `tempRoot()`, la raíz
  que se borra al salir; `run()`, el CLI en un proceso aparte; `linkEngine()`, el paquete de una instancia.
- `workflow.js`: renderiza un workflow y lo vuelve invocable. Lo usan las dos suites que ejecutan uno
  —`autobuild.test.js` y `team.test.js`—; el guion y el arnés de cada una siguen siendo suyos.
- `coverage.sh` y `coverage-files.js`: el umbral global y el piso por archivo.
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
