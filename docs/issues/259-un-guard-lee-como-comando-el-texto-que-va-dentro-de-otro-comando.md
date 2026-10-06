---
caso: 259
titulo: un guard lee como comando el texto que va dentro de otro comando
estado: resuelto
resuelto-en: 0.101.0
prioridad: media
version-detectada: 0.100.0
---

# 259 — Un guard de shell frena un comando por una frase que sólo aparece como texto en el argumento de otra herramienta

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **media**.

**Prioridad media**: no deja pasar nada, frena de más. Cuesta una vuelta cada vez, y enseña a desconfiar
de un bloqueo que casi siempre tiene razón.

## Resumen

Los guards de shell buscan la forma prohibida en todo el texto del comando. Cuando esa forma está entre
comillas como dato de otra herramienta —el patrón de un `sed`, el texto de un `grep`, un `echo`—, la
frenan igual: lo que se bloquea no stagea ni commitea nada.

## Reproducción

Medido el 2026-10-05 en una sesión sobre este repositorio, al editar una prueba con `sed`:

```bash
sed -i "153s|'git -C /tmp commit -am sonda'|'git -C . commit -am sonda'|" test/hooks/git-add.test.js
```

## Síntoma

```
BLOQUEADO: 'git commit -a' stagea al commitear, después de este guard: nadie llega a revisar el diff staged, ni vos ni los guards que lo miran.
```

El comando era un `sed` sobre un archivo. No hay ningún `git` que se ejecute.

## Causa raíz

`engine/hooks/shell.js`, en `gitAdd`: el patrón se prueba contra el comando entero. Lo entrecomillado se
vacía sólo cuando el comando es un commit, y el comentario dice por qué no en los demás: «Fuera de un
commit lo entrecomillado sí se ejecuta» —`bash -c "git add -A"`, `eval '…'`—. Es cierto para un ejecutor
y falso para todo lo demás, y la regla no distingue.

No se revisó cuántas de las otras reglas de `shell.js` comparten la forma.

## Fix propuesto

Tratar lo entrecomillado como comando sólo cuando lo recibe algo que lo ejecuta —`bash -c`, `sh -c`,
`eval`, `xargs`, `ssh`—, y como dato en el resto. Es la separación que ya hace el hook de identidad de
`gh` de este repositorio, que tiene prueba para las dos mitades.

## Tradeoffs

- La lista de ejecutores es una lista, y lo que quede afuera pasa. Es el lado que R27 pide no elegir: hace
  falta la prueba que recorra los ejecutores conocidos y falle con uno nuevo sin clasificar.
- Un heredoc que alimenta un shell es comando y uno que escribe un archivo es texto; ya está resuelto
  para `gh` y hay que no romperlo.

## Contexto de descubrimiento

Al arreglar el 258. El bloqueo cayó sobre la edición de la prueba del propio guard.

## Relacionados

- 258 — verify opina sobre un repositorio que no es el de la sesión.
- 036 — `git -C ruta add -A` esquivaba la prohibición. Es el otro lado de la misma lectura: ahí leía de menos.

## Cierre

**Resuelto en 0.101.0, al revés de como proponía el fix.** El caso pedía una lista de ejecutores; se hizo
una lista de los que **sólo leen** su argumento —`sed`, `grep`, `egrep`, `fgrep`, `rg`, `echo`, `printf`,
`jq`—. Con la de ejecutores, uno que nadie anotó pasaba; con ésta, un programa que nadie anotó se sigue
leyendo como orden, que es el lado que frena.

Rige para `git-add` y para las reglas de `destructive`, que compartían la lectura.

### El recorrido de lo que este caso enumeró

- **Fix — se hizo distinto**, por lo de arriba.
- **«No se revisó cuántas de las otras reglas comparten la forma» — se revisó.** Tres lugares armaban la
  misma expresión: `destructive`, `git-add` y la lectura de credenciales. Los dos primeros pasaron a la
  lectura nueva. **La de credenciales no**: ahí lo entrecomillado es una ruta —`rg KEY -g '.env*'`—, y
  vaciarlo dejaba pasar justo lo que ese guard frena. Lo mostró su propia prueba, en rojo.
- **Tradeoff «lo que quede afuera pasa» — se dio vuelta**: lo que queda afuera frena.
- **Tradeoff del heredoc — no aplica, y acá decía lo contrario.** El cuerpo de un heredoc ya se quitaba
  antes de que ningún guard lo mirara; se midió al abrir el caso 264, que se descartó por eso.

### Lo que el caso no preveía

- **Aun para un lector, el texto vuelve a ser orden en dos casos**, y los dos frenan: si lleva una
  sustitución adentro —`echo "$(…)"`— y si el comando se lo pasa a un shell por una tubería.
- **El defecto mordió dos veces más mientras se arreglaba**, sobre los scripts de prueba del propio
  arreglo, escritos con `node -e` y los comandos como texto entre comillas. Eso no cambia: `node` ejecuta
  lo que recibe.

### Qué se corrió

- **La reproducción, después, desde la sesión**: el `sed` y un `grep` con la frase prohibida en el patrón
  corrieron. Antes daban el bloqueo del Síntoma.
- **Cuatro mutaciones en rojo**, en una copia: todo lo entrecomillado tomado por dato —que es dejar pasar
  `bash -c`—, nada tomado por dato, la tubería a un shell sin contar y la sustitución sin contar.
- **La puerta entera**, `npm run ci`.
