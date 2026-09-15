---
caso: 148
titulo: `npm run ci` no corre la suite, así que una prueba en rojo no frena ni un PR ni una publicación
estado: abierto
prioridad: alta
version-detectada: 0.89.0
---

# 148 — La puerta que todo el repositorio trata como veredicto sale verde con pruebas fallando

**🔴 abierto** · detectado en 0.89.0 · prioridad **alta** — es la puerta que corre CI, la que exige
`prepublishOnly`, y la que el `AGENTS.md` llama «la puerta real»

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
