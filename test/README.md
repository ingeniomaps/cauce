# Pruebas del toolkit

Esta carpeta contiene las pruebas del toolkit fuente; no se copia a los proyectos creados con `ops init`.

## Organización

- `agents.test.js`: distribución, aprendizaje y evaluación de agentes.
- `engine.test.js`: configuración e integraciones en aislamiento.
- `hooks.test.js`: decisiones permitidas y bloqueadas por los guards.
- `ops.test.js`: recorridos end-to-end del CLI y de una instancia generada.
- `runners.test.js`: contratos y capacidades declaradas por cada runner.
- `workflows.test.js`: fases y neutralidad de los workflows.
- `teams.test.js`: manifiestos, agentes, dependencias, gates y comandos de equipos.
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
