---
caso: 407
titulo: engine/hooks/shell.js y engine/planning/contracts.js quedaron en el límite de 500 líneas, y el próximo cambio los pasa
estado: resuelto
resuelto-en: 0.112.0
prioridad: media
version-detectada: 0.112.0
---

# 407 — `shell.js` y `contracts.js` están a una y a tres líneas del límite: hay que separarlos por propósito antes de que el próximo arreglo los obligue a hacerlo a las apuradas

**🟢 resuelto en 0.112.0** · detectado en 0.112.0 · prioridad **media**. No es un defecto de conducta: es el umbral de R7 disparado. Lo
caro es que llegue en medio de otro arreglo, y que ahí la salida barata sea compactar código que no se estaba tocando
o registrar una excepción sin razón.

## Resumen

La tanda de los casos 396–406 cruzó las 500 líneas en los dos archivos, y la puerta (`test/repo/repo.test.js`,
«ningún archivo de código pasa las 500 líneas sin decir por qué», `MAX_LINES = 500`) frenó:

```
engine/hooks/shell.js: 508 líneas y ninguna razón registrada
engine/planning/contracts.js: 504 líneas y ninguna razón registrada
```

Se volvió abajo compactando: una lista inerte en menos líneas, un comentario de tres líneas en una, `MEASURED_LOCKS`
derivado de las claves de `INERT_KEYS`, y `validDecisionTrace` como flecha. Hoy, medido con `wc -l` y con la cuenta
de la prueba, que suma uno por el salto final:

```
499 engine/hooks/shell.js
497 engine/planning/contracts.js
```

R7 dice que el umbral dispara la revisión y no la división. Esta revisión es la que no se hizo en esa tanda.

## Reproducción

```bash
wc -l engine/hooks/shell.js engine/planning/contracts.js
node --test test/repo/repo.test.js
```

Cualquier cambio que sume dos líneas a `shell.js` o cuatro a `contracts.js` pone la prueba en rojo.

## Causa raíz

**`engine/hooks/shell.js`** junta guards con propósitos y ciclos de vida distintos, todos del grupo `pre-shell`:

- `destructive` (`:76`) y `gitAdd` (`:184`);
- `dependencies` (`:247`), con su lógica de lockfiles: `INERT_KEYS`, `lockUnaffected` (`:229`), las mediciones de npm y
  pnpm (casos 181, 375, 403);
- `shellBoundary` (`:428`), con los destinos de escritura: `writeTargets` (`:363`), `writesWithBase` (`:414`),
  `cdTarget` (`:392`), `REDIRECT`;
- `run` (`:476`), el ejecutor que también usa `verify`.

Lo de los destinos de escritura ya es una biblioteca: lo importan `secrets-shell.js`, `ops-config.js`, `removal.js` y
`shell-changes.js`. La de lockfiles es la que más creció en las últimas versiones.

**`engine/planning/contracts.js`** junta las trazas de DONE (`validTestTrace`, `validDecisionTrace`,
`validCommitTrace`, `validateDoneEntry`, `doneEntryErrors`, `doneCeremonyWarnings`), la validación de épicas
(`validateEpic`, `:249`), las dependencias entre hitos (`dependencyErrors`, `:282`) y el estado entero
(`validateState`, `:320`).

## Fix propuesto

Partir por propósito, no por tamaño:

- `shell.js` → sacar la lógica de lockfiles y `dependencies` a `engine/hooks/dependencies.js`, y los destinos de
  escritura (`REDIRECT`, `writeTargets`, `cdTarget`, `writesWithBase`, `QUOTED_CD`, `positional`) a un módulo propio que
  importen `shellBoundary` y sus otros cuatro consumidores. `run.js` sigue registrando los mismos nombres de guard.
- `contracts.js` → las trazas y la entrada de DONE a un módulo propio; épicas, dependencias y estado se quedan.
- Revisar si la compactación de esta tanda se deshace: con el archivo partido no hace falta que una lista ocupe dos
  líneas en vez de cuatro.

**Es cambiar dónde vive algo, y por R9 eso es una quita**: la aceptación lleva, como condición y no como actividad,
la comparación lado a lado. Sobre la suite entera: mismo conteo de pruebas y ninguna roja. Y sobre los guards de
`pre-shell` corridos como proceso con un juego fijo de comandos —las tablas de `chat-effects.test.js`,
`commit.test.js` y `files.test.js`—: misma salida y mismo código de salida antes y después.

La aceptación pide la mutación: con un export que falte en el módulo nuevo (por ejemplo `writesWithBase`), la prueba
de `ops-config` o la de `secrets-shell` tienen que ponerse rojas, no la carga del módulo pasar en silencio.

## Tradeoffs

- Mover funciones cambia `archivo:línea` de todo lo que hoy las cita: cierres de casos, comentarios, el README de los
  guards. Los cierres viejos no se reescriben, pero las citas vivas (README, comentarios) sí hay que actualizarlas.
- `coverage-baseline.json` necesita pisos para los archivos nuevos, y los de `shell.js` y `contracts.js` cambian.

## Contexto de descubrimiento

Al cerrar los casos 396–406 en la rama `fix/cases-396-406`, el 2026-10-19: la puerta frenó por las 500 líneas y se
salió compactando, que es la salida que R7 dice que no es una salida.

## Relacionados

- 403, 405, 402 y 401: los cambios que llevaron a los dos archivos al límite.

## Cierre

**Resuelto en 0.112.0.** Partido por propósito, como pedía el caso:

| Archivo | Antes | Después |
|---|---|---|
| `engine/hooks/shell.js` (`destructive`, `gitAdd`, `shellBoundary`, `run`) | 499 | 289 |
| `engine/hooks/dependencies.js` (el guard y su lógica de lockfiles) | — | 127 |
| `engine/hooks/shell-writes.js` (`REDIRECT`, `writeTargets`, `cdTarget`, `QUOTED_CD`, `writesWithBase`, `positional`) | — | 108 |
| `engine/planning/contracts.js` (épicas, dependencias, estado, `unverifiableAcceptance`) | 497 | 299 |
| `engine/planning/done-entry.js` (trazas, entrada de DONE, ceremonia, `surfaceWithoutTests`) | — | 212 |

El enunciado, ítem por ítem:

- **`shell.js` → `dependencies.js` y el módulo de destinos de escritura**: hecho. `run.js` registra los mismos nombres de
  guard; `dependencies` sale ahora de su módulo. `DEVICES` y `TEMP` se quedan en `shell.js`, porque sólo los usa
  `shellBoundary`; `MISMO` también, porque lo usan `destructive` y `gitAdd`, y `dependencies.js` lo importa de ahí.
- **Los cuatro consumidores de los destinos de escritura**: `secrets-shell.js`, `ops-config.js`, `removal.js` y
  `shell-changes.js` importan de `shell-writes.js`. Lo que el enunciado no preveía: `removal.js` y `shell-changes.js`
  pedían esas funciones dentro de una función, porque `shell.js` los carga a ellos y pedirlas arriba las dejaba sin
  definir. El módulo nuevo no carga ningún guard, así que el ciclo desapareció, el require subió al principio del archivo y el
  comentario de `removal.js` que lo explicaba se sacó.
- **`contracts.js` → las trazas y la entrada de DONE**: hecho. Se cambiaron los consumidores (`validate.js`, `archive.js`,
  `adoption.js`, `done-commits.js` y dos suites) en vez de reexportar desde `contracts.js`: con dos caminos para el mismo
  nombre, no se sabría cuál es el de verdad.
- **Deshacer la compactación de la tanda**: se decidió que no. `INERT_KEYS` en dos líneas —la lista de gestores medidos son sus
  claves, con `Object.hasOwn`— y `validDecisionTrace` como flecha se leen bien así; volver a abrirlos sería cambiar forma sin razón (R6).
- **Tradeoff, las citas `archivo:línea` vivas**: el README de los guards no cita archivos de estos módulos, así que no había
  nada que cambiar ahí. Se corrigieron dos comentarios que el corte dejaba diciendo algo falso: el encabezado de `shell.js`,
  que contaba `dependencies` entre sus guards, y el de `validateState`, que llamaba vecina a `validateDoneEntry`. Los
  cierres viejos no se tocaron.
- **Tradeoff, los pisos de cobertura**: tres pisos nuevos, medidos sobre tres corridas: `shell-writes.js` 100/96/100,
  `dependencies.js` 97/92/100 y `done-entry.js` 100/100/100. Los de `shell.js` y `contracts.js` dieron lo mismo que
  tenían. `coverage:update` reescribe el archivo entero: se restauró el original y se le agregaron sólo esas tres entradas.

**Lo que se corrió para saber que funciona.** Es un cambio de lugar, así que la condición es la comparación lado a lado (R9),
contra una copia del motor congelada antes de empezar, fuera del árbol:

- **Suite entera**: las mismas 1501 pruebas con los mismos nombres, todas en verde antes y después.
- **`pre-shell` como proceso**: 76 comandos fijos por `node engine/hooks/run.js pre-shell` en un banco fuera de `/tmp`:
  destructivos, `git add`, publicar, escrituras fuera de las raíces, credenciales, `ops.config.json` y seis estados del
  índice con lockfiles. 57 se niegan y 19 pasan. La salida y el código de salida son idénticos en los 76. Antes de
  comparar, la versión de antes se corrió dos veces para confirmar que la salida no varía.
- **Validación de DONE y de estado**: el mismo juego de entradas rotas a propósito por `validateState`, los validadores de
  traza, `doneEntryErrors`, `doneCeremonyWarnings`, `surfaceWithoutTests` y `unverifiableAcceptance`, antes y después:
  JSON idéntico (11 y 16 errores de estado, 3 avisos de ceremonia, 1 de superficie).
- **Mutaciones**, en una copia fuera del árbol, todas en rojo por pruebas de los consumidores y no sólo por la carga:
  - `shell-writes.js` sin `writesWithBase`: 12 rojas, entre ellas «secrets-shell frena leer una credencial por shell y deja
    pasar lo demás»;
  - `done-entry.js` sin `commitParts`: 6 rojas en `done-commits`;
  - `dependencies.js` sin su export: 5 rojas en `commit.test.js`;
  - `shell.js` sin `MISMO`: «guard-dependencies exige consistencia y bloquea publicación».

  El control sin mutar dio 72 de 72.

- **Real, con el paquete que recibe una empresa.** El tarball de `npm pack` trae los tres archivos nuevos. Instalado en
  `node_modules` de una instancia sidecar en un banco fuera de `/tmp`, con el adaptador de Claude y un repositorio `app` al
  lado:
  - `node tools/ops.js check planning` sobre una entrada de DONE rota a propósito da los cinco errores de `done-entry.js`
    (fecha, carril, `tests:`, `commit:` y `decisions:`) y el aviso de ceremonia;
  - una sesión `claude -p` con `CAUCE_DELEGATED=1`, a la que se le piden cinco comandos de la terminal, recibe cinco negativas,
    cada una del guard que corresponde:

    | Comando | Negativa |
    |---|---|
    | stagear todo en `app` (`git -C app add` con `-A`) | «'git add -A/--all/.' está prohibido» (`shell.js`) |
    | `echo x > /var/tmp/w407-fuera.txt` | «el comando escribe en /var/tmp/w407-fuera.txt, fuera de las raíces declaradas» (`shell-writes.js`) |
    | `cat app/.env` | «el comando lee …/app/.env, que es una credencial» (`secrets-shell`, con `writesWithBase`) |
    | `echo clave > app/id_rsa` | «…/app/id_rsa es un archivo de credenciales que su herramienta mantiene» |
    | `git -C app commit` con `package.json` cambiado y sin su lock, en una rama de trabajo | «.: cambió package.json sin actualizar su lockfile.» (`dependencies.js`) |

    Ni el archivo de afuera ni `id_rsa` quedaron escritos, y `app` siguió sin commit. En la rama viva, el commit lo frenó antes
    `live-commit`, así que se repitió desde una rama de trabajo para que llegara a `dependencies`.
