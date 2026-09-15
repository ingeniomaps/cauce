---
caso: 149
titulo: `coverage:update` se niega a registrar sobre cero archivos pero no sobre uno, así que un registro de 68 pisos se reduce a 1 y anuncia éxito
estado: abierto
prioridad: media
version-detectada: 0.90.0
---

# 149 — El guard que cuida el registro mira el caso imposible y no el probable

**🔴 abierto** · detectado en 0.90.0 · prioridad **media** — arreglado y a la espera de **0.91.0**, con el
recorrido abajo

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

## Cierre

**Arreglado en la rama; el estado cambia cuando 0.91.0 llegue a npm** ·
`test/tools/coverage-files.js`, `test/repo/coverage-floors.test.js`, `CHANGELOG.md`

Se tomó la **opción 1**, pero **no con el criterio que el caso proponía**. Medir la cantidad era lo obvio
y es lo que menos protege: un registro de 68 que baja a 67 pasaría, y el defecto seguiría entrando por
ahí. Lo que delata la pérdida es la **combinación** — un archivo que sigue en disco, que tenía piso y que
esta corrida no midió.

### Contra lo que el caso enumeró

- **Opción 1, comparar contra lo que había** — construida, con el criterio corregido. El caso pedía
  comparar cantidades «con una salida explícita para el caso legítimo». Esa salida **no hizo falta**:
  un archivo retirado del motor ya no está en `onDisk()`, así que no cae en la negativa. La escapatoria
  que el propio caso temía —«es por donde se vuelve a colar el defecto»— dejó de existir por construcción.
- **Opción 2, exigir que el lcov cubra los archivos que el registro conoce** — **es lo que se construyó**,
  y el caso la descartaba por un motivo que resultó falso: «un archivo legítimamente retirado haría fallar
  el registro hasta editarlo a mano». No, porque el filtro por `onDisk()` lo excluye antes. Las opciones
  1 y 2 eran la misma una vez resuelto ese borde.
- **Opción 3, dejarlo y documentar** — **se decidió que no**, por lo que el propio caso decía: las dos
  veces que ocurrió fue en una corrida que parecía completa, así que documentar no habría cambiado nada.
- **Tradeoff «la 1 necesita una salida para el caso legítimo»** — resuelto: no la necesita, y hay una
  prueba que lo fija —registrar tras retirar un archivo del motor sigue funcionando y saca su piso
  huérfano—.
- **Tradeoff «la 2 convierte cada retiro en una edición manual»** — no ocurre, por lo mismo.
- **Tradeoff «la 3 deja en pie un borrado que no avisa»** — ya no aplica.
- **«Vale la pena mirar si el mismo patrón está en otros registros»** — **queda sin mirar y sale como
  dimensión pendiente, no como hecho.** No se revisó en esta unidad: el registro de archivos largos de
  `repo.test.js` y el `SUITE_FLOOR` de `suite.test.js` son los candidatos obvios, y el segundo ya tiene
  la forma correcta —compara contra un piso escrito—. Quien lo retome empieza por ahí.

### Lo que el caso no preveía

- **El arreglo rompió el arnés del 148, y eso era correcto.** La prueba del 148 fingía la suite con un
  lcov de **un** archivo, que es exactamente lo que este guard declara inválido. No se aflojó el guard: se
  corrigió el arnés para que finja un lcov **completo**, porque lo que esa prueba controla es el exit de
  la suite y todo lo demás tiene que quedar sano. Un arreglo que obliga a corregir un arnés está diciendo
  que el arnés fabricaba un estado imposible.
- **Una de las cuatro mutaciones quedó verde en la primera pasada.** Quitar el filtro por `onDisk()` no
  rompía ninguna aserción, o sea que esa mitad del guard no estaba cubierta. Se agregó el caso del retiro
  legítimo y pasó a morder. Sin la pasada de mutación habría entrado media defensa sin prueba.

### Qué se corrió

- **La validación del criterio antes de escribir una línea**, por los dos lados: sobre el incidente real
  —el lcov de un archivo contra el registro de 68— habría frenado con **67 archivos perdidos**; sobre el
  estado sano da **cero** falsos positivos (cero archivos con piso que ya no existan, cero en disco sin
  piso).
- **Rojo previo**: contra el `coverage-files.js` de HEAD la prueba nueva **falla** —17 pruebas, 16 pass,
  1 fail— y la de contraste pasa en los dos lados, que es lo que muestra que la aserción mira el guard.
- **Cuatro mutaciones, las cuatro en rojo** sobre un clon que arranca verde: quitar el guard entero, no
  filtrar por `onDisk()`, no mirar si se midió, y no negarse nunca.
- **Verde final**: `npm test` → **829 pruebas, 829 pass, fail 0**; `npm run ci` exit 0; `repo.test.js`
  15/15; `issues.test.js` 4/4; registro de cobertura intacto en 68 archivos.
- **Pasada R11 a 0.22** sobre la prosa nueva —caso, herramienta y prueba entre sí—: **ningún par**.
