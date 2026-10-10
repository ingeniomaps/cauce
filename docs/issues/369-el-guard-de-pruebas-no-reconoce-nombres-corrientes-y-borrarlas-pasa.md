---
caso: 369
titulo: el guard de pruebas no reconoce nombres corrientes y borrarlas pasa
estado: resuelto
resuelto-en: 0.107.0
prioridad: media
version-detectada: 0.106.1
---

# 369 — `test-evidence` no cuenta como prueba un `a.test.mjs`, un `a.cy.ts` ni un `FooTest.java` fuera de una carpeta de pruebas: borrarlos, renombrarlos o apagarlos pasa

**🟢 resuelto en 0.107.0** · detectado en 0.106.1 · prioridad **media**.

**Prioridad media**: es un hueco de una defensa que ya existe, y no rompe nada que hoy ande. En un proyecto
cuyas pruebas se llaman de una de estas formas —módulos ESM, Cypress, Java o C# con las pruebas junto al
código— el guard no cuida ninguna.

## Resumen

Qué es una prueba lo decide una sola función, por el nombre del archivo o por la carpeta en la que vive. De
ella dependen las tres cosas que `test-evidence` frena —borrar una prueba, renombrarla a algo que no lo es,
apagarla con un `skip`— y lo que `test-evidence-shell` frena por shell. La lista de nombres es corta: lo que
no está en ella no se cuida de ninguna de las cuatro formas.

## Reproducción

Con una instancia cuya raíz es `service`, preguntándole al guard por el borrado de cada archivo:

```
*** Begin Patch
*** Delete File: service/src/a.test.mjs
*** End Patch
```

## Síntoma

Medido el 2026-10-10 con `execute('test-evidence', …)`, trece nombres:

```
FRENA   service/src/a.test.js            pasa   service/src/a.test.mjs
FRENA   service/src/a.test.jsx           pasa   service/src/a.test.cjs
FRENA   service/pkg/a_test.go            pasa   service/src/a.spec.mts
FRENA   service/tests/test_a.py          pasa   service/cypress/e2e/a.cy.ts
FRENA   service/src/a_spec.rb            pasa   service/src/FooTest.java
FRENA   service/test/app.e2e-spec.ts     pasa   service/src/AppTests.swift
                                         pasa   service/src/FooTests.cs
```

`app.e2e-spec.ts` frena por la carpeta `test/`, no por su nombre: fuera de ella tampoco se reconoce.

## Causa raíz

- `engine/hooks/files.js`, `isTestFile` — cuatro patrones: una carpeta `test`, `tests`, `spec`, `specs` o
  `__tests__`; `.test.` o `.spec.` seguido de `js`, `jsx`, `ts` o `tsx`; `_test.` o `_spec.` con una lista de
  extensiones; y `test_*.py`. No están `mjs`, `cjs`, `mts` ni `cts`; ni `.cy.` o `.e2e.`; ni los nombres que
  terminan en `Test` o `Tests`, que es la convención de Java, Kotlin, C# y Swift.
- La usan `testEvidence` en ese mismo archivo —borrado, renombrado y `skip`— y
  `engine/hooks/test-evidence-shell.js`.

## Fix propuesto

1. Ampliar `isTestFile` con las extensiones de módulo, los infijos de las herramientas de punta a punta y los
   nombres terminados en `Test` o `Tests`.
2. Antes de construir, medir sobre repositorios reales cuántos archivos pasan a contar como prueba sin serlo:
   una clase `LoadTest.java` de producto, un `Contest.cs`.
3. Mirar el caso inverso que apareció con el 367: un `a.test.bak` dentro de una carpeta `tests/` cuenta como
   prueba por la carpeta, así que renombrar una prueba a ese nombre no frena.

## Valor

Hace que el guard cuide las pruebas de los proyectos que hoy no cuida, sin agregarle ninguna regla.

## Qué podría salir mal

1. **Frenar la edición de un archivo que no es una prueba** y se llama como una. Ampliar por sufijo `Test` es
   lo que más riesgo trae; por eso el punto 2 del fix va antes.
2. **Que el punto 3 pida distinguir qué corre de qué no**, que es lo que el 367 intentó tres veces para el
   renombrado y dejó: si no sale con una regla que no haya que afinar, queda dicho como límite.

## Revisión del 2026-10-10

Lo que pedía el punto 2 del fix, medido antes de construir. Se listaron en sólo lectura los archivos
versionados de los repositorios de una máquina de trabajo —242, contando árboles de trabajo del mismo
repositorio, 58.183 archivos— y se contó, de los que `isTestFile` **no** reconoce, cuántos caen en cada
patrón candidato y cuántos traen dentro una marca de prueba (`describe(`, `it(`, `test(`, `@Test` y
parecidas):

```
ya reconocidos como prueba                          6.746
.cy. / .e2e.                                           42 sin reconocer · 42 con marca de prueba
.test. / .spec. con mjs, cjs, mts o cts                 2 sin reconocer ·  2 con marca
-spec / -test con guion                                 9 sin reconocer ·  2 con marca
sufijo Test, Tests, Spec o IT (java, kt, cs, swift…)    0
```

Con eso el fix se acota:

- **Entran** las extensiones de módulo y los infijos `.cy.` y `.e2e.`: 44 pruebas que hoy no se cuidan, y
  ninguna que no lo sea.
- **No entra** la forma con guion. Siete de nueve no son pruebas: `load-test.js`, `*.fake-spec.ts`,
  `*.double-spec.ts` son guiones de carga y dobles de prueba, y cuidarlos frenaría editarlos.
- **El sufijo `Test` queda sin decidir, por falta de datos**: en esa máquina no hay un solo archivo así,
  de modo que ni el beneficio ni el falso positivo se pueden medir acá. Es una hipótesis hasta que una
  instancia con Java, Kotlin, C# o Swift lo pida; no se construye a ciegas.
- El punto 3 —un `.bak` dentro de una carpeta de pruebas— sigue como estaba: a mirar, y si pide distinguir
  qué corre de qué no, queda como límite.

Lo que la medición no dice: cuántas de esas 44 son la misma prueba vista desde dos árboles de trabajo del
mismo repositorio. Caen en dos repositorios.

## Cierre

`isTestFile` reconoce ahora `.test.`, `.spec.`, `.cy.` y `.e2e.` seguidos de `js`, `jsx`, `ts`, `tsx`,
`mjs`, `cjs`, `mts` o `cts`. Como la función es una sola, cubre las cuatro formas —borrar, renombrar,
apagar y borrar por shell— sin tocar ningún guard. Recorrido de lo que el caso enumeraba:

- **Fix 1, ampliar la lista**: hecho distinto. Entran las extensiones de módulo y los dos infijos; el sufijo
  `Test`/`Tests` **no** entra, porque la medición del punto 2 no encontró un solo archivo con esa forma y
  sumarlo a ciegas es lo que el riesgo 1 describe. Queda dicho en el comentario de la función y en el
  CHANGELOG.
- **Fix 2, medir antes de construir**: hecho, en la revisión de arriba, y vuelto a medir con la función nueva
  —abajo—.
- **Fix 3, el `.bak` dentro de una carpeta de pruebas**: mirado, y se decidió que no. Distinguir `tests/a.bak`
  de `tests/a.test.js` es distinguir qué corre de qué no, que es exactamente lo que el 367 intentó tres veces
  para el renombrado y dejó: depende del patrón del runner de cada proyecto. Queda como límite, dicho acá: un
  archivo bajo una carpeta de pruebas cuenta como prueba se llame como se llame.
- **Riesgo 1, frenar lo que no es una prueba**: la forma con guion queda afuera, y la prueba asercia que
  `load-test.js`, `a.fake-spec.ts` y `a.double-spec.ts` siguen pasando.
- **Riesgo 2, que el punto 3 pida distinguir qué corre**: es lo que pasó, y por eso quedó como límite.

**Prueba corrida.** `test/hooks/files.test.js`, caso nuevo: se vio en rojo antes del cambio —`Missing expected
exception` sobre `src/a.test.mjs`— y en verde después, con las suites de `test-evidence-shell` y
`patch-move` (19 pruebas). Y la medición repetida con la función nueva, en sólo lectura sobre 212
repositorios y 53.679 archivos versionados: **44 ganados, 0 perdidos** — 40 `.cy.js`, 2 `.cy.ts`, 2
`.test.mjs`, los 44 con marca de prueba adentro.

**Mutaciones**, en una copia fuera del árbol, cuatro:

- sin `cy|e2e` en el patrón → rojo, `cypress/e2e/a.cy.ts`;
- sin las extensiones de módulo → rojo, `src/a.test.mjs`;
- con el guion admitido antes del infijo → rojo, `Got unwanted exception: scripts/load-test.js`, que es la
  aserción de ausencia del riesgo 1;
- con un separador admitido **después** del infijo (`a.test-mjs`) sobrevive: no hay archivo con esa forma
  y ninguna prueba la nombra. Se deja: es un nombre que no existe, no un hueco.

## Contexto de descubrimiento

Al cerrar el 367. La regla del renombrado quedó atada a `isTestFile` a propósito, y la revisión mostró que
varios de sus errores eran en realidad de esa función, para el borrado también.

## Relacionados

- [367](./367-un-renombrado-por-parche-se-juzga-solo-como-una-escritura-en-el-destino.md) — de donde sale, y
  donde se decidió no afinar la regla sólo para el renombrado.
