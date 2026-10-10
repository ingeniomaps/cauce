---
caso: 362
titulo: en una instancia embebida, el commit de una tarea no se encuentra si su servicio es una carpeta
estado: resuelto
resuelto-en: 0.106.0
prioridad: media
version-detectada: 0.105.0
---

# 362 — En una instancia embebida, la entrada de DONE cita su commit con el nombre del servicio; si el servicio es una carpeta del repositorio y no un repositorio, `check` dice que «su repositorio no está en esta máquina» y `ops evidence` da la prueba por ausente

**🟢 resuelto en 0.106.0** · detectado en 0.105.0 · prioridad **media**.

**Prioridad media**: no frena nada —es un aviso—, pero en esa disposición sale en cada tarea cerrada y deja
a `ops evidence` sin poder contestar por ninguna. Y el aviso afirma algo falso: el repositorio está, es
donde corre el comando.

## Resumen

El recorrido escribe el commit de una tarea como `<sha> <asunto> (<servicio>@<rama>)`. Para buscar ese commit,
el motor toma lo que va antes de la arroba por el nombre de un repositorio: una raíz declarada, o una carpeta
dentro de una raíz **que sea** un repositorio.

En una instancia embebida el producto y la instancia comparten repositorio, y un servicio suele ser una
carpeta suya —`src`, `api`—. Esa carpeta existe y no es un repositorio, así que el nombre no resuelve a
nada: el commit queda «sin comprobar», y `evidence`, que lee la prueba del commit cuando no está en disco,
no tiene de dónde leerla.

## Reproducción

Instancia embebida (`ops init --mode embedded`) sobre un repositorio con `src/` y `test/`, raíz `.`, una
tarea con `service: src` en un hito de una línea, y `/autobuild` desde la línea.

## Síntoma

De una corrida real de `/autobuild` en una línea de una instancia embebida, el 2026-10-09. La tarea cerró
bien, de Triage al checkpoint. Lo que quedó en `done/`:

```
commit: 4c79475… feat: add restar to the calculator (src@feat/restar-dos)
```

```
$ git cat-file -t 4c79475
commit

$ node tools/ops.js check planning
⚠ done/: 1 commit(s) no se comprobaron porque su repositorio no está en esta máquina (src)

$ node tools/ops.js evidence planning
  … [ausente]
  … [ausente]
```

Con el motor de `main` sale idéntico: es anterior a la rama donde se encontró. En las tres instancias reales
que hay en la máquina donde se midió no aparece, y las tres son sidecar.

## Causa raíz

- `engine/core/repos.js`, `commitPlaces` — `repoOfName` acepta una carpeta dentro de una raíz sólo si la
  raíz de su repositorio es ella misma. Esa igualdad se puso para comparar contra la ruta real cuando el
  repositorio se alcanza por un enlace (caso 273), y deja afuera la carpeta que está **adentro** de un
  repositorio.
- `engine/core/repos.js`, `reposFor` — ya sabe contestar de qué repositorio es un servicio, subiendo desde
  su carpeta, y es lo que usa `ops worktree`. La búsqueda del commit no lo usa.

## Fix propuesto

Que un nombre que no resuelve como repositorio se pruebe como servicio: si `reposFor` da exactamente un
repositorio para ese nombre, es ése.

## Valor

En una instancia embebida con servicios que son carpetas, `check` deja de avisar por cada tarea cerrada y
`evidence` vuelve a contestar. Fuera de esa disposición no cambia nada.

## Qué podría salir mal

1. **Resolver a un repositorio que no es del proyecto.** `reposFor` sube hasta el primer repositorio que
   encuentra; con una raíz que es una carpeta suelta dentro de otro repositorio, sería ése. Es lo que ya
   hace para `ops worktree`.
2. **Cambiar un veredicto en instancias que hoy andan.** Sólo puede pasar de «sin comprobar» a «encontrado»
   o a «no está». Se mide con el motor anterior y el nuevo sobre instancias reales.
3. **Un nombre de servicio que existe en dos repositorios.** Ahí no hay uno solo, y queda como hoy.

## Cierre

**Resuelto en 0.106.0**, con el fix propuesto y una parte más que la prueba sobre la corrida real mostró.

### El recorrido de lo que este caso enumeró

- **Fix, probar el nombre como servicio — se hizo.** Un nombre que no es un repositorio ni la instancia se
  resuelve con lo mismo que usa `ops worktree`: el repositorio de ese servicio, si es uno solo.
- **Qué podría salir mal 1, un repositorio que no es del proyecto — se acepta**, por la razón escrita: es lo
  que ya hace `ops worktree`.
- **2, cambiar un veredicto en instancias que andan — medido, ninguno.** Motor anterior contra éste sobre
  tres instancias reales, las tres sidecar, en sólo lectura: los mismos avisos de `check`, y en `evidence`
  161 entradas y 153 trazas sin un veredicto distinto.
- **3, un servicio que existe en dos repositorios — queda como estaba**: no hay uno solo, y no se elige.

### Lo que este caso encontró y no preveía

**Con el commit ya encontrado, `evidence` seguía dando las pruebas por ausentes.** El recorrido pide la ruta
de la prueba desde la carpeta del servicio; cuando la prueba vive fuera de ella —el servicio es `src` y las
pruebas están en `test/`— la ruta llega como `../test/…`, y `evidence` busca por cómo termina la ruta: con
`..` adelante no coincidía nunca, tampoco con la prueba que sí estaba en disco. Ahora se busca sin lo que
tenga de subir adelante.

### Qué se corrió

- **Sobre la corrida real del síntoma**, con el motor nuevo:

  ```
  $ node tools/ops.js check planning       # ya no avisa del commit
  ✓ planning válido: 0 épica(s), 0 tarea(s) en cola, 1 terminada(s)

  $ node tools/ops.js evidence planning
    … [encontrado] — … restar devuelve la diferencia de dos números (en el commit 4c79475…, no en disco)
    … [encontrado] — … restar respeta el orden de los operandos (en el commit 4c79475…, no en disco)
    … [encontrado] — … sumar devuelve la suma de dos números
  ```

- Rojo previo: una prueba en `test/planning/done-commits.test.js` y otra en `ops-evidence.test.js`.
- Dos mutaciones, cada una en rojo: sin probar el nombre como servicio, y sin quitar lo de subir.
- La comparación sobre instancias reales de arriba.

### Lo que encontró la revisión independiente

Dos hallazgos:

- **Una carpeta que existe y no trae nada de este repositorio se tomaba por servicio suyo** (reproducido):
  la que deja vacía un repositorio anidado en una línea, o la de un repositorio sin clonar. El commit de ese
  otro repositorio pasaba de «sin comprobar» a «no existe». Ahora el nombre vale como servicio sólo si la
  carpeta trae archivos de este repositorio; una vacía o un enlace de git no. Dos mutaciones en rojo.
- **Sin lo de subir adelante, una prueba homónima en otra carpeta puede dar la traza por encontrada**
  (leído) — **se decidió que no cambia.** `evidence` busca por cómo termina la ruta, y eso ya vale para toda
  traza que nombra su archivo sin carpeta: `../test/a.test.js` queda igual de laxo que `test/a.test.js`.
  Antes no era más estricto, era siempre `ausente`.

## Contexto de descubrimiento

Corrida real de `/autobuild` en una línea de una instancia embebida, hecha para comprobar el guard del caso
360 en esa disposición, que hasta ahí sólo tenía pruebas unitarias. El guard anduvo; esto apareció al mirar
qué dejó la corrida.

## Relacionados

- **356** — el commit que vive en el repositorio de la instancia: la misma búsqueda, otra disposición.
- **254**, **263** y **273** — las formas de nombrar un repositorio dentro de las raíces.
- **353** — `evidence` leyendo la prueba del commit, que acá no encuentra el commit.
