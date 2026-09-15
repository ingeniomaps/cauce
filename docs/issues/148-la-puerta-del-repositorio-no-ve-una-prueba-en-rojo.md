---
caso: 148
titulo: `npm run ci` no corre la suite, así que una prueba en rojo no frena ni un PR ni una publicación
estado: abierto
prioridad: alta
version-detectada: 0.89.0
---

# 148 — La puerta que todo el repositorio trata como veredicto sale verde con pruebas fallando

**🔴 abierto** · detectado en 0.89.0 · prioridad **alta** — arreglado y a la espera de **0.90.0**, con el
recorrido abajo

## Resumen

`npm run ci` encadena cinco scripts y **ninguno corre la suite**:

```
ci: npm run check && npm run automation:check && npm run integration:check
    && npm run dead-code && npm run coverage
```

El único que la toca es `coverage`, que es `bash test/tools/coverage.sh`, y ahí la suite se invoca con
`|| true` **a propósito** —fue el arreglo del caso 144, para poder registrar un piso con la puerta en
rojo—. Lo que ese script comprueba después es que el lcov no venga vacío, no que las pruebas pasen.

El script que sí falla existe y nadie lo llama desde `ci`:

```
test: bash test/tools/hooks-smoke.sh && node --test "test/**/*.test.js"
```

## Reproducción

En una copia desechable del repositorio, con una prueba que falla a propósito:

```bash
cat > test/repo/rota.test.js <<'EOF'
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
test('esta prueba falla a propósito', () => { assert.equal(1, 2, 'rojo deliberado') })
EOF

node --test "test/**/*.test.js"   # la ve
npm run ci                        # no la ve
```

## Síntoma

```
--- node --test la ve? ---
   ℹ tests 826
   ℹ pass 820
   ℹ fail 6
--- y npm run ci? ---
   ✗ exit 0: LA PUERTA NO LA VE
```

Seis pruebas en rojo y la puerta en verde. No es intermitente: se reprodujo dos veces seguidas con el
mismo resultado.

## Causa raíz

`package.json`, el script `ci`. No es una regresión reciente: se revisaron los tags desde **v0.6.0** y
en ninguno `ci` invoca la suite. El hueco existió siempre.

Lo que lo volvió invisible es que `coverage.sh` **sí** corre `node --test` —con la cobertura puesta—, así
que la salida de `npm run ci` muestra cientos de líneas de pruebas pasando. Se ve exactamente como una
suite ejecutándose, y lo es: lo que no ocurre es que su resultado decida.

## Dónde llega

- **CI de GitHub**: `ci.yml` corre `npm run ci`. Una prueba en rojo **no frena un PR**, y el ruleset de
  `main` exige esos dos checks — que pasarían igual.
- **Publicación**: `prepublishOnly` es `npm run ci`, así que tampoco frena un `npm publish`.
- **La documentación del repositorio**: `AGENTS.md:350` dice «La puerta real es `npm run ci`: `check`,
  automatización, integraciones y cobertura, y `prepublishOnly` la exige antes de publicar». La
  enumeración es correcta y **no incluye las pruebas** — dice la verdad y se lee como si no.

## Fix propuesto

Las tres se pueden construir hoy; lo que falta es elegir dónde pagar el costo.

1. **Encadenar `npm run test` dentro de `ci`.** Una línea. Hay que decidir dónde: antes de `coverage`
   duplica la corrida de la suite —se ejecutaría dos veces, y hoy `coverage` ya tarda—, y eso es el
   tradeoff real, no un detalle.
2. **Que `coverage.sh` falle si hubo pruebas en rojo**, sin perder lo que el 144 arregló. Su `|| true`
   existe para que `--update` pueda registrar un piso con la puerta en rojo; la salida sería distinguir
   los dos modos: en `--update` se tolera, en la corrida normal no.
3. **Dejarlo como está y corregir el `AGENTS.md`**, diciendo que `ci` no cubre la suite y que hay que
   correr `npm test` aparte. Es la opción honesta si se decide no tocar la puerta, y la peor de las tres:
   deja el CI sin cubrir.

En cualquiera de las tres, **falta una prueba que asercie qué encadena `ci`**. Hoy no hay ninguna: se
buscó y no existe. Ése es el motivo de que el hueco viviera 89 versiones sin que nadie lo viera.

## Tradeoffs

- La 1 corre la suite dos veces, y `coverage` ya la corre tres cuando se registra un piso.
- La 2 toca el arreglo del 144, que se ganó su lugar con un caso propio: hay que no romperlo.
- La 3 no cuesta nada y deja el CI sin veredicto real.
- **Vale la pena mirar cuánto tardaría `ci` con la suite adentro**, porque si el costo es alto la
  decisión entre la 1 y la 2 cambia.
- **Vale la pena mirar si alguna versión se publicó con pruebas en rojo.** Es comprobable corriendo la
  suite sobre los tags publicados, y hasta que se mire no se puede afirmar que no pasó.

## Prioridad

**Alta.** No porque haya un defecto conocido colándose, sino porque **ningún verde de este repositorio
significa lo que todos creen**. Cada cierre de caso que dice «`npm run ci` en verde» probó `check`,
automatización, integraciones, dead-code y pisos de cobertura — no que la suite pasara.

## Contexto de descubrimiento

Salió de arreglar el caso 147 el 2026-09-14. Al agregar un workflow nuevo, `ci-schedule.test.js` empezó a
fallar —enumera los workflows a propósito— y `npm run ci` siguió dando exit 0. La contradicción entre las
dos salidas es lo que lo destapó; sin ese choque, el arreglo del 147 se habría commiteado con una prueba
en rojo y la puerta en verde.

## Relacionados

- **147** — el caso que lo destapó, y el mismo modo de fallo un nivel más abajo: una prueba que afirma
  más de lo que mide.
- **144** — el `|| true` de `coverage.sh` es suyo y es correcto; la opción 2 tiene que respetarlo.
- **149** — salió de acá: su guard se niega con cero archivos y no con uno, así que un registro se puede
  mutilar sin que nada avise.
- **150** — salió de acá: siete suites no corren sin `.git`, y eso choca con la regla que manda ejercitar
  en una copia.

## Cierre

**Construido, a la espera de 0.90.0** · `test/tools/coverage.sh`, `test/repo/coverage-floors.test.js`,
`CHANGELOG.md`

Se tomó la **opción 2**, y la eligió el tradeoff que el caso dejó anotado: medir primero cuánto costaría
la 1.

### Contra lo que el caso enumeró

- **«Vale la pena mirar cuánto tardaría `ci` con la suite adentro»** — **se midió, y decidió.** La suite
  sola tarda **45 s** y la puerta entera **50 s**; de esos 50, `check`, `automation:check` e
  `integration:check` tardan 0 s y `dead-code` 1 s, o sea que `coverage` es prácticamente toda la puerta.
  Encadenar `npm test` la llevaría a ~95 s corriendo la misma suite dos veces, y de paso `hooks-smoke.sh`
  otra vez, porque está en `npm test` y en la línea 9 de `coverage.sh`.
- **Opción 1, encadenar `npm run test` en `ci`** — **se decidió que no**: casi el doble de tiempo para
  ejecutar dos veces lo mismo, cuando la 2 cuesta cuatro líneas.
- **Opción 2, que `coverage.sh` falle si hubo pruebas en rojo sin perder lo del 144** — **construida.** El
  exit de `node --test` se captura en `estado` en vez de tirarse, y el corte se aplica sólo fuera de
  `--update`. El `|| true` no se «arregló»: se acotó al modo que lo necesita, que es lo que el 144 pedía
  desde el principio —su opción 1 dice «**en `--update`**, el exit no debería cortar» y el arreglo de
  entonces lo aplicó a los dos caminos.
- **Opción 3, dejarlo y corregir el `AGENTS.md`** — **se decidió que no**, por lo que el propio caso decía:
  deja el CI sin veredicto real.
- **«Falta una prueba que asercie qué encadena `ci`»** — **se hizo distinto, y mejor.** Una aserción sobre
  el texto de `package.json` es la misma clase de prueba que dejó pasar el 147: mira la forma, no la
  conducta. En su lugar la prueba **ejecuta** `coverage.sh` con el exit de la suite bajo control y
  comprueba los tres caminos. Si mañana alguien reordena `ci`, lo que protege es que la pieza que sí
  corre la suite tiene veredicto.
- **Tradeoff «la 1 corre la suite dos veces»** — confirmado con números, y es lo que la descartó.
- **Tradeoff «la 2 toca el arreglo del 144»** — se respetó y está probado: con la suite en rojo,
  `--update` **sigue registrando**. Es una de las tres aserciones de la prueba nueva.
- **Tradeoff «la 3 deja el CI sin veredicto real»** — ya no aplica.
- **«Vale la pena mirar si alguna versión se publicó con pruebas en rojo»** — **se miró, y la respuesta es
  no.** Clonadas y corridas de verdad: v0.86.0 da 788 pruebas y **0 fallos**, v0.88.0 da 813 y **0**,
  v0.89.0 da 824 y **0**. Y acá hay un aviso que vale más que el resultado: el primer barrido usó
  `git archive` y dio **5 fallos en las cinco versiones**. Eran las pruebas que necesitan `.git`, que
  `git archive` no incluye. Estuve a punto de reportar que se habían publicado versiones en rojo.

### Lo que el caso no preveía

- **Rompí el registro de cobertura dos veces, y lo digo porque R22 lo exige.** `coverage-baseline.json`
  pasó de **68 archivos a 1** en dos ocasiones el 2026-09-14: primero una sonda que corrió
  `coverage.sh --update` con el `node` falso y `cwd` en el repositorio, después la propia prueba nueva,
  que hacía lo mismo. Las dos veces se restauró con `git checkout -- test/tools/coverage-baseline.json` y
  se comprobó el resultado —68 archivos, idéntico a HEAD—. La prueba ahora corre dentro de una copia, así
  que el registro real queda fuera de su alcance.
- **El guard del 144 no ve una mutilación, sólo un vaciado.** `coverage-files.js` se niega con
  `if (!Object.keys(record).length)`, o sea con **cero** archivos. Con **uno** fabricado registra, borra
  los otros 67 y anuncia «piso registrado» con exit 0. Sale como caso **149**.
- **Siete suites no corren sin `.git`.** Es lo que hizo fallar dos arneses de esta sesión y lo que produjo
  el falso «cinco versiones en rojo». Choca con `conduct.md`, que manda ejercitar en una copia lo que las
  pruebas invocan. Sale como caso **150**.

### Qué se corrió

- **El rojo previo del defecto**, dos veces: con una prueba rota a propósito, `node --test` reporta
  **6 fallos sobre 826** y `npm run ci` sale **exit 0**. Reproducido dos veces con el mismo resultado.
- **Rojo previo de la prueba nueva**: contra el `coverage.sh` de HEAD —sin el arreglo— el archivo pasa de
  14/14 a **8 pass, 6 fail**.
- **Cuatro mutaciones, las cuatro en rojo**, sobre un clon con `.git` que arranca en 14/14: quitar el
  corte en modo comprobación, aplicarlo también en `--update`, volver a `|| true`, y no marcar el modo.
  Ninguna quedó verde, y el clon vuelve a 14/14 al restaurar.
- **La puerta viendo un rojo por primera vez**: con `ci-schedule.test.js` en rojo por el workflow nuevo
  del 147, `npm run ci` **falló**. Antes del arreglo, ese mismo estado daba exit 0.
- **El costo de cada pieza**: suite 45 s, `coverage` 50 s, puerta entera 50 s, `check` /
  `automation:check` / `integration:check` 0 s, `dead-code` 1 s.
- **Las cinco versiones publicadas**, clonadas y corridas: 0 fallos en todas.
- **Verde final**: `npm test` → **826 pruebas, 826 pass, fail 0**; `npm run ci` exit 0; registro de
  cobertura intacto en 68 archivos.
