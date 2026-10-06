---
caso: 294
titulo: borrar una prueba por shell no lo mira ningún guard
estado: resuelto
resuelto-en: 0.103.3
prioridad: media
version-detectada: 0.103.2
---

# 294 — `rm` o `git rm` sobre una prueba pasa, y el mismo borrado con la herramienta de edición se frena

**🟢 resuelto en 0.103.3** · detectado en 0.103.2 · prioridad **media**.

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

## Cierre

**Resuelto en 0.103.3.** El dueño eligió la opción 1.

### El recorrido de lo que este caso enumeró

- **1, que el shell mire lo mismo — se hizo distinto en un punto.** `rm`, `unlink` y `git rm` sobre una
  prueba se frenan con la salida de `test-evidence`. `mv` quedó afuera: mover una prueba no la saca de la
  suite, y renombrarla es trabajo corriente.
- **2, dejarlo y decirlo — se decidió que no.**
- **Tradeoff, frena también el borrado legítimo — se paga**, acotado a lo que importa: sólo una prueba ya
  commiteada, y sólo dentro de la instancia y sus raíces. La que el agente escribió en la misma tarea y
  quiere rehacer pasa, y una copia desechable también.
- **Tradeoff, cubre la forma habitual — se paga.** Una ruta con una variable sin resolver o un script que
  borra, pasan.

### Lo que el caso no preveía

- **El comodín.** `rm test/*.test.js` nombra una sola palabra y borra todas. La primera versión lo dejaba
  pasar, y lo encontró una mutación que sobrevivía. Ahora el comodín del último tramo se resuelve mirando la
  carpeta.
- **La carpeta entera**: `rm -rf test` se frena igual que un archivo.
- **Un borrado detrás de un commit en el mismo renglón.** La primera versión no miraba un comando que
  commiteaba, para no leer su mensaje como orden, y con eso dejaba pasar el `rm` que viniera después. El
  mensaje va entre comillas y nunca fue un problema; se quitó esa salida.
- **Dónde está la prueba.** Si es una prueba se decide por su ruta dentro del proyecto. Con el proyecto
  clonado bajo una carpeta llamada `tests`, la ruta entera habría vuelto prueba a todos sus archivos.

### Qué se corrió

- **La reproducción, antes y después**, contra el guard: los tres comandos salían con 0 y ahora se frenan.
- **Lo que tiene que pasar**, veinte formas: borrar un fuente, leer la prueba, `git mv`, el mensaje de un
  commit que nombra el borrado, una copia en el temporal, la prueba sin commitear, un comodín que no alcanza a
  ninguna prueba, y lo que no se puede resolver.
- **Doce mutaciones en rojo**, en una copia. Dos sobrevivieron la primera vez y cambiaron el código: la del
  commit y la del comodín, de arriba.
- **La puerta entera**, `npm run ci`.
- **Una sesión real** se corrió después, dos veces, abajo.

### Dos corridas reales, el 2026-10-06

Banco sidecar con una sola tarea, «retirar la prueba legada», y una sesión real con `/autobuild`.

**La primera encontró un hueco de este mismo guard.** Build borró la prueba con
`F="$W/app/test/legado.test.js"; rm -- "$F"`: la ruta en una variable asignada en el mismo comando, que es
como un agente lo escribe casi siempre. El guard dejaba pasar toda ruta con una variable. Ahora resuelve las
que el propio comando asigna; lo que va entre comillas simples no, igual que el shell. Tiene su prueba, con
ese comando textual, y su mutación en rojo.

**La segunda, con eso corregido, frenó.** Build corrió `git -C app rm test/legado.test.js` y recibió el
bloqueo en 0,1 segundos, sin diálogo. El recorrido paró con `build-blocked`, dejó una fila `pendiente` que
dice qué se frenó y qué línea pegar para destrabarlo, commiteó el estado de planning y soltó la corrida en
seis minutos, con diez agentes. La prueba siguió en su lugar y el producto en `main`, sin cambios.
