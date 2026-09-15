---
caso: 149
titulo: `coverage:update` se niega a registrar sobre cero archivos pero no sobre uno, así que un registro de 68 pisos se reduce a 1 y anuncia éxito
estado: abierto
prioridad: media
version-detectada: 0.90.0
---

# 149 — El guard que cuida el registro mira el caso imposible y no el probable

**🔴 abierto** · detectado en 0.90.0 · prioridad **media** — el registro de pisos es lo único que sostiene
la puerta de cobertura, y se puede vaciar casi entero con exit 0 y un mensaje de éxito

## Resumen

`coverage-files.js --update` reescribe `coverage-baseline.json` con lo que midió. Antes de escribir tiene
un guard, del caso 144:

```js
if (!Object.keys(record).length) {
  console.error('✗ ningún archivo medido: las corridas no dejaron cobertura, así que no hay piso que '
    + 'registrar. Revisá que la suite haya arrancado.')
  process.exit(1)
}
```

Se niega con **cero** archivos. Con **uno** registra: escribe un baseline de un solo piso, borra los 67
restantes y anuncia `✓ piso registrado`. Exit 0.

El registro no es un archivo más: es lo que hace que la puerta de cobertura signifique algo. Vacío,
`coverage-files.js` no tiene contra qué comparar y la puerta pasa a no cuidar nada.

## Reproducción

Ocurrió dos veces el 2026-09-14 sin que nadie lo buscara, mientras se construía el arreglo del caso 148.
Cualquier cosa que produzca un lcov corto alcanza —un `node` interpuesto, una corrida que muere temprano,
un glob que matchea de menos:

```bash
printf 'SF:engine/cli/ops.js\nDA:1,1\nLF:1\nLH:1\nend_of_record\n' > mini.lcov
node test/tools/coverage-files.js mini.lcov --update
```

## Síntoma

```
  = engine/cli/ops.js: functions llegó a 100% (piso sigue en 85%)
✓ piso registrado sobre 3 corrida(s) para 1 archivo(s)
```

Exit 0. El registro quedó con **1 archivo** donde tenía **68**, y el diff son 335 líneas borradas. Nada en
la salida dice que se perdió nada: «para 1 archivo(s)» es la única pista, y se lee igual que una
actualización sana de un repositorio chico.

## Causa raíz

`test/tools/coverage-files.js`, el guard de `--update`. Mide la cantidad absoluta contra cero en vez de
compararla con lo que el registro ya tenía. El caso 144 lo escribió para atrapar «la suite no arrancó», y
para eso alcanza; lo que no cubre es «la suite arrancó a medias», que produce un registro plausible.

## Fix propuesto

Las tres protegen el registro de formas distintas; lo que falta es elegir cuánta fricción se acepta en el
caso legítimo.

1. **Comparar contra lo que había.** Si el registro nuevo tiene menos archivos que el anterior, negarse y
   nombrar cuántos se pierden, con una salida explícita para el caso legítimo —retirar archivos del motor
   es válido—. Es el patrón que este repositorio ya usa en `suite.test.js` con `SUITE_FLOOR`: no un
   límite, un detector de encogimiento silencioso.
2. **Exigir que el lcov cubra los archivos que el registro conoce.** Más estricto y más frágil: un archivo
   legítimamente retirado haría fallar el registro hasta editarlo a mano.
3. **Dejarlo y documentar que `--update` se corre sólo desde una corrida completa.** Lo más barato y lo
   que menos protege: la forma en que ocurrió las dos veces fue justamente una corrida que parecía
   completa.

## Tradeoffs

- La 1 necesita una salida para el caso legítimo, y esa salida es por donde se vuelve a colar el defecto
  si se la hace demasiado fácil.
- La 2 convierte cada retiro de archivo en una edición manual del registro.
- La 3 deja en pie un borrado que no avisa.
- **Vale la pena mirar si el mismo patrón está en otros registros del repositorio** —`coverage-baseline`
  no es el único archivo generado que una herramienta reescribe entero.

## Prioridad

**Media.** No rompe nada por sí solo y el daño se revierte con `git checkout` mientras el archivo esté
trackeado. Lo que lo hace importante es que el registro mutilado **se lee igual que uno sano**: si entra
a un commit, la puerta de cobertura deja de cuidar 67 archivos y ninguna prueba lo nota.

## Contexto de descubrimiento

Salió de construir el arreglo del caso 148, el 2026-09-14. Dos veces —una sonda y después la propia
prueba nueva— corrieron `coverage.sh --update` con la suite interceptada, y las dos redujeron el registro
de 68 archivos a 1 sin que nada avisara. Se detectó mirando `git status`, no por una puerta.

## Relacionados

- **148** — el caso en cuyo arreglo ocurrió, dos veces.
- **144** — el guard es suyo y es correcto para lo que fue escrito; esto es el borde que quedó afuera.
- **129** — el caso que le puso su primera prueba a esta herramienta.
