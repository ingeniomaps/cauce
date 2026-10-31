---
caso: 472
titulo: La lista de cierre de un caso se puede escribir sin haber corrido lo que afirma
estado: abierto
prioridad: media
version-detectada: 0.117.2
---

# 472 — La lista de cierre se puede escribir sin haber corrido lo que afirma

**🔴 abierto** · detectado en 0.117.2 · prioridad **media**: no rompe nada del producto, porque `docs/issues/` no viaja en el paquete. Lo que cuesta es que el cierre se lea como verificado sin estarlo, y que la persona tenga que preguntar cada vez.

## Resumen

Desde el 464, `issues.test.js` exige que cada punto de la lista de cierre tenga su línea. Mide que esté, no que sea cierta, y una línea es texto que se escribe a mano.

## Reproducción

Pasó cerrando el 464 al 467, el 2026-10-31:

1. Los cierres se escribieron con `13. hecho: npm run ci en exit 0` antes de correrlo.
2. `npm run ci` dio exit 1 en las dos corridas siguientes: una por tres pruebas, la otra por la cobertura de `hook.js`.
3. `issues.test.js` pasó con esa línea puesta.

Lo mismo con `Seis pasadas independientes`, que eran ocho.

## Causa raíz

`closingListProblems` (`test/repo/issues.test.js`) compara el texto con un formato. Nada ata el punto 13 con una corrida de verdad.

## Fix propuesto

Hipótesis, sin construir: un comando `ops case close <n>` que corre `npm run ci`, y sólo si sale en 0 escribe en el cierre una línea con la suma del árbol y el exit code. La prueba compara esa suma con el árbol actual, salvo el propio caso. Así el punto 13 no se puede escribir de memoria y se invalida solo si el código cambia después.

**Sólo ese punto.** Los demás no tienen forma: una revisión o una sesión real no dejan un rastro que un script pueda comprobar sin que alguien lo escriba. Es lo que muestran los datos de abajo, y ampliarlo a todos sería pagar por lo mismo.

## Tradeoffs

- El cierre vive dentro del árbol que se suma, así que hay que excluirlo o la suma nunca coincide.
- Un commit posterior que no toca código invalidaría la línea si la suma es del árbol entero. Hay que decidir de qué rutas es.
- Corre sólo acá: este comando es del repositorio de Cauce, no de lo que recibe una empresa.

## Contexto de descubrimiento

Lo que encontró defectos en esa tanda fue ejecutar: ocho revisiones independientes, la sesión de `agy` y la comparación con el motor anterior, con la suite en verde. La lista hizo visible lo salteado y ninguno de esos defectos.

## Relacionados

Caso 464.
