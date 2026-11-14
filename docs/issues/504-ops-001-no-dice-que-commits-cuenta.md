---
caso: 504
titulo: El aviso OPS-001 cuenta commits sin registrar y no dice cuáles, ni con `--json`
estado: resuelto
resuelto-en: 0.120.0
prioridad: baja
version-detectada: 0.119.0
---

# 504 — El aviso OPS-001 cuenta commits sin registrar y no dice cuáles, ni con `--json`

**🟢 resuelto en 0.120.0** · detectado en 0.119.0 · prioridad **baja**: es un aviso y no frena nada. Pero la única salida que deja es buscar a mano en `git log` lo que el motor ya calculó. Sube a media si se mide que alguien escribió una entrada de DONE de memoria para callarlo.

## Resumen

`ops check` avisa «N commit(s) desde <fecha> que ninguna entrada de DONE nombra (OPS-001)» y no nombra ninguno. `unrecordedCommits` ya devuelve cada uno con hash, fecha y asunto, y `coverageWarnings` se queda sólo con el largo de la lista. Con `--json` sale el mismo texto.

Además la ventana se compara por día: arranca en la fecha de la entrada de DONE más reciente, sin hora. El día en que se instala Cauce cuenta como sin registrar el commit del proyecto anterior a Cauce, si es del mismo día. En la corrida a ciegas era ése: `d05d25f chore: initial`.

## Reproducción

Sobre una copia de la instancia que dejó la corrida a ciegas del caso 494 (`/var/tmp/repro-494-12`), con el motor de esta rama:

```bash
cd /var/tmp/repro-494-12/proyecto/ops
node <cauce>/engine/cli/ops.js check planning
node <cauce>/engine/cli/ops.js check planning --json
git -C .. log --format='%h %ad %s' --date=iso
```

## Síntoma

```
⚠ proyecto: 1 commit(s) desde 2026-11-05 que ninguna entrada de DONE nombra, así que ese trabajo no está en planning/ (OPS-001)
```

En `--json`, `warnings` trae la misma cadena y nada más. El historial:

```
53584e8 2026-11-05 15:10:14 -0500 feat(text): add slugify      ← la entrada de DONE lo nombra
d05d25f 2026-11-05 15:05:04 -0500 chore: initial               ← anterior a Cauce, y es el que cuenta
```

También se reprodujo en el banco `suelto` el 2026-11-13: «11 commit(s)… (OPS-001)», sin ningún hash. Ese banco declara `workspaceRoots: ..`, así que contó los commits del repositorio de Cauce. Es una rareza del banco, no del aviso.

## Causa raíz

- `engine/core/repos.js:140-161`, `unrecordedCommits`: devuelve las líneas `%h %ad %s` de cada commit sin registrar.
- `engine/core/repos.js:186-187`, `coverageWarnings`: usa sólo `unrecorded.length`.
- `engine/core/repos.js:149` pide `--date=short` y `:158` filtra con `one.date >= since`, con `since` sin hora.

## Fix propuesto

1. El aviso nombra hasta cinco commits (`hash asunto`) y, si hay más, dice cuántos faltan. Con `--json`, además del texto, una lista con los hashes.
2. Prueba: con dos commits sin registrar, el aviso nombra los dos hashes. Mutación: volver a `length` pone roja la prueba.
3. La ventana por día **no se cambia acá**. Nombrar los commits ya deja ver el de antes de Cauce, y quien lee puede descartarlo. Afinarla pide la hora del commit de la entrada, y no todas las entradas tienen uno.

## Tradeoffs

- **El aviso se alarga.** Con cinco como tope son cinco líneas, y el que cuenta 54 sigue diciendo el número.
- Quien parsee el texto del aviso con una regex ve una cadena distinta. El cambio va en la versión abierta del CHANGELOG.

## Contexto de descubrimiento

Paso 11 del informe de la corrida a ciegas del caso 494 (2026-11-05): la sesión no supo qué commit era y tuvo que deducirlo. Contrastado el 2026-11-13. Lo de la ventana por día salió al reproducirlo.

## Relacionados

- 494, de donde sale.
- 082 y 169: el origen del aviso y su lectura del hash.

## Cierre

El aviso nombra hasta cinco commits sin registrar, con hash y asunto, y si hay más dice cuántos:

```
⚠ proyecto: 1 commit(s) desde 2026-11-05 que ninguna entrada de DONE nombra, así que ese trabajo no está en planning/ (OPS-001): d05d25f chore: initial
```

Línea de base, con la reproducción del caso sobre una copia de la instancia de la corrida a ciegas: el mismo aviso
terminaba en `(OPS-001)` sin ningún hash, en texto y en `--json`.

Contra el caso:

- **Fix 1, nombrar hasta cinco y decir cuántos faltan:** se hizo (`engine/core/repos.js`, `coverageWarnings`), sin la
  fecha de cada uno, porque el aviso ya dice desde cuándo cuenta.
- **Fix 1, con `--json` una lista con los hashes:** se decidió que no. `warnings` es una lista de cadenas que comparten
  todos los avisos de `check`, y darle forma propia a uno cambia el contrato de todos. Los hashes ya viajan en el texto,
  y en `--json` se ven igual (medido abajo).
- **Fix 2, prueba con dos commits y mutación:** se hizo, en `test/planning/coverage-warnings.test.js`, con siete
  commits además de dos para el tope.
- **Fix 3, no tocar la ventana por día:** respetado. En la copia, el commit que cuenta es `d05d25f chore: initial`, el
  de antes de Cauce, y ahora se lee. El caso daba por hecho que nombrarlos siempre lo deja ver, y vale sólo con cinco o
  menos: se nombran los más nuevos, en el orden de `git log`, y el de antes de Cauce es el más viejo de la ventana. Con
  más de cinco queda dentro de «y N más». Se deja así: el día de la instalación la ventana es corta.
- **Tradeoff, el aviso se alarga:** queda en una línea, con los commits separados por `;`.
- **Tradeoff, quien parsee el texto:** buscado en `engine/`, `automatization/`, `template/`, `agents/` y `flows/`.
  Nadie lo parsea: lo produce `repos.js` y lo imprime `validate.js`. Las pruebas de `coverage-warnings` y de
  `done.test.js` lo comparan con regex sobre el principio, que sigue igual. `autobuild` le pasa los avisos al agente de
  cierre tal cual y los registra: desde ahora llevan los asuntos de los commits, que es texto del repositorio. El cambio va en el CHANGELOG de la versión abierta.

Lo que el caso no preveía:

- **Un commit sin asunto** dejaba entrar su fecha al aviso. Lo encontró la revisión independiente, y se arregló con su
  aserción.
- **Un asunto que traiga `; `** se lee igual que el separador de la lista. Es cosmético y no se cambia.
- **En el banco `suelto` recreado hoy el aviso no sale**, porque el banco no tiene entradas en DONE y la ventana no
  tiene desde dónde arrancar. Los «11 commit(s)» del 2026-11-13 eran de un banco con una entrada.

### Lista de cierre

1. hecho: la reproducción del caso sobre `/var/tmp/repro-503`, una copia de la instancia de la corrida a ciegas, antes
   del cambio. El aviso no nombraba ningún commit, en texto ni en `--json`.
2. hecho: en la rama de la tanda, `fix/484-re-review-checks-what-it-asked`.
3. hecho: la prueba nueva, en rojo con `repos.js` sin el cambio (`git stash`): «falta «40b4891 fix: el segundo»». En
   verde con él.
4. hecho: cuatro mutaciones, todas en rojo: subir el tope a diez, dejar la fecha en cada commit, quitar el «y N más» y
   volver a exigir un espacio después de la fecha (el commit sin asunto). La del caso, volver al número solo, es la del
   punto 3.
5. hecho: no se quita nada del aviso. Lo de antes y lo de después sobre la misma copia, lado a lado, arriba y en
   «Síntoma».
6. hecho: `ops check planning` y `--json` del motor de la rama, sobre la copia. Los dos nombran `d05d25f chore: initial`.
7. no aplica: no depende de un modelo ni de un runner. Git es el de la máquina, el mismo que usa la prueba.
8. hecho: corrieron el texto y `--json` sobre la copia, la prueba con dos y con siete commits y las tres anteriores
   (largos de `%h` de 7, 8 y 12, y la exclusión del planning). No corrió una instancia con varios repositorios.
9. no aplica: no coordina nada. Cada repositorio arma su aviso por separado, como antes.
10. hecho: nadie parsea el aviso (Tradeoffs, arriba).
11. hecho: dos pasadas independientes. La primera no encontró nada que impidiera entregar; de sus menores se arreglaron
    el commit sin asunto, el lugar de la constante y el comentario, y el orden y el separador quedan anotados arriba. La
    segunda, sobre ese arreglo, nada.
12. hecho: pasada uno por uno sobre los dos comentarios nuevos.
13. hecho: `npm run ci` con los archivos stageados: 1766 pruebas, 0 fallas.
14. hecho: recorrido arriba contra Fix y Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba.
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.120.0`, y entrada en el CHANGELOG.

**Sin probar:** una instancia con más de un repositorio en `workspaceRoots`.
