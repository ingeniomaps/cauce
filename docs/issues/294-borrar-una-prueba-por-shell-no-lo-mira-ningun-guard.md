---
caso: 294
titulo: borrar una prueba por shell no lo mira ningún guard
estado: abierto
prioridad: media
version-detectada: 0.103.2
---

# 294 — `rm` o `git rm` sobre una prueba pasa, y el mismo borrado con la herramienta de edición se frena

**🔴 abierto** · detectado en 0.103.2 · prioridad **media**.

**Prioridad media**: es un freno que existe y se esquiva sin querer. Borrar o apagar una prueba es lo que
vuelve verde una suite sin arreglar nada, y por eso pide a una persona; por shell no lo pide nadie.

## Resumen

`test-evidence` frena que un agente borre o apague una prueba. Mira las herramientas de archivo —un parche
que quita el archivo, un `skip` agregado—. Un `rm test/x.test.js` o un `git rm` van por el shell, y ningún
guard del grupo de shell mira si lo borrado es una prueba.

## Reproducción

Instancia sidecar con el producto en una raíz declarada. Pasándole al hook de shell la llamada como la manda
el runner, desde un subagente:

```bash
git -C app rm test/legado.test.js
rm app/test/legado.test.js
cd app && git rm -q test/legado.test.js
```

## Síntoma

Las tres salen con 0. En una corrida real de `autobuild`, Build corrió `git rm test/legado.test.js` y el
borrado quedó en el índice sin que nada lo frenara ni lo anotara.

En esa corrida el borrado era lo que la tarea pedía, así que el resultado fue el correcto. Lo que el caso
registra es que el guard no opinó: habría pasado igual si la tarea no lo pedía.

## Causa raíz

`engine/hooks/files.js`, `testEvidence`: recorre `filesOf(input)`, que son las rutas de una herramienta de
archivo. `engine/hooks/shell.js` no tiene una regla equivalente; `destructive` mira borrados sobre disco,
dispositivos y rutas fuera de lo desechable, no qué clase de archivo se borra.

## Fix propuesto

Pide una decisión del dueño, porque agrega un freno:

1. **Que el shell mire lo mismo**: un `rm`, `git rm` o `mv` cuyo objetivo es una prueba se frena como en
   `test-evidence`, con la misma salida.
2. **Dejarlo y decirlo**: `test-evidence` cubre las herramientas de archivo y no el shell, y lo que lo
   sostiene por shell es Review, que lee el diff.

## Tradeoffs

- La 1 frena también el borrado legítimo: la tarea que pide retirar una prueba pararía hasta que una persona
  lo apruebe. Dentro de un recorrido eso es una parada con su fila, no un diálogo (caso 285).
- La 1 lee un comando, así que cubre la forma habitual y no un script decidido, como el resto de los guards
  de shell.
- La 2 deja el freno a medias: existe para una herramienta y no para la otra.

## Contexto de descubrimiento

Buscando provocar una regla de autoridad dentro de un recorrido, para ver qué hace el recorrido cuando lo
frena. La tarea pedía borrar una prueba y no hubo freno que observar.

## Relacionados

- 285 — qué hace un guard al frenar: de autoridad, y dentro de un recorrido bloquea.
- 104 — leer una credencial por shell, el mismo hueco en otro guard, que ya se cerró.
