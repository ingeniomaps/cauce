---
caso: 372
titulo: la suite deja dos bancos en el repositorio después de cada corrida
estado: abierto
prioridad: baja
version-detectada: 0.106.1
---

# 372 — Después de cada `npm run ci` quedan `.cauce-eval/_medicion` y `.cauce-eval/product-manager` en el repositorio: las pruebas de los bancos los arman sobre el árbol de verdad y no los retiran

**🔴 abierto** · detectado en 0.106.1 · prioridad **baja**.

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

## Contexto de descubrimiento

Al limpiar el repositorio después de la 0.106.1: `_medicion` se borró varias veces y volvió con cada corrida
de la puerta, y `product-manager` apareció sin que nadie hubiera evaluado ese cargo.

## Relacionados

- [080](./080-una-prueba-resolvio-contra-la-raiz-y-borro-el-repositorio.md) — por qué importa dónde escribe
  una prueba.
