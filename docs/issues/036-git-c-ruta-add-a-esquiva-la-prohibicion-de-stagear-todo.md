---
caso: 036
titulo: `git -C <ruta> add -A` esquiva la prohibición de stagear todo
estado: resuelto
resuelto-en: 0.65.0
prioridad: alta
version-detectada: 0.64.0
---

# 036 — La prohibición de `git add -A` no ve el `-C` en el medio

**🟢 resuelto en 0.65.0** · detectado en 0.64.0 · prioridad **alta** — falla abierto sobre una prohibición dura

## Resumen

El guard `git-add` frena `git add -A`, `--all` y `.`: es una de las prohibiciones sin excepción de R8,
y el motor la aplica. Pero el patrón espera `git` y `add` pegados, y `git` admite opciones globales en
el medio. Con `-C <ruta>` delante del subcomando, el patrón no matchea y el staging masivo pasa.

```bash
git add -A                    # BLOQUEADO
git -C /ruta/al/repo add -A   # exit 0 — stagea todo
```

No hay mensaje. El índice queda con todo lo que hubiera en el árbol, que es exactamente lo que la regla
existe para impedir.

Es la misma clase que [030](030-la-exencion-del-mensaje-de-commit-no-ve-un-prefijo-de-entorno.md) y
[031](031-el-guard-que-no-puede-leer-el-indice-deja-pasar.md) —el parser decidiendo sobre la posición
equivocada— aplicada a otro guard. La diferencia es que acá lo que se apaga no es un chequeo derivado
sino una prohibición literal.

## Reproducción

En un repo con más de un archivo modificado:

```bash
git add -A                                  # BLOQUEADO: «'git add -A/--all/.' está prohibido»
git -C <ruta-literal> add -A                # exit 0
git -C <ruta-literal> diff --staged --name-only   # aparece todo
```

*Verificado* el 2026-09-06 sobre 0.64.0. En la corrida que lo encontró quedaron staged seis archivos,
entre ellos `AGENTS.md` y un archivo de reglas del sistema.

## Causa raíz

El patrón que reconoce el subcomando exige adyacencia entre `git` y `add`. `git` acepta opciones
globales antes del subcomando —`-C`, `-c`, `--git-dir`, `--work-tree`, `-P`— y con cualquiera de ellas
en el medio deja de matchear.

`isCommit` ya contempla `-C` para el caso del commit, y desde 0.63.0 también las asignaciones de
entorno que [030](030-la-exencion-del-mensaje-de-commit-no-ve-un-prefijo-de-entorno.md) agregó:

```js
const PREFIX = /(?:^|[;&|]\s*)(?:(?:env|sudo)\s+)*(?:[A-Za-z_][A-Za-z0-9_]*=(?:'[^']*'|"[^"]*"|\S*)\s+)*/
const COMMIT = new RegExp(PREFIX + /git(?:\s+-C\s+\S+)?\s+commit(?:\s|$)/)
```

O sea que el motor ya resolvió **dos** partes de la misma pregunta —el prefijo de entorno y el `-C`— y
las resolvió sólo para el commit. Eso refuerza el argumento de este caso en vez de debilitarlo: cada
arreglo puntual dejó el siguiente.

O sea que el motor **sabe** que `-C` puede ir en el medio, y la contempla en un guard y no en el otro.
Y la contempla sólo para `-C`: comprobado el 2026-09-06, `git -c core.pager=cat add` con la bandera de
stagear todo también pasa, igual que la forma con `-C`.

## Fix propuesto

Normalizar el comando una sola vez —consumiendo las asignaciones de entorno de 030 **y** las opciones
globales de `git`— y que todos los guards decidan sobre esa forma normalizada, en vez de que cada patrón
vuelva a resolver la posición por su cuenta:

```diff
+// `git` acepta opciones globales antes del subcomando, y las asignaciones de entorno van antes de
+// `git`. Cada patrón que resuelva esto por su cuenta va a olvidar una forma: ya pasó con `-C` en el
+// guard de `add`, con la asignación en `isCommit`, y con `-C` en `gitDirectory`.
+const GIT_GLOBAL = /^(?:-C\s+\S+|-c\s+\S+|--git-dir=\S+|--work-tree=\S+|-P|--no-pager)\s+/
+function gitSubcommand(command) { /* → { sub, args } o null */ }
```

Lo que este caso muestra no es un patrón mal escrito sino que **hay tres lugares distintos resolviendo
la misma pregunta**, y cada arreglo puntual ha dejado el siguiente. Conviene una sola función y una
prueba por forma: sin prefijos, con asignación de entorno, con `-C`, con `-c`, con las dos juntas.

## Tradeoffs

Ninguno del lado de la corrección. El riesgo del refactor es el habitual —tocar el punto por donde
pasan todos los guards—, y por eso la prueba tiene que cubrir cada guard contra cada forma, no la
función aislada: lo que importa no es que la función acierte, es que cada consumidor siga bloqueando lo
que bloqueaba.

## Prioridad

**Alta.** Es una prohibición dura de R8 que se desactiva escribiendo una opción estándar de `git`, sin
ningún aviso. Y `git -C` no es rebuscado: es lo que uno escribe para operar sobre otro repo desde donde
está parado, que en modo sidecar es lo normal.

## Contexto de descubrimiento

En `gouduet`, el 2026-09-06, mientras se armaba la reproducción de
[035](035-los-guards-que-leen-el-indice-lo-leen-antes-de-que-el-comando-lo-llene.md). Hacía falta
comprobar que `git add -A` sí estuviera prohibido para poder apoyar en eso el argumento sobre
`git commit -a`; se escribió con `git -C <ruta>` porque la sesión trabajaba desde el directorio de
arriba, y stageó seis archivos sin decir nada.

## Cierre

**🟢 resuelto en 0.65.0.** Lo que este caso enumeró, ítem por ítem:

- **Normalizar una sola vez** → hecho: `withoutGitGlobals` en `engine/hooks/input.js`, con la lista que
  imprime `git --help`. Los tres lugares que resolvían la posición por su cuenta —`isCommit`,
  `gitDirectory` y el patrón de `git add`— pasan por ahí.
- **Una prueba por forma: sin prefijos, con asignación de entorno, con `-C`, con `-c`, con las dos
  juntas** → hecho, y ampliado: se cruza cada regla contra **todas** las opciones que la lista nombra,
  porque una opción escrita en el patrón y sin ningún caso se puede borrar sin que nada se ponga rojo.
- **La prueba cubre cada guard contra cada forma, no la función aislada** (del Tradeoffs) → hecho.
- **El alcance era mayor que el que este caso registró.** Acá se documentó para `git add`; al medirlo,
  el mismo hueco estaba en todas las reglas que leen un subcomando —force-push, push, `reset --hard`,
  `commit --amend`, `clean -f` y la forma ancha de `checkout`—. Y `--git-dir /tmp/.git`, que este caso
  daba por una forma más, bloqueaba por accidente: la ruta termina en `.git`.

## Relacionados

- [030](030-la-exencion-del-mensaje-de-commit-no-ve-un-prefijo-de-entorno.md) y
  [031](031-el-guard-que-no-puede-leer-el-indice-deja-pasar.md) — el mismo error de posición en otros
  dos guards. Con éste son tres; ahí está el argumento para normalizar una vez en vez de parchar cada
  patrón.
- [035](035-los-guards-que-leen-el-indice-lo-leen-antes-de-que-el-comando-lo-llene.md) — hermano de
  enunciado: los dos terminan en un índice lleno de cosas que nadie nombró.
