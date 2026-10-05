---
caso: 258
titulo: verify opina sobre un repositorio que no es el de la sesión
estado: abierto
prioridad: media
version-detectada: 0.100.0
---

# 258 — El guard `verify` juzga cualquier `git commit` que vea la sesión, también el de un repositorio ajeno a ella

**🔴 abierto** · detectado en 0.100.0 · prioridad **media**.

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
