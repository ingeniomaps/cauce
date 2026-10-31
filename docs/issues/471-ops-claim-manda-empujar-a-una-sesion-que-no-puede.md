---
caso: 471
titulo: `ops claim` le manda commitear y empujar el reclamo a una sesión delegada que tiene prohibido hacerlo
estado: resuelto
resuelto-en: 0.118.0
prioridad: baja
version-detectada: 0.117.2
---

# 471 — `ops claim` manda empujar a una sesión que no puede

**🟢 resuelto en 0.118.0** · detectado en 0.117.2 · prioridad **baja**: las sesiones lo ignoran bien, pero cada una lo anota como desvío.

## Resumen

Al reclamar, el comando imprime siempre que se commitee y se empuje el reclamo. Una sesión delegada cuyo rol prohíbe el push
recibe una orden contraria a su rol.

## Síntoma

Informes de programadores delegados, en una instancia con esa prohibición en su rol (2026-10-31): «`ops claim` sugirió commitear
y empujar», y `planning/claims/<slug>.md` queda sin commitear hasta el cierre.

## Causa raíz

`engine/cli/claims.js:103`:

```js
console.log(`  commiteá y empujá ${CL.DIR}/${slug}.md para que el equipo lo vea`)
```

No mira si la sesión es delegada (`CAUCE_DELEGATED`) ni `runner.allowPush`.

## Fix propuesto

Callar ese consejo cuando la sesión es delegada o cuando no tiene permiso de push. No se comprobó si otro flujo depende del texto.

## Contexto de descubrimiento

Una instancia que lanza programadores con `CAUCE_DELEGATED=1`, en varias corridas de un release de prueba.

## Cierre

**Resuelto en 0.118.0.**

- **Callar el consejo a una sesión delegada.** Se hizo. Salida real en un banco:
  - sin `CAUCE_DELEGATED`: `commiteá y empujá claims/t1.md…` y `export CAUCE_RUNNER=a`;
  - con `CAUCE_DELEGATED=1`: sólo `export CAUCE_RUNNER=b`.
- **Callarlo también sin permiso de push.** Se decidió que no: `ops claim` lo corre también una persona, y `runner.allowPush` en falso es lo normal. Ahí el consejo sigue siendo cierto, porque empuja ella.
- **Si otro flujo depende del texto.** Se buscó: sólo lo leen las pruebas, `test/planning/claims.test.js` y `claims-delegated.test.js`.

### Lista de cierre

1. hecho: la salida del comando antes del cambio, en ese test.
2. hecho: `fix/guards-464-467`.
3. hecho: `test/planning/claims-delegated.test.js`, vista en rojo con el consejo de vuelta.
4. hecho: consejo siempre y consejo nunca, las dos en rojo.
5. hecho: las dos salidas de arriba, lado a lado; la aserción de ausencia es la que se vio en rojo.
6. hecho: `ops claim` en un banco, y en una sesión real de `claude -p` con `CAUCE_DELEGATED=1`: salió `tarea-medida tomada` y `export CAUCE_RUNNER=…`, sin el consejo de empujar.
7. hecho: la sesión de arriba.
8. hecho: corrieron las dos ramas.
9. no aplica: no coordina nada nuevo.
10. hecho: el `grep` de arriba.
11. hecho: leído en la revisión final, sin defecto.
12. hecho: un comentario, con su razón.
13. hecho: `npm run ci` en exit 0.
14. hecho: arriba, contra el caso entero.
15. hecho: arriba y la línea de abajo.
16. hecho: frontmatter y encabezado en 0.118.0, con su entrada en el CHANGELOG.

**Sin probar:** nada.
