---
caso: 144
titulo: La puerta de pisos de cobertura bloquea el comando que registra un piso, así que un archivo nuevo del motor no puede pasarla ni actualizarla
estado: resuelto
resuelto-en: 0.89.0
prioridad: media
version-detectada: 0.89.0
---

# 144 — El error manda a correr un comando que ese mismo error impide completar

**🟢 resuelto en 0.89.0** · detectado en 0.89.0 · prioridad **media** — el comando que el error recomienda
ahora se puede completar, y medir cero dejó de anunciarse como éxito

## Resumen

Agregar un archivo al motor deja la puerta en rojo con un mensaje que dice exactamente qué hacer:

```
✗ engine/cli/validate.js: sin piso registrado. Si es nuevo, corré "npm run coverage:update" y revisá el número
```

Y ese comando **no puede completarse mientras el piso falte**. `npm run coverage:update` es
`bash test/tools/coverage.sh --update`, que arranca con `set -euo pipefail`, corre `node --test` tres
veces —para medir tres corridas y tomar el mínimo— y recién en la última línea invoca
`coverage-files.js … --update`, que es lo único que escribe el piso.

Las tres corridas ejecutan la suite entera, y la suite incluye la prueba que está fallando por el piso que
falta. `node --test` sale distinto de cero, `set -e` corta el script, y la línea que registraría el piso
nunca se ejecuta.

## Reproducción

Con cualquier archivo nuevo bajo `engine/` que las pruebas ejerciten:

```bash
npm run ci              # ✗ engine/<nuevo>.js: sin piso registrado … corré "npm run coverage:update"
npm run coverage:update # exit 1, y el piso sigue sin registrarse
```

Ocurrido el 2026-09-14 al partir `engine/cli/planning.js` y crear `engine/cli/validate.js`.

La salida a mano funciona y es la que se usó: generar los tres `lcov` invocando `node --test` con los
mismos flags que el script, ignorando su código de salida, y llamar al actualizador directo.

```bash
node test/tools/coverage-files.js lcov-1.info lcov-2.info lcov-3.info --update
# ✓ piso registrado sobre 3 corrida(s) para 68 archivo(s)
```

## Síntoma

El mensaje es correcto en el qué y manda a un callejón en el cómo. Quien lo siga corre el comando, ve
`exit 1`, y lo más probable es que concluya que su cambio rompió algo más — el stack que imprime es el de
la prueba de pisos, no el del actualizador, así que nada dice que el registro no llegó a correr.

Y no es un caso raro: le pasa a **cualquiera que agregue un archivo al motor**, que es trabajo corriente.

## Causa raíz

`test/tools/coverage.sh`. El script mezcla dos trabajos que necesitan tratos opuestos ante un fallo: las
corridas de `node --test` existen para **producir los lcov**, y su veredicto no importa para eso; pero
`set -euo pipefail` las trata como una puerta y aborta con la primera que falle.

## Fix propuesto

1. **Que las corridas de medición no decidan.** En `--update`, el exit de `node --test` no debería cortar:
   lo que hace falta de esas corridas es el archivo lcov, no su veredicto. **Hay un borde que resolver**:
   ignorar el exit a secas enmascara una suite que no corrió por otra razón —un error de sintaxis, por
   ejemplo— y ahí el lcov saldría vacío o a medias. Conviene distinguirlo comprobando que el lcov tenga
   contenido antes de usarlo, en vez de mirar el código de salida.
2. **Que el mensaje diga la salida real.** Si el registro no se puede hacer con el comando que sugiere,
   que nombre la invocación directa de `coverage-files.js … --update`. Es lo más barato y no arregla la
   causa.
3. **Que `--update` corra sin la puerta de pisos.** Excluir esa prueba de las corridas de medición la deja
   fuera del lcov que ella misma alimenta, así que habría que comprobar que eso no le baje el piso a
   `coverage-files.js`.

## Tradeoffs

- La 1 es la que cierra la clase y toca un script con `set -e` puesto a propósito; aflojarlo mal cambia
  qué fallos se ven en la puerta, que es lo contrario de lo que este repositorio quiere.
- La 2 sola deja el defecto en pie y sólo mejora el cartel. Vale como acompañamiento, no como arreglo.
- **Vale la pena mirar si el mismo `set -e` esconde otros finales mudos del script**, porque el modo de
  fallo no es del `--update` sino de la forma: una etapa de medición gobernada como si fuera una puerta.

## Prioridad

**Media.** No rompe nada publicado y tiene salida, pero bloquea un flujo corriente —agregar un archivo al
motor— y lo hace con un mensaje que manda en círculo. Lo caro es el rato que se pierde creyendo que el
cambio propio está roto.

## Contexto de descubrimiento

Salió de partir `engine/cli/planning.js` para pagar la deuda que dejaron los casos 137 y 138, el
2026-09-14. El archivo nuevo entró a la puerta de pisos sin piso, y registrarlo exigió deducir el
procedimiento leyendo `coverage.sh`.

## Relacionados

- **137**, **138** — el trabajo del que salió, no la causa.

## Cierre

**🟢 resuelto en 0.89.0** · `test/tools/coverage.sh`, `test/tools/coverage-files.js`,
`test/repo/coverage-floors.test.js`

Se tomó la **opción 1**, con el borde que el propio caso anotaba resuelto de una forma que la medición
obligó a ampliar: no alcanzaba con comprobar el lcov en el script, porque la herramienta que lo consume
tampoco distinguía medir nada de medir todo.

### Contra lo que el caso enumeró

- **Opción 1, que las corridas de medición no decidan** — construida. El exit de `node --test` deja de
  cortar la medición y en su lugar se exige que cada lcov traiga contenido, que es lo único que separa
  una suite que falló de una que no llegó a arrancar.
- **«Hay un borde que resolver: ignorar el exit a secas enmascara una suite que no corrió»** — el caso
  tenía razón, y el borde era **más ancho** de lo que suponía. Medido: `coverage-files.js --update` con un
  lcov vacío imprimía `✓ piso registrado sobre 1 corrida(s) para 0 archivo(s)` y salía en **0**. O sea que
  la comprobación en el script sola habría dejado en pie una herramienta que se felicita sobre cero. Se
  arregló también ahí, con la misma negativa que este repositorio ya aplica cuatro veces en
  `repo.test.js`, donde un recorrido sin hallazgos falla en vez de dar un verde sobre nada.
- **Opción 2, que el mensaje diga la salida real** — **se decidió que no**, y el propio caso anticipaba por
  qué: «deja el defecto en pie y sólo mejora el cartel». Con la 1 construida, el comando que el mensaje
  recomienda **se puede completar**, así que el cartel dejó de mandar en círculo sin tocarlo.
- **Opción 3, que `--update` corra sin la puerta de pisos** — **se decidió que no**. El caso pedía
  comprobar que eso no le bajara el piso a `coverage-files.js`, y la comprobación dio otra cosa: ese
  archivo **no figura en el baseline**, así que no había piso que bajar. Lo que sí haría es dejar sin medir
  a la herramienta que decide todos los pisos, justo en la corrida que los registra. No aporta sobre la 1.
- **Tradeoff, «toca un script con `set -e` puesto a propósito; aflojarlo mal cambia qué fallos se ven»** —
  se respetó: `set -euo pipefail` sigue en la línea 2 y sólo la invocación de medición tolera su exit. Lo
  demás —el smoke de hooks, el actualizador— sigue cortando igual.
- **«Vale la pena mirar si el mismo `set -e` esconde otros finales mudos del script»** — se miró. El script
  tiene un solo `set -e` y, ahora, dos etapas gobernadas distinto: la medición, que tolera el exit y exige
  contenido, y el resto, que corta. No quedan finales mudos ahí; el que había era éste.

### Lo que el caso no preveía

- **El `trap` se llevaba el material para reintentar.** `trap limpiar EXIT` corría también al abortar, así
  que al morir el script borraba los lcov ya medidos: quien quedaba a mitad no podía retomar desde ahí y
  tenía que regenerarlos enteros. Pasó a `trap limpiar 0`, que limpia sólo en la salida sana.
- **La primera sonda que escribí no midió nada.** Apuntó `--baseline=` a un archivo inexistente y la
  herramienta reventó en `readFileSync` antes de mirar el lcov; el resultado se leía como un fallo del
  sujeto. Rehecha con un baseline real, salió el hallazgo de arriba.

### Qué se corrió

- **Rojo previo**: las dos pruebas nuevas fallan contra el árbol de hoy, una con el mensaje del defecto
  textual —`✓ piso registrado sobre 1 corrida(s) para 0 archivo(s)`— y la otra en «el exit de node --test
  deja de cortar la medición».
- **Los patrones de la prueba del script, validados contra un arreglado simulado** antes de construir:
  los tres fallan sobre el script de hoy y pasan sobre el corregido, así que ninguno acepta cualquier cosa.
  Hacía falta porque esa prueba asercia texto y no conducta.
- **La conducta real, en banco desechable**: se creó un archivo nuevo del motor —el escenario exacto del
  caso— y `npm run coverage:update` completó las tres corridas y registró `✓ piso registrado sobre 3
  corrida(s) para 69 archivo(s)`, con el archivo nuevo adentro. Antes moría en la primera.
- **Mutaciones**, en copia con verde de control 13/13: devolver el `if` de la negativa mata «actualizar
  sobre un lcov sin archivos se niega»; quitar el `|| true` mata «coverage.sh mide por el contenido».
- **El `trap` comprobado en la salida sana**: sigue borrando los temporales cuando el script termina bien.
- **Verde**: `npm run ci` en 0 y **823 pruebas**.
