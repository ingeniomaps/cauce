---
caso: 031
titulo: Un guard que no puede leer el índice deja pasar el commit en vez de frenarlo
estado: abierto
prioridad: alta
version-detectada: 0.62.0
---

# 031 — `git -C $VAR` apaga los mismos tres guards, por otro camino

**🔴 abierto** · detectado en 0.62.0 · prioridad **alta** — falla abierto y no deja rastro

## Resumen

Los tres guards que corren sobre un commit —`governance`, `dependencies` y `verify`, éste último por su
control de OpenAPI y SQL generados— preguntan qué hay en el índice llamando a `stagedFiles(dir)`. Si esa lectura falla, la función devuelve una lista vacía, y
una lista vacía se lee exactamente igual que «no hay nada que revisar»: los tres pasan.

Hacer que falle no requiere astucia. Basta con que el directorio no se resuelva, y la forma más común
de que no se resuelva es la más natural de escribir: una variable de shell.

```bash
git -C $OPS commit -m "…"     # el guard resuelve el directorio "$OPS", literal
```

`gitDirectory` lee el comando con un regex y captura los caracteres que siguen a `-C`. No expande nada
—no puede, no es un shell—, así que se queda con `$OPS`, resuelve una ruta que no existe, `git diff
--cached` falla ahí, y `stagedFiles` devuelve `[]`.

## Reproducción

El mismo archivo de gobernanza en el índice, dos comandos equivalentes para cualquier shell:

```bash
O=<ruta-al-repo>
git -C <ruta-literal> commit --dry-run -m "sonda"   # BLOQUEADO: «toca gobernanza protegida»
git -C $O            commit --dry-run -m "sonda"    # exit 0 — pasa
```

*Verificado* el 2026-09-06 sobre 0.62.0. El primer comando fue el que reveló el caso: se escribió con
la variable por comodidad y pasó, y sólo al repetirlo con la ruta literal apareció el bloqueo que
correspondía.

## Causa raíz

`engine/hooks/input.js:99`:

```js
function stagedFiles(dir) {
  const result = spawnSync('git', ['-C', dir, 'diff', '--cached', '--name-only'], { encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim().split('\n').filter(Boolean) : []
}
```

El `: []` es el defecto. Confunde dos respuestas que no son la misma: **«el índice está vacío»** y
**«no pude leer el índice»**. La primera autoriza a seguir; la segunda no autoriza nada.

`gitDirectory` (`:89`) es cómo se llega ahí sin querer, pero no es el único camino: un repo corrupto,
un `git` ausente del PATH, un directorio sin permisos o un submódulo raro producen el mismo `[]` y el
mismo silencio.

Cauce ya tiene escrita la regla correcta, en su propio shim `automatization/hooks/run-hook.sh`:

> `# Un guard que no encuentra su motor bloquea, nunca permite.`

Es exactamente el principio que falta aplicar acá.

## Fix propuesto

Distinguir las dos respuestas y bloquear ante la ambigua:

```diff
 function stagedFiles(dir) {
   const result = spawnSync('git', ['-C', dir, 'diff', '--cached', '--name-only'], { encoding: 'utf8' })
-  return result.status === 0 ? result.stdout.trim().split('\n').filter(Boolean) : []
+  // Un índice vacío y un índice ilegible NO son la misma respuesta: la primera autoriza a seguir, la
+  // segunda no autoriza nada. Devolver `[]` en los dos casos apaga en silencio a quien pregunta.
+  if (result.status !== 0) {
+    block(`no se pudo leer el índice de ${dir} (${(result.stderr || '').trim() || 'git falló'}). `
+      + 'Un guard que no puede verificar no autoriza. Si usaste una variable en `git -C`, escribí la ruta literal.')
+  }
+  return result.stdout.trim().split('\n').filter(Boolean)
 }
```

El mensaje tiene que nombrar la variable, porque es la causa que quien lo lea va a tener delante y no
va a sospechar.

Bloquear desde adentro de `stagedFiles` es seguro y conviene decir por qué: sus tres llamadores son
guards —`shell.js:124` en `dependencies`, `:249` en `governance` y `:273` en `verify`—, así que no hay
ningún consumidor que sólo quiera consultar el índice y al que un bloqueo le caiga encima.

Aparte, y por separado: `gitDirectory` puede detectar que capturó algo que empieza con `$` y decirlo,
en vez de resolverlo como nombre de carpeta. Es el mismo criterio con que `shell-boundary` decide no
juzgar un destino armado con una variable —no adivinar su valor—, pero acá la conclusión es la
opuesta: si no se puede saber a qué repo apunta, no se puede autorizar el commit.

## Tradeoffs

Bloquear ante una lectura fallida va a frenar algún caso legítimo —quien escriba `git -C $VAR` por
costumbre— y es exactamente lo que se busca: hoy ese caso no se frena, se *desprotege*. La salida es
una línea de mensaje y escribir la ruta.

La alternativa de expandir variables dentro del guard no sirve: haría falta un shell, y el valor puede
depender de cosas que el guard no ve.

## Prioridad

**Alta.** Falla abierto y sin registro, que es el peor par: el commit pasa, nadie ve un mensaje, y la
protección que el proyecto cree tener no se ejecutó. Se llega por accidente escribiendo lo natural.

## Contexto de descubrimiento

Investigando [030](030-la-exencion-del-mensaje-de-commit-no-ve-un-prefijo-de-entorno.md) en `gouduet`,
el 2026-09-06. Para montar la prueba de aquel caso hacía falta un commit bloqueado como línea base; el
primer intento se escribió con `git -C $O` y pasó. Ese «pasa» era el segundo defecto, no un error de la
prueba.

## Relacionados

- [030](030-la-exencion-del-mensaje-de-commit-no-ve-un-prefijo-de-entorno.md) — otro camino al mismo
  resultado. Los dos apagan los mismos tres guards; conviene arreglarlos juntos y probar los tres
  consumidores contra las dos formas.
