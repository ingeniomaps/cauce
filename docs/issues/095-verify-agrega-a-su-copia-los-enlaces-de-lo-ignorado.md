---
caso: 095
titulo: verify agrega a su copia los enlaces de lo ignorado cuando el patrón termina en barra
estado: resuelto
resuelto-en: 0.80.0
prioridad: alta
version-detectada: 0.79.0
---

# 095 — Un directorio ignorado con `dir/` entra al índice de la copia de `verify` como enlace

**🟢 resuelto en 0.80.0** · detectado en 0.79.0 · prioridad **alta** — con archivos sin trackear, un gate que recorre
lo trackeado ve un archivo que el commit no lleva; en este repositorio frena todo commit de código mientras
exista `.cauce-eval/`

## Resumen

Cuando el árbol difiere del índice, `verify` materializa el índice en una copia, enlaza ahí lo ignorado
—`node_modules`, `.env`— y convierte la copia en un repositorio con `git add --all`
(`engine/hooks/shell.js`, `commitTree`). El `.gitignore` de la copia debería dejar afuera esos enlaces, y no
lo hace cuando el patrón termina en barra: `dir/` sólo alcanza a directorios, y para git un enlace simbólico
no es un directorio. El enlace entra al índice de la copia, y un gate que lee lo trackeado lo recibe como si
fuera un archivo del commit.

## Reproducción

Mecanismo, en un repositorio desechable:

```bash
P=$(mktemp -d); mkdir -p "$P/real-dir" "$P/repo"; cd "$P/repo"
git init -q; printf '.cauce-eval/\n' > .gitignore
ln -s "$P/real-dir" .cauce-eval
git check-ignore -v .cauce-eval; echo "exit=$?"
git status --porcelain --ignored
```

Efecto, en este repositorio: un checkout con `.cauce-eval/` —lo crea cualquier evaluación local— y un archivo
sin trackear, y un commit de código bajo `verify`.

## Síntoma

El mecanismo, 2026-09-10, git 2.43:

```
exit=1
?? .cauce-eval
?? .gitignore
```

`check-ignore` no lo ignora y `status` lo lista como sin trackear, no como ignorado.

El efecto, capturando la salida del gate de `verify` en proceso sobre este repositorio, con el índice del 088
staged:

```
ℹ tests 678
ℹ pass 676
ℹ fail 2
✖ la copia recibe la palanca que apaga la sincronización, y ya no la que desarma confirmaciones
✖ ningún archivo del repositorio nombra la ruta absoluta de una máquina
  Error: EISDIR: illegal operation on a directory, read
      at read (/tmp/ops-verify-w1oWwj/test/repo/repo.test.js:505:29)
```

La primera es el 093; la segunda es ésta. `repo.test.js` recorre `git ls-files`, encuentra `.cauce-eval` y
lo lee como archivo.

## Causa raíz

`commitTree` confía en el `.gitignore` para que `git add --all` no agregue lo que acaba de enlazar
(`engine/hooks/shell.js`, el bucle de enlaces y el `add --all` que lo sigue). Esa confianza vale para
`node_modules` sin barra y no para `node_modules/`, que es la forma más común de escribirlo.

## Fix propuesto

Anotar qué se enlazó y excluirlo en `.git/info/exclude` de la copia antes del `add --all`, anclado a la raíz.
Lo enlazado es entorno por definición: no depende de cómo lo escribió el `.gitignore`.

## Tradeoffs

- Un nombre con caracteres de glob (`*`, `?`, `[`) necesita escaparse para que la exclusión nombre ese
  archivo y no un patrón.
- Nada cambia para lo que el commit lleva: la exclusión sólo mira lo que el guard enlazó.

## Contexto de descubrimiento

2026-09-10, commiteando el arreglo del 088. Después de arreglar el 093, `verify` siguió frenando; la salida
completa del gate apareció recién envolviendo `spawnSync` para capturarla, porque el mensaje muestra otra
línea (094). Las reproducciones hechas a mano no lo mostraban porque stageaban la lista del índice en vez de
`add --all`, y no agregaban el enlace.

## Relacionados

- **093** — el otro fallo que el mismo `verify` produjo en la misma corrida; ninguno de los dos pasa la
  puerta sin el otro.
- **094** — el mensaje que escondió a los dos.
- **045** — la decisión de hacer de la copia un repositorio propio, que es donde nace el `add --all`.

## Cierre

**🟢 resuelto en 0.80.0** · `engine/hooks/shell.js`, `test/wiring/hooks.test.js`

- **Fix propuesto** — hecho: `commitTree` anota cada nombre que enlaza y lo escribe en `.git/info/exclude`
  de la copia, anclado a la raíz, antes del `add --all`.
- **Tradeoff «un nombre con caracteres de glob»** — hecho: `*`, `?`, `[`, `]` y `\` se escapan. Al cerrar no
  tenía prueba; la revisión de huecos previa al merge le agregó una —un ignorado llamado `cache[1]`, que sin
  escapar sería un patrón que nombra `cache1`— y la mutación que quita el escape la pone en rojo (`fail 1`).
- **Tradeoff «nada cambia para lo que el commit lleva»** — se cumple: la exclusión lista sólo lo enlazado, y
  la suite entera pasa bajo el guard con el arreglo (abajo).
- **Relacionados** — el 093 se cierra en el mismo commit, porque ninguno pasa la puerta sin el otro; el 094
  sigue abierto.

### Qué se corrió

- **El mecanismo**, en un repositorio desechable: `git check-ignore -v .cauce-eval` sobre un enlace con
  `.cauce-eval/` en el `.gitignore` salió con código 1, y `git status --porcelain --ignored` lo listó como
  `?? .cauce-eval`.
- **La prueba nueva**, `lo que verify enlaza a la copia no entra a su índice`: un directorio ignorado con
  barra final, un archivo suelto que obliga a materializar la copia y un gate que anota `git ls-files`.
  `node --test test/wiring/hooks.test.js`: 62 de 62.
- **La mutación que devuelve el defecto**, en una copia desechable del repositorio (R23): la exclusión
  escribiendo nada. Comprobada aplicada antes de correr, dio `fail 1` en la prueba nueva.
- **El guard de verdad**, en proceso y capturando la salida del gate, con archivos sin trackear en el árbol:
  sin arreglos falla por `EISDIR` en `repo.test.js`; con sólo el 093, igual; con sólo éste, deja de fallar
  por `EISDIR` y falla por el 093; con los dos, 679 de 679.
- **El commit que lo lleva**, `c1685827`, pasó por `verify` con siete entradas sin trackear en el árbol.
