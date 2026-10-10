---
caso: 372
titulo: la suite deja dos bancos en el repositorio después de cada corrida
estado: resuelto
resuelto-en: 0.107.0
prioridad: baja
version-detectada: 0.106.1
---

# 372 — Después de cada `npm run ci` quedan `.cauce-eval/_medicion` y `.cauce-eval/product-manager` en el repositorio: las pruebas de los bancos los arman sobre el árbol de verdad y no los retiran

**🟢 resuelto en 0.107.0** · detectado en 0.106.1 · prioridad **baja**.

**Prioridad baja**: están ignorados por git y no molestan a nadie. Vale anotarlo por dos cosas: quien limpia
el repositorio los ve reaparecer sin saber de dónde salen, y son pruebas que escriben en el árbol de trabajo.

## Resumen

Las pruebas de `ops evaluate --bench` y de `ops bench` corren el comando con este repositorio como raíz,
porque el banco es del toolkit y se arma bajo `.cauce-eval/`. Al terminar, lo que armaron queda ahí.

## Reproducción

```bash
rm -rf .cauce-eval/_medicion .cauce-eval/product-manager
node --test test/agents/bench.test.js test/agents/bench-measurement.test.js
ls .cauce-eval
```

## Síntoma

El 2026-10-10, después de borrar las dos carpetas y correr esas dos suites —26 pruebas, todas en verde—:

```
_medicion  product-manager  software-architect
```

`product-manager` trae una carpeta por cada caso que las pruebas usan —`06-instancia`, `07-recreado`,
`08-versionado` y las demás—. `software-architect` no es de la suite: es un banco de una evaluación real.

## Causa raíz

- `test/agents/bench.test.js` — cada prueba llama a `evaluate product-manager --bench <caso> --force` con
  `toolkit = path.resolve(__dirname, '..', '..')`, la raíz de este repositorio.
- `test/agents/bench-measurement.test.js` — lo mismo con `bench <escenario>` y `TOOLKIT`.
- Ninguno de los dos retira lo que armó al terminar.

## Fix propuesto

1. Que cada una de las dos suites retire sus bancos al terminar, con la misma guarda que ya usa el comando
   para rehacerlos.
2. O que corran sobre una copia del toolkit en el temporal, que es lo que R23 pide para lo que una prueba
   escribe. Hay que mirar si el banco se puede armar fuera de este repositorio: hoy es del toolkit a propósito.

## Valor

El repositorio queda como estaba después de correr la puerta, y deja de aparecer una carpeta que nadie pidió.

## Qué podría salir mal

1. **Borrar un banco que no es de la suite.** `.cauce-eval/` guarda también bancos de evaluaciones reales,
   con informes que pueden no estar consolidados. Lo que se retire tiene que ser sólo lo que la prueba armó.
2. **Que mover la suite a una copia deje de probar lo que prueba**: que el banco se arma dentro del toolkit.

## Revisión del 2026-10-10

- La suite ya tiene con qué retirar lo que arma: `discard`, en `test/support/environment.js`, borra sólo
  bajo una lista de carpetas desechables, y `.cauce-eval/` de este repositorio está en esa lista. Ninguna de
  las dos suites tiene un paso de cierre.
- Lo que cada una arma se sabe de antemano: `bench.test.js` usa nueve casos de `product-manager` con nombre
  fijo, y `bench-measurement.test.js` los tres escenarios de `_medicion` más las líneas que arma sobre ellos.
  Retirar esos nombres no toca `software-architect` ni ningún otro banco.
- El primer camino del fix alcanza. El segundo —correr sobre una copia— no hace falta para esto.

## Cierre

Cada suite anota lo que pide y lo retira al cierre, con `discard`, que sólo borra bajo `.cauce-eval/` de
este repositorio. Recorrido de lo que el caso enumeraba:

- **Fix 1, que cada suite retire sus bancos**: hecho. En `bench.test.js` el nombre se anota al pedirlo
  —envolviendo `run`— y no en una lista, para que un caso que alguien agregue después nazca cubierto;
  `bench-measurement.test.js` ya tenía una sola entrada, `armar`, y anota ahí. La carpeta del cargo o de
  la medición se retira sólo si quedó vacía: un banco real de `product-manager` se queda.
- **Fix 2, correr sobre una copia**: se decidió que no. El banco es del toolkit a propósito y moverlo
  dejaría de probar eso; con el primero alcanza.
- **Riesgo 1, borrar un banco que no es de la suite**: se retira por nombre pedido, y `discard` se niega
  fuera de `.cauce-eval/`. Durante todo el cierre `software-architect` siguió en su lugar.
- **Riesgo 2, dejar de probar que el banco se arma dentro del toolkit**: no aplica, no se movió nada.

**Prueba corrida.** Antes del arreglo, las dos suites —26 pruebas en verde— dejaban:

```
_medicion  product-manager  software-architect
```

Después, la misma corrida y `npm run ci` entero —1411 pruebas— dejan `software-architect` solo.

**Mutación**, en una copia fuera del árbol: quitada la línea que retira en cada suite, el paso de cierre se
pone rojo en las dos — `06-instancia quedó en el repositorio` y `suelto quedó en el repositorio`—, 26
en verde y 2 en rojo.

Lo que no preveía el enunciado: un `--bench` sin nombre, que tres pruebas usan para medir que el comando lo
exige, no es un banco y no se anota; y la primera versión del cierre lo intentaba retirar y fallaba con un
`path` indefinido.

## Revisión del conjunto

La revisión independiente encontró que el cierre anotaba cualquier nombre que siguiera a `--bench`, también
`../../etc`, y que un caso futuro con `../otro-cargo` habría dejado al cierre borrando un banco hermano real,
que es justo lo que el riesgo 1 decía no tocar. Se anota sólo lo que resuelve bajo la carpeta del cargo, y el
cierre lo asercia; la mutación que anota todo se vio en rojo. La segunda pasada notó que anotar el nombre y
no la ruta dejaba pasar un `--bench` absoluto —el cierre lo volvía a unir con la carpeta y no lo encontraba—;
se anota la ruta resuelta. Y la tercera, que la aserción corría antes de retirar: si fallaba, dejaba los
bancos puestos; ahora se retira primero y se asercia después.

## Contexto de descubrimiento

Al limpiar el repositorio después de la 0.106.1: `_medicion` se borró varias veces y volvió con cada corrida
de la puerta, y `product-manager` apareció sin que nadie hubiera evaluado ese cargo.

## Relacionados

- [080](./080-una-prueba-resolvio-contra-la-raiz-y-borro-el-repositorio.md) — por qué importa dónde escribe
  una prueba.
