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

`make coverage` mide únicamente `engine/**/*.js` y `automatization/**/*.js`. Excluye las copias de
instancias creadas en proyectos temporales y exige como mínimo 75% de líneas, 75% de funciones y 45% de
ramas.

Las pruebas no deben autenticar cuentas, escribir en proveedores externos ni depender de red. Cada caso que
necesite un proyecto mutable debe crearlo bajo el directorio temporal del sistema.
