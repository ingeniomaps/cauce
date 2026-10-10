---
caso: 369
titulo: el guard de pruebas no reconoce nombres corrientes y borrarlas pasa
estado: abierto
prioridad: media
version-detectada: 0.106.1
---

# 369 — `test-evidence` no cuenta como prueba un `a.test.mjs`, un `a.cy.ts` ni un `FooTest.java` fuera de una carpeta de pruebas: borrarlos, renombrarlos o apagarlos pasa

**🔴 abierto** · detectado en 0.106.1 · prioridad **media**.

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

## Contexto de descubrimiento

Al cerrar el 367. La regla del renombrado quedó atada a `isTestFile` a propósito, y la revisión mostró que
varios de sus errores eran en realidad de esa función, para el borrado también.

## Relacionados

- [367](./367-un-renombrado-por-parche-se-juzga-solo-como-una-escritura-en-el-destino.md) — de donde sale, y
  donde se decidió no afinar la regla sólo para el renombrado.
