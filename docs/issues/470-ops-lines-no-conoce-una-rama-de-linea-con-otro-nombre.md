---
caso: 470
titulo: `ops lines` da por mal puesto un árbol cuya línea usa otro nombre de rama, y deja de contar contra la rama viva
estado: resuelto
resuelto-en: 0.118.0
prioridad: baja
version-detectada: 0.117.2
---

# 470 — `ops lines` no conoce una rama de línea con otro nombre

**🟢 resuelto en 0.118.0** · detectado en 0.117.2 · prioridad **baja**: no frena nada, pero la vista miente sobre un árbol correcto.

## Resumen

El motor fija la rama de una línea en `line/<línea>`. Una instancia que la llama `line/<persona>-<línea>` ve el árbol como
mal puesto, y el conteo contra la rama viva desaparece.

## Síntoma

Salida real, en una instancia con la línea `mini` en la rama `line/persona-mini` (2026-10-31):

```
(line/mini)  el árbol está en line/persona-mini, no en line/mini  sin rama viva contra qué contar
```

## Causa raíz

- `engine/core/line-trees.js:21`: `const BRANCH = 'line/'`, sin forma de que la instancia declare otro nombre.
- `engine/cli/lines.js:319` y `:326`: el aviso y el conteo comparan contra ese nombre.

## Fix propuesto

Que la línea pueda declarar su rama en `ops.config.json`, y que `ops lines` la lea de ahí. No se comprobó qué más lee la
constante.

## Contexto de descubrimiento

Una instancia con líneas por persona, en seis corridas seguidas de un release de prueba.

## Cierre

**Resuelto en 0.118.0, distinto de lo que proponía**, porque medirlo cambió el diagnóstico.

- **«Deja de contar contra la rama viva».** Se hizo distinto. El nombre de rama no quita el conteo: con `line/persona-mini`, `ops lines` da `+1 / -0`, y `test/wiring/line-branch.test.js` ya lo cubría. Lo que da «sin rama viva» es un repositorio cuya rama viva no es `main` ni `master`, y cuyo remoto no declara `HEAD`.
- **El mensaje.** Ahora dice qué falta: «no es main ni master y ningún remoto declara su HEAD (con un remoto: git remote set-head <remoto> --auto)». La primera versión nombraba `origin` y la revisión la vio fallar sin ese remoto. Comprobado en un banco y en una prueba, con un remoto real: después de ese comando desaparece el aviso.
- **Declarar la rama en `ops.config.json`.** Se decidió que no: el aviso de que el árbol está en otra rama es cierto según la convención del motor, y una clave nueva baja a todas las empresas sin un daño medido.

### Lista de cierre

1. hecho: `ops lines` en un banco con la rama renombrada, y luego con la rama viva renombrada.
2. hecho: `fix/guards-464-467`.
3. no aplica: la prueba se escribió con el arreglo; su rojo se vio por la mutación del punto 4.
4. hecho: volver al mensaje viejo la pone roja.
5. hecho: antes y después del texto, sobre el mismo repositorio.
6. hecho: `ops lines` en un banco, antes y después del comando, contra un remoto real.
7. no aplica: es un comando del motor.
8. hecho: corrieron las dos ramas del aviso.
9. no aplica: no coordina nada.
10. hecho: `sin rama viva` sólo lo lee `test/wiring/line-branch.test.js`.
11. hecho: la revisión halló el `origin` y un comentario separado de su función, ya arreglados.
12. hecho: un comentario, con su razón.
13. hecho: `npm run ci` en exit 0.
14. hecho: arriba, contra el caso entero.
15. hecho: arriba y la línea de abajo.
16. hecho: frontmatter y encabezado en 0.118.0, con su entrada en el CHANGELOG.

**Sin probar:** nada.
