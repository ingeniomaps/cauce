---
caso: 258
titulo: verify opina sobre un repositorio que no es el de la sesión
estado: resuelto
resuelto-en: 0.101.0
prioridad: media
version-detectada: 0.100.0
---

# 258 — El guard `verify` juzga cualquier `git commit` que vea la sesión, también el de un repositorio ajeno a ella

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **media**.

**Prioridad media**: no pierde trabajo, pero frena y corre gates sobre repositorios que no declararon esta puerta, que es lo que
R26 pide que una puerta no haga.

## Resumen

El hook está registrado en la sesión y mira el comando, no dónde apunta. Un `git -C <otro repo> commit`
pasa por las mismas reglas que un commit de este repositorio: se bloquea por su forma y, si trae código,
se le corre el `npm test` **del otro repositorio**.

## Reproducción

Medido el 2026-10-05 en una sesión sobre este repositorio, commiteando en repositorios desechables bajo
el temporal de la sesión, creados con `git init` y sin `ops.config.json`:

1. `git init … && git add src/alta.js && git commit -m "feat: alta"` en uno recién creado.
2. `git -C $R commit -m "feat: alta"` con la ruta en una variable.
3. El hook a mano sobre un clon de este repositorio, con código stageado.

## Síntoma

```
BLOQUEADO: El comando stagea y commitea a la vez, así que este guard lee el índice de antes de stagear y no puede ver qué se commitea.
BLOQUEADO: no se pudo leer el índice de <repo de la sesión>/$R (fatal: cannot change to …). Un guard que no puede verificar no autoriza.
BLOQUEADO: Verify falló en clon: test (exit 1, 53.8 s)
```

Los dos primeros frenaron commits en un repositorio de una línea que no tiene ninguna puerta. El tercero
corrió durante 54 s la suite de un repositorio que la sesión no tiene abierto.

## Causa raíz

`engine/hooks/verify.js:209`: `stagedForCommit(command, cwdOf(input))` resuelve el repositorio desde el
`-C` del comando y sigue con él. Nada compara ese repositorio con la raíz de la sesión ni con los
`workspaceRoots` de la instancia.

## Fix propuesto

Que `verify` actúe sólo cuando el repositorio del commit es la raíz de la sesión o está entre los
`workspaceRoots` declarados, y deje pasar el resto. En sidecar los repos del producto están declarados,
así que siguen cubiertos.

## Tradeoffs

- Un repositorio que el agente crea fuera de lo declarado deja de verificarse. Es lo que se busca para un
  desechable, y es un hueco si alguien trabaja de verdad en un repo sin declararlo.
- El mensaje de «stagea y commitea a la vez» protege una lectura del índice; fuera de alcance, esa
  lectura no se hace y el mensaje no aplica.

## Contexto de descubrimiento

Al armar repositorios desechables para probar con un agente real los casos 251 y 253: cada commit de
preparación chocó con el guard de este repositorio.

## Relacionados

- 257 — verify deja pasar dentro de la sesión un commit que a mano bloquea.
- 240 — verify corre sin cota y escribe en el árbol.

## Cierre

**Resuelto en 0.101.0.** Los guards de commit —`verify`, gobernanza, dependencias y la pasada de
comentarios— actúan sólo sobre un repositorio de la sesión: la carpeta en la que se abrió, la raíz ops o
una raíz de código declarada. Un commit en cualquier otro pasa sin juzgarse.

### El recorrido de lo que este caso enumeró

- **Fix — se hizo, y más ancho que lo propuesto**: en `stagedForCommit`, que comparten los cuatro guards,
  y no sólo en `verify`. Con dos copias uno habría frenado donde el otro deja pasar.
- **Tradeoff «un repositorio sin declarar deja de verificarse» — sigue en pie.** Es el precio de no opinar
  sobre vecinos; la salida es declararlo en `workspaceRoots`.
- **Tradeoff del mensaje «stagea y commitea a la vez» — se hizo**: fuera de alcance ya no aparece.
- **Síntoma 2, la ruta en una variable — queda frenando.** Una ruta que no se resuelve cuelga de la
  carpeta de la sesión, así que cuenta como propia: «un guard que no puede verificar no autoriza».

### Lo que el caso no preveía

- **`git-add` tenía el mismo defecto.** Al armar un banco fuera del árbol, `git add -A` en ese repositorio
  se frenó con «Stagea rutas explícitas». La regla de stagear por nombre es de los repositorios de la
  sesión, y ahora usa el mismo alcance. Dos pruebas de sintaxis apuntaban git a `/tmp` como ejemplo de
  opción global; pasaron a apuntar adentro, porque con `/tmp` ya no medían la regla sino el alcance.
- **Queda otro sobrebloqueo de otra clase**, que salió como caso 259: un guard que lee como comando un
  texto que está dentro del argumento de otra herramienta.

### Qué se corrió

- **La reproducción, después, desde la sesión**: en un repositorio desechable con el gate en rojo,
  `git add a.js && git commit` en un solo comando creó el commit. Antes daba los dos bloqueos del Síntoma.
- **El propio sigue frenando**: la misma prueba bloquea el commit de la sesión con «Verify falló» y con
  «stagea y commitea a la vez», y bloquea el del ajeno en cuanto se lo declara como raíz.
- **`git-add`, antes y después**: la prueba nueva —stagear todo en un repositorio ajeno pasa, en el propio
  frena, y una ruta sin resolver frena— se vio en rojo sin el cambio.
- **Cinco mutaciones en rojo**, en una copia: todo repositorio contando como propio, ninguno contando, la
  raíz declarada sin contar, la pasada de comentarios juzgando al ajeno, y contener a la sesión sin
  contar.
- **La puerta entera**, `npm run ci`.

### En los otros runners, el 2026-10-05

Sesión real con Codex, con Gemini y con Antigravity, sobre una instancia sidecar y con el registro crudo del
hook en los dos primeros: el commit en un repositorio que la instancia no declara corrió, y el del producto
con la suite en rojo se frenó.
