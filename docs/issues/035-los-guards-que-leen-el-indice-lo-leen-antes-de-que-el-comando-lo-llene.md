---
caso: 035
titulo: Los guards que leen el índice lo leen antes de que el comando lo llene, así que stagear y commitear juntos los evade
estado: abierto
prioridad: alta
version-detectada: 0.64.0
---

# 035 — `git commit -a` pasa por encima de gobernanza, dependencias y generados

**🔴 abierto** · detectado en 0.64.0 · prioridad **alta** — falla abierto, sin registro, con un comando de una línea

## Resumen

`governance`, `dependencies` y `verify` deciden mirando el índice: llaman a `stagedFiles(dir)` y juzgan
lo que encuentran. El hook corre **antes** que el comando, así que ven el índice tal como estaba **antes**
de que el comando lo modificara.

Cualquier forma que stagee dentro del mismo comando los deja sin nada que mirar:

- `git add <archivo> && git commit …` — al evaluarse el hook, el índice está vacío.
- `git commit -a …` — el staging lo hace `git` al commitear, después del hook.

Los tres guards ven cero archivos, concluyen que no hay nada que revisar y devuelven. El commit se hace
con el archivo de gobernanza adentro y no aparece ningún mensaje.

Es el mismo resultado que [031](031-el-guard-que-no-puede-leer-el-indice-deja-pasar.md) —tres guards
que no corren— por una vía que aquel fix no toca: ahí el índice no se podía leer, acá se lee bien y
todavía no tiene nada.

## Reproducción

Con un archivo de gobernanza modificado y **el índice vacío**:

```bash
# A — staging y commit en pasos separados: el guard ve el índice lleno
git add planning/rules/system/conduct.md
git commit --dry-run -m "sonda"          # BLOQUEADO: «toca gobernanza protegida»

# B — los dos en un comando
git reset
git add planning/rules/system/conduct.md && git commit --dry-run -m "sonda"   # exit 0

# C — sin staging explícito
git reset
git commit -a --dry-run -m "sonda"       # exit 0
```

*Verificado* el 2026-09-06 sobre 0.64.0, las tres en la misma sesión y sobre el mismo archivo.

A es la prueba de que el guard funciona; B y C, de que no llega a mirar.

## Causa raíz

No es un defecto de `stagedFiles` ni de los tres guards: es de **cuándo** se les pregunta. Un hook de
pre-ejecución sólo puede observar el estado previo, y el índice es estado que el propio comando cambia.

De las dos formas, **C es la peor**: es un comando único y corriente, no un encadenado que alguien
armó. Y tiene una ironía propia — `git add -A` está prohibido por R8 y el guard lo frena, porque
stagear sin nombrar rutas es exactamente lo que la regla no quiere; `git commit -a` hace eso mismo con
otra ortografía y no sólo pasa, además apaga los tres guards de camino.

B tampoco es rebuscada: encadenar con `&&` es la forma natural de escribir dos pasos que van juntos, y
quien la escribe no tiene modo de saber que con eso desactivó algo.

## Fix propuesto

Dos piezas, y ninguna necesita adivinar qué va a stagear el comando.

**1. Prohibir `-a` / `-am` en un commit.** Es la contraparte exacta de la prohibición de `git add -A`
que el guard ya aplica, y por el mismo motivo escrito en R8: *stagear rutas explícitas, revisar el diff
staged y recién ahí commitear*. Con `-a` no hay diff staged que revisar, ni para la persona ni para el
guard.

```diff
+// `git commit -a` stagea al commitear, o sea después de este hook: los guards que leen el índice se
+// quedan sin nada que mirar. Es `git add -A` con otra ortografía, y R8 ya lo prohíbe por escrito.
+if (/(?:^|[;&|]\s*)git(?:\s+-C\s+\S+)?\s+commit\b[^;&|]*\s-(?:a|am|[a-z]*a[a-z]*)\b/.test(command)) {
+  block('`git commit -a` stagea después de este guard, que entonces no ve qué se commitea. '
+    + 'Stageá las rutas por nombre y commiteá en un comando aparte.')
+}
```

**2. Frenar un comando que stagee y commitee a la vez.** Si el texto contiene un `git add` y un
`git commit`, el guard no puede juzgar el commit: pedir que se separen es más barato y más honesto que
intentar reconstruir el índice futuro parseando las rutas del `add` —que tendría que resolver globs,
`-u`, `-p` y el `add` que otro alias esconde—.

Vale la pena mirar si algún otro guard depende de estado que su propio comando cambia. El patrón
—preguntar por lo que todavía no pasó— no tiene por qué ser exclusivo del índice.

**El orden importa: primero el [036](036-git-c-ruta-add-a-esquiva-la-prohibicion-de-stagear-todo.md).**
El diff de arriba trae su propio ancla —`(?:^|[;&|]\s*)git(?:\s+-C\s+\S+)?`— y eso sería el cuarto
lugar del motor resolviendo dónde empieza un comando de git, que es exactamente lo que aquel caso pide
dejar de hacer. Con la normalización hecha, este fix se escribe sobre el subcomando ya resuelto y no
tiene que volver a acertarle a la posición. Hacerlo al revés deja un patrón más que olvidar el día que
alguien escriba `git -c … commit -a`.

Verificado el 2026-09-06 sobre 0.64.0: las tres variantes se comportan como dice el Síntoma, y el
control con el índice ya lleno bloquea.

## Tradeoffs

Se pierde una comodidad real: `git commit -am "…"` es lo que mucha gente escribe siempre. A cambio, los
tres guards vuelven a ejecutarse en todos los caminos, y el flujo que queda es el que R8 ya pedía.

La alternativa de reconstruir el índice futuro desde el texto del comando es peor: acierta en los casos
fáciles y falla callada en los difíciles, que es de nuevo el modo de fallo que este caso denuncia.

## Prioridad

**Alta.** Falla abierto y sin registro: el commit pasa, nadie ve un mensaje, y los tres guards que el
proyecto cree tener no corrieron. Se llega con un comando de uso diario y sin ninguna intención de
rodear nada.

## Contexto de descubrimiento

En `gouduet`, el 2026-09-06, validando el arreglo de [034](034-el-override-de-gobernanza-no-tiene-camino-documentado.md).
La línea base de la prueba —dejar un archivo de gobernanza en el índice y confirmar que el commit se
frena— se escribió con el `add` y el `commit` en el mismo comando, y salió exit 0. Al principio pareció
una regresión de 0.64.0; al separar los pasos, el guard bloqueó como debía. Lo que había fallado no era
el guard sino el momento en que se le pregunta, y de ahí salió `-a`.

## Relacionados

- [031](031-el-guard-que-no-puede-leer-el-indice-deja-pasar.md) — el mismo resultado por otra vía. Aquel
  cerró «no pude leer el índice»; éste es «lo leí bien y todavía estaba vacío».
- [036](036-git-c-ruta-add-a-esquiva-la-prohibicion-de-stagear-todo.md) — encontrado en la misma
  sesión, y con `git commit -a` comparten enunciado: stagear sin nombrar rutas.
