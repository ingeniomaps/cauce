---
caso: 531
titulo: un enlace relativo roto en `planning/` u `organization/` no lo ve `check`
estado: resuelto
resuelto-en: 0.124.0
prioridad: baja
version-detectada: 0.123.1
---

# 531 — un enlace relativo roto en `planning/` u `organization/` no lo ve `check`

**🟢 resuelto en 0.124.0** · detectado en 0.123.1 · prioridad **baja**: medido en dos instancias reales, el daño es chico (3
enlaces reales rotos en una, ninguno en la otra). Sube a media si un `upgrade` mueve o parte archivos del molde que las
reglas propias de una empresa enlazan.

## Resumen

Una regla, una ADR o un documento de `organization/` que enlaza `[texto](../otra/ruta.md)` a un archivo que ya no
existe pasa `check` en verde. Pasa sobre todo al partir o mover reglas, que es justamente lo que una empresa hace al
adaptar el molde y lo que `upgrade` puede hacer con los archivos de Cauce.

## Reproducción

```bash
BANCO=$(node engine/cli/ops.js bench suelto) && cd "$BANCO"
printf '\n## R90 — Prueba\n\nVer [la guía](../docs/no-existe.md) y [el protocolo](../PROTOCOL.md#no-existe).\n' \
  >> planning/rules/README.md
echo '- Ver [diseño](./diseno-borrado.md).' >> planning/METHODOLOGY.md
node tools/ops.js check planning; echo "exit=$?"
```

## Síntoma

```
⚠ 2 archivo(s) del molde congelados por edición local; `upgrade` los conserva y no les trae mejoras
✓ planning válido: 0 épica(s), 0 tarea(s) en cola, 0 terminada(s)
exit=0
```

Medido con un contador de sólo lectura (enlaces `](ruta)` relativos, fuera de bloques de código, saltando `done/` y
`archive/`):

| Dónde | Archivos | Enlaces | Rotos | Reales |
|---|---|---|---|---|
| `template/` de Cauce | 67 | 13 | 1 | 0 (el `NNN-slug.md` de la plantilla de ADR) |
| instancia A, `planning/` + `organization/` (con chequeo propio) | 1236 | 303 | 4 | 3, en su carpeta de historia |
| instancia B, ídem (sin chequeo) | 299 | 281 | 2 | 0 (dos placeholders de plantilla) |

## Causa raíz

No hay chequeo: un grep de `enlace roto`, `broken link` y `doc-links` en `engine/` y `test/` sólo encuentra un
comentario sobre un symlink (`engine/cli/lines.js:121`). `test/repo/template-docs.test.js:57` comprueba que el índice de
un documento del molde tenga sus anclas, no que los enlaces apunten a algo.

## Fix propuesto

Un chequeo en `check` sobre `planning/` y `organization/`: error si el archivo enlazado no existe, aviso si existe y le
falta el ancla. Excluye `done/`, `archive/`, los bloques de código y los placeholders de plantilla (`NNN-slug.md`,
`{{…}}`, el `000-template.md` de las ADR).

## Tradeoffs

- Una instancia con enlaces viejos pasa a rojo de una vez al actualizar. Con 3 de 303 en la peor medida, el costo es
  bajo, pero conviene que arranque como aviso o con la línea de base de adopción (`engine/planning/adoption.js`).
- El ancla depende de cómo se genera el slug de un encabezado (acentos, `—`). Si el slugificado del motor no coincide
  con el del visor, aparecen falsos rojos; por eso el ancla va como aviso.

## Contexto de descubrimiento

Auditoría del 2026-11-21 sobre una instancia sidecar real, que escribió su propio chequeo después de partir reglas.
En su primera corrida encontró un enlace roto real. Sus 3 rotos de hoy están en la carpeta que ese chequeo excluye.

## Relacionados

Ninguno: los casos con «enlace» en el cuerpo hablan de symlinks (408, 420).

## Cierre

Se recorrió el caso entero:

- **Fix propuesto, un chequeo en `check`**: se hizo en `engine/planning/links.js`, sobre `planning/` y `organization/`.
  Se hizo distinto en un punto: el archivo que falta es **aviso**, no error, como recomendaba el propio Tradeoff. Así una
  instancia con enlaces viejos no pasa a rojo de golpe al actualizar, y no hace falta la línea de base de adopción.
- **Exclusiones**: hechas: `done/`, `archive/`, los bloques de código (también indentados, de cuatro backticks o sin
  cierre), los `span`, los comentarios HTML, las URL con esquema, las rutas absolutas y los placeholders (`NNN`, `{{`,
  `<`, `>`, `000-template`).
- **Tradeoffs, el ancla depende del slugificado**: el ancla es aviso. Se acercó al de GitHub: el código del título sin
  backticks, un enlace sin su ruta, sufijo `-1` para los repetidos, `<a id>` y `{#id}`. La revisión lo encontró en el molde
  (`template/planning/delivery/multi-repo.md:22`) antes de que nadie lo enlazara.
- **Lo que el enunciado no preveía**: las primeras versiones tenían retroceso polinomial. Un título con 8000 espacios
  tardaba más de 60 s, 16 000 aperturas sin cierre 1,5 s y 1 MB de `<!--` 34 s. Se pasó a un recorrido por líneas, con
  `indexOf` para los comentarios y clases de caracteres que no se solapan en enlaces y anclas. Dos pruebas lo acotan a
  2 s; medido, un título de 50 000 espacios tarda 4 ms y 1 MB de `<!--`, 3 ms. Una línea de backticks que repite
  backticks en su info ya no abre un bloque, como en CommonMark.

Lo que se corrió:

- Línea de base, en «Síntoma»: los tres enlaces rotos pasaban en verde.
- Después, `repro-531.sh` en un banco (`repro-531-final.log`): `check` avisa los dos archivos que faltan y el ancla, con exit 0.
- Sobre el molde, cero avisos; sobre un `ops init` fresco, cero (lo midió la revisión).
- `test/planning/links.test.js`, 4 pruebas, en rojo sin `links.js` y en verde después.
- 24 mutaciones en una copia, las 24 rojas. Las que sobrevivieron en el camino sumaron su caso: un título vacío, un
  comentario sin cierre, `##Pegado`, el costo de los enlaces y un `<!--` citado entre backticks.

**Sin probar:** los enlaces de referencia `[x]: ruta`, que no se miran; un enlace `](<ruta con espacios>)`, que se saltea
por el `<`; un título setext (`===`); un ```` ``` ```` dentro de un bloque indentado con 8 espacios, que abre un fence y oculta
el resto del archivo, porque los fences indentados dentro de una lista se quisieron cubrir; un título con una imagen,
que toma el alt para el ancla; y en un sidecar, un enlace de `planning/` hacia un repositorio de producto que no
está clonado en esa ruta relativa, que daría un aviso de más.

### Lista de cierre

1. hecho: la reproducción de «Reproducción» en un banco, antes en «Síntoma» y después en `repro-531-final.log`.
2. hecho: rama `fix/cases-from-an-instance-audit`.
3. hecho: las pruebas en rojo sin el módulo y en verde después.
4. hecho: 24 mutaciones en una copia, las 24 rojas; las que sobrevivieron sumaron su caso.
5. no aplica: no quita ni reemplaza nada; agrega un aviso.
6. hecho: banco con la CLI real, sin dobles; el molde y una instancia fresca dan cero avisos.
7. no aplica: no depende de un modelo, un runner ni un sistema externo.
8. hecho: la reproducción y las mutaciones se repitieron sobre la versión final.
9. hecho: `planning/` y `organization/` a la vez, varios archivos que se enlazan entre sí, y títulos repetidos.
10. hecho: depende sólo `check`; `check --json` lo trae en `warnings` y deja `ok: true`, lo comprobó la revisión.
11. hecho: seis pasadas de revisión independiente sobre la tanda (530, 531, 533, 534, 535 y 536); ninguna halló nada que impida entregar, sus hallazgos baratos se arreglaron, y cada arreglo se revisó en la pasada siguiente. El último, que tapa los `span` al buscar comentarios en `links.js`, se cerró con su prueba y su mutación en rojo, sin otra pasada.
12. hecho: pasada de comentarios sobre el diff entero en la cuarta revisión; se quitaron los ocho que repetían o sobraban.
13. hecho: `npm run ci` con los archivos nuevos stageados, 1926 de 1926, exit 0.
14. hecho: este cierre recorre el Fix propuesto y los Tradeoffs.
15. hecho: nombra lo corrido con su salida, lo que el enunciado no preveía, y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.124.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.124.0.
