---
caso: 030
titulo: `isCommit` ancla a principio de comando, y con eso relaja de más y protege de menos
estado: resuelto
prioridad: alta
version-detectada: 0.62.0
resuelto-en: 0.63.0
---

# 030 — Una asignación de entorno delante de `git commit` apaga tres guards

**🟢 resuelto en 0.63.0** · detectado en 0.62.0 · prioridad **alta** — el mismo regex falla en los dos sentidos, y uno es silencioso

## Resumen

`isCommit()` decide si un comando es un commit, y de esa decisión cuelgan dos cosas opuestas: qué se
**deja de juzgar** (el texto del mensaje) y qué se **empieza a juzgar** (gobernanza, dependencias y
generados). El regex ancla `git` al principio del comando o detrás de `;`, `&` o `|`, y en un shell
`FOO=1 git commit` empieza por la asignación.

De ahí salen dos fallas de signo contrario:

- **Ruidosa**: el mensaje vuelve a dispararle a los guards que apenas nombra. Molesta y se ve.
- **Silenciosa**: los tres chequeos que sólo corren sobre commits **no corren**. No avisa nada.

La segunda es la que importa. Cualquier variable delante —no hace falta que sea
`OPS_GOVERNANCE_OVERRIDE`— desactiva el guard de gobernanza, el de dependencias y el de generados, y el
commit pasa como si esos guards no existieran.

## Reproducción

Un archivo de gobernanza en el índice y dos commits idénticos salvo el prefijo:

```bash
printf '\n<!-- sonda -->\n' >> ops/planning/rules/system/conduct.md
git -C <ruta-literal-al-repo> add planning/rules/system/conduct.md

git   -C <ruta-literal> commit --dry-run -m "sonda"    # BLOQUEADO: «toca gobernanza protegida»
FOO=1 git -C <ruta-literal> commit --dry-run -m "sonda" # exit 0 — pasa
```

*Verificado* el 2026-09-06 sobre 0.62.0, en ese orden y en la misma sesión.

La cara ruidosa se reproduce igual de fácil, con `OPERACION` = cualquier operación que el guard de
publicación vigile:

```bash
git   commit -m "build: no usar OPERACION"     # exit 0
FOO=1 git commit -m "build: no usar OPERACION" # BLOQUEADO
```

El heredoc y la sustitución de comando **no** son el factor: `git commit -m "$(cat <<'EOF' … EOF)"`
con la misma frase pasa. Lo único que decide es que haya algo antes de `git`.

## Causa raíz

`engine/hooks/input.js:95`:

```js
function isCommit(command) {
  return /(?:^|[;&|]\s*)git(?:\s+-C\s+\S+)?\s+commit(?:\s|$)/.test(command)
}
```

`(?:^|[;&|]\s*)` no contempla las asignaciones que un shell admite antes del verbo. Con `FOO=1 ` por
delante, `git` viene precedido de un espacio y no matchea.

Los tres consumidores que se apagan, todos en `engine/hooks/shell.js`, todos con la misma forma
`if (!isCommit(command)) return`:

- **`:122`**, en `dependencies` — manifiesto tocado sin su lockfile.
- **`:233`**, en `governance` — reglas, ADRs, contratos de cargo y evaluaciones.
- **`:271`**, en **`verify`** — OpenAPI o SQL fuente sin su código regenerado.

El tercero no es el guard llamado `generated`: ése vive en el grupo de archivos, no lee el índice y no
depende de `isCommit`. Nombrarlo por lo que hace y no por su guard manda a medir el que no era —pasó al
escribir la prueba de este caso, y el guard equivocado pasó en verde, que se lee como «el arreglo no
llegó»—.

Y el consumidor que se relaja de más, `:44`:

```js
const command = isCommit(raw) ? unquoted(raw) : raw
```

Que la ironía quede escrita: el prefijo que Cauce **exige** para un commit de gobernanza es
`OPS_GOVERNANCE_OVERRIDE=1`, y ese prefijo hace que el guard de gobernanza ni siquiera se ejecute. El
override no autoriza el commit: lo vuelve invisible. Un proyecto que siga el procedimiento al pie nunca
va a notar la diferencia, porque el resultado que ve —el commit pasa— es el mismo que esperaba.

## Fix propuesto

Consumir las asignaciones iniciales antes de leer el verbo, en el mismo lugar donde se decide la
posición del comando:

```diff
+// En un shell, `VAR=1 git commit` empieza por la asignación y no por `git`. Saltarlas es lo que separa
+// leer el verbo de leer lo que le pusieron adelante. Importa en los dos sentidos: sin esto el mensaje
+// se juzga como comando, y —peor— los guards que sólo corren sobre commits no corren.
+const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/
+const stripPrefix = (c) => c.replace(/^(?:\s*[A-Za-z_][A-Za-z0-9_]*=(?:'[^']*'|"[^"]*"|\S*)\s+)+/, '')
+
 function isCommit(command) {
-  return /(?:^|[;&|]\s*)git(?:\s+-C\s+\S+)?\s+commit(?:\s|$)/.test(command)
+  return /(?:^|[;&|]\s*)git(?:\s+-C\s+\S+)?\s+commit(?:\s|$)/.test(stripPrefix(command))
 }
```

`env FOO=1 git commit` y `sudo git commit` tienen la misma forma y conviene resolverlos de una vez.

Dos detalles del diff: la constante `ASSIGN` se declara y no la usa nadie —sobra, o falta usarla—, y
`stripPrefix` hay que aplicarlo también en `gitDirectory`, que ancla igual y decide sobre qué repo se
lee el índice.

Verificado el 2026-09-06 contra `governance` sobre un repo con un archivo de gobernanza en el índice:
`git commit` bloquea, `FOO=1 git commit` pasa, y `OPS_GOVERNANCE_OVERRIDE=1 git commit` pasa sin que el
guard llegue a mirar nada — el override no se leyó, el comando dejó de parecer un commit.

Y hace falta una prueba por cada uno de los cuatro consumidores, no una sola sobre `isCommit`: lo que
se rompió no fue la función sino lo que cada consumidor hace cuando ella miente, y las dos direcciones
fallan distinto.

## Tradeoffs

Ninguno del lado del fix: saltar asignaciones iniciales es lo que hace el shell, así que acerca el
parser a la semántica real.

El riesgo está en no hacerlo. Un guard que se apaga sin decirlo es peor que uno que no existe: el
proyecto cree tener la protección, y el día que importe no va a haber ni un mensaje que explique por
qué no saltó.

## Prioridad

**Alta**, y sube desde «media» —que era la valoración con sólo la cara ruidosa a la vista— por la
silenciosa. Tres guards que se desactivan con una variable delante, sin registro, y justamente con el
prefijo que el procedimiento oficial manda escribir.

## Contexto de descubrimiento

Al commitear en `gouduet` la actualización a 0.62.0, el 2026-09-06. El mensaje explicaba, entre los
ocho defectos cerrados, que un mensaje que nombra una operación vigilada ya no dispara su guard — y el
commit fue bloqueado por nombrarla. El commit tocaba `planning/rules/system/`, así que llevaba
`OPS_GOVERNANCE_OVERRIDE=1` delante.

Buscando por qué, apareció la cara silenciosa, que nadie estaba buscando.

## Relacionados

- [031](031-el-guard-que-no-puede-leer-el-indice-deja-pasar.md) — el otro camino al mismo resultado,
  por `gitDirectory` en vez de `isCommit`, y con la misma consecuencia: los tres guards no corren.
- Es la tercera vez que un guard de este proyecto decide qué es el comando mirando la palabra
  equivocada. Las dos anteriores fueron del lado de la regla; ésta cae de los dos lados a la vez.
