---
caso: 472
titulo: La lista de cierre de un caso se puede escribir sin haber corrido lo que afirma
estado: descartado
prioridad: media
version-detectada: 0.117.2
---

# 472 — La lista de cierre se puede escribir sin haber corrido lo que afirma

**⚪ descartado** · detectado en 0.117.2 · prioridad **media**: no rompe nada del producto, porque `docs/issues/` no viaja en el paquete. Lo que cuesta es que el cierre se lea como verificado sin estarlo, y que la persona tenga que preguntar cada vez.

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

## Cierre

**Se decidió no construirlo**, porque el daño que lo motivó no puede llegar a ningún lado.

- **La línea falsa del punto 13.** Fue texto y nada más. Lo que puede estar en rojo tiene quien lo frene, en dos lugares distintos: `verify` corre `test`, `lint`, `typecheck` y `build` sobre lo que se commitea (`engine/hooks/verify.js`), y lo que agrega `npm run ci` —`check`, `dead-code` y cobertura— lo corre `.github/workflows/ci.yml` en el PR, que el ruleset exige. O sea que una línea falsa sobre cobertura puede llegar a un commit local, y no a `main`.
- **Medido:** `node --test test/hooks/known-red.test.js` comprueba que un commit con la suite en rojo se frena.
- **Lo que el comando agregaría.** Una suma del árbol que hay que excluir de sí misma, y que cualquier commit posterior invalida. Paga por el único punto que ya tiene un mecanismo que lo sostiene.
- **Los otros puntos.** «Seis pasadas» cuando eran ocho no lo habría atrapado: es lo que muestra este mismo caso, porque una revisión no deja rastro que un script compruebe.

Queda lo que sí sirve: la lista por escrito, y que `AGENTS.md` pida repetir una prueba real después del último cambio.
