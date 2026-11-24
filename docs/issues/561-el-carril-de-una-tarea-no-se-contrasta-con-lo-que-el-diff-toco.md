---
caso: 561
titulo: el carril de una tarea no se contrasta con lo que el diff tocó
estado: resuelto
resuelto-en: 0.125.0
prioridad: media
version-detectada: 0.124.0
---

# 561 — Una tarea `express` cuyos commits cruzan una superficie crítica cierra sin que nadie mire el diff

**🟢 resuelto en 0.125.0** · detectado en 0.124.0 · prioridad **media**: el carril se fija antes de construir, por lo que dice la aceptación, y esa predicción puede fallar sin que nada lo vea.

## Resumen

OPS-006 pone en `full` lo que cruza contratos, datos, autenticación o permisos. El carril se decide al promover (y `/autobuild` puede subir `express` a `directo` preguntándole al modelo por la aceptación, `automatization/workflows/autobuild.js`). Después nada compara los archivos que los commits tocaron de verdad con esas superficies: `engine/cli/done.js` y `engine/planning/close.js` sólo copian el carril a `done/`. Es la forma que R27 nombra: una clasificación sin comparador.

## Reproducción

Una raíz con una migración versionada, y una entrada de `done/` en carril `express` cuyo commit es esa migración: `ops check` no dice nada.

## Síntoma

`check` en verde y sin aviso sobre la entrada.

## Causa raíz

No hay dónde declarar las superficies con una forma que una máquina compare —las de `company.md` son prosa— ni nada que mire el diff al cerrar.

## Fix propuesto

- Cada raíz puede declarar `critical` en `ops.config.json`: globs relativos a ella.
- `check` (`engine/planning/critical-surface.js`, llamado desde `engine/cli/validate.js`) avisa la entrada de `done/` fuera de `full` cuyos commits tocan alguno, nombrando los archivos. Sólo desde el 2026-11-24: lo cerrado antes no violó nada.
- Y avisa el glob que no coincide con ningún archivo versionado de la raíz: una superficie que no coincide con nada no avisa nunca.
- Un párrafo en OPS-006.

## Tradeoffs

- Avisa y no frena, como pidió la persona: primero se ve cuánto salta.
- Baja a las instancias, pero es opcional: sin `critical` no cambia nada.
- Sólo mira los repositorios de las raíces que declaran superficies; un commit de otro repositorio no se ve.

## Contexto de descubrimiento

Auditoría del 2026-11-24 sobre lo que una instancia real construyó por su cuenta desde la anterior (2026-11-21), buscando lo que sirve a cualquier empresa. Medido acá, no tomado de la instancia. La instancia escribió primero un patrón para su código de dinero que no coincidía con ninguno de los 548 archivos del repositorio donde vivía: un patrón se mide contra el árbol real antes de confiarle algo.

## Relacionados

- OPS-006 — la ceremonia por superficie.
- 380 — el carril `manual`.

## Cierre

- **Fix, `critical` por raíz y el aviso en `check`**: se hizo (`engine/planning/critical-surface.js`, esquema, validación
  de la clave y OPS-006).
- **El glob que no coincide con nada avisa**: se hizo; con el vocabulario de `scope`, que ve las rutas que empiezan con
  punto (`path.matchesGlob` saltaba `.github/**`).
- **Lo que la revisión agregó**: un commit de merge se lee contra su primer padre; una raíz por un enlace, por su ruta
  real; la salida de git con búfer grande; `sin clasificar` y lo adoptado no se juzgan; «nadie revisó el diff» sólo en
  `express` y `manual`; una raíz que no es repositorio lo dice y una que no está en esta máquina se saltea; y se
  juzgan sólo los últimos 30 días, porque `check` corre en cada cierre de sesión.
- **Anotado sin caso**: un sha que no está en ninguna raíz no avisa acá; lo marca `unknownCommitWarnings` en el mismo
  `check`. El costo sigue siendo dos procesos de git por sha dentro de la ventana.

Lo que se corrió: `check` real sobre una instancia sidecar y un repositorio con una migración commiteada, en las
formas directa, por merge y por enlace (`test/planning/critical-surface.test.js`); las pruebas dan rojo contra la primera
versión del módulo. Trece mutaciones en una copia, las trece rojas; la que sobrevivió una vez (el filtro de lo que no es
texto) se contestó quitándolo, y volvió con su prueba cuando `[null]` mostró que sí rompía.

**Sin probar:** un repositorio de más de 256 MB de listado, y una instancia real con meses de historia.

### Lista de cierre

1. hecho: `check` no decía nada sobre una `express` que tocaba una migración, con el motor anterior.
2. hecho: rama `fix/cases-from-an-instance-audit-2`.
3. hecho: las pruebas nuevas en rojo antes y en verde después.
4. hecho: trece mutaciones en una copia, las trece rojas; la que sobrevivió se contestó.
5. no aplica: agrega un aviso opcional; sin `critical` no cambia nada.
6. hecho: `check` real con repositorios git reales, sin dobles.
7. no aplica: no depende de un modelo, un runner ni un sistema externo.
8. hecho: las pruebas corrieron con el módulo final.
9. hecho: tres formas de raíz (directa, merge, enlace) y dos carriles por lado.
10. hecho: dependían el esquema, la validación de `workspaceRoots`, `scope.js` (que exporta `toRegExp`) y OPS-006.
11. hecho: cinco pasadas de `/code-review` sobre el diff de la tanda y una sexta acotada a los últimos cambios; cada hallazgo de lo que esta tanda empeoraba se arregló, y lo previo o menor quedó anotado en el cierre que le toca.
12. hecho: pasada de comentarios sobre el diff; la puerta de comentarios (repetidos y doce palabras) pasa.
13. hecho: `npm run ci` con los archivos nuevos stageados, 1999 de 1999, exit 0.
14. hecho: este cierre recorre el Fix propuesto, los Tradeoffs y lo que la revisión agregó.
15. hecho: nombra lo corrido con su salida, lo que el enunciado no preveía, y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.125.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.125.0.
