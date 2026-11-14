---
caso: 493
titulo: Ninguna prueba comprueba que los subcomandos de ops citados en la documentación existan
estado: resuelto
resuelto-en: 0.120.0
prioridad: baja
version-detectada: 0.119.0
---

# 493 — Ninguna prueba comprueba que los subcomandos de ops citados en la documentación existan

**🟢 resuelto en 0.120.0** · detectado en 0.119.0 · prioridad **baja**: hoy no hay ninguno inventado en lo vivo. Ya pasó una vez (caso 012), y la prueba hermana para `make` existe.

## Resumen

Hay dos pruebas que fallan si un documento cita un target de `make` que no existe (`test/agents/agents.test.js:132`, `test/repo/repo.test.js:20`). Para `ops <subcomando>` no hay ninguna. Un cargo, un recorrido o el molde que cite un subcomando renombrado o retirado no rompe nada hasta que alguien lo escribe. Es la falta de comparador que describe R27.

## Reproducción

Medido el 2026-11-05, sin modelo. Se juntaron los subcomandos citados como `tools/ops.js <x>`, `ops.js <x>` o `npm run ops -- <x>` en `agents/`, `flows/`, `template/`, `README.md` y `docs/issues/`, y se cruzaron contra los que lista `node engine/cli/ops.js --help`:

```
no en USAGE: de    -> agents/roles/system/data-engineer/evaluations/results/2026-08-22.md
no en USAGE: run   -> (sólo en docs/issues)
no en USAGE: team  -> agents/roles/system/engineering-manager/evaluations/results/2026-08-22.md
```

- `de` es prosa («ops.js de sólo lectura»).
- `team` aparece en un registro histórico de eval y en el caso 012, que es justamente el precedente: el Makefile del molde llamaba a `ops team`, que no existía.
- En los contratos vivos no hay ninguno inventado.

## Causa raíz

No hay prueba. `engine/cli/ops.js` despacha los subcomandos sin exponer una lista consultable desde las pruebas, salvo el texto de `USAGE`.

## Fix propuesto

Una prueba en `test/repo/` hermana de la de `make`:

- Sale de los subcomandos que acepta `ops.js`. Mejor de una lista exportada que de parsear el texto de ayuda.
- Recorre los documentos vivos y excluye los registros históricos (`evaluations/results/`, `docs/issues/`, `CHANGELOG.md`), que citan lo que existía cuando se escribieron.
- Mutación: citar `ops team` en un cargo pone la prueba en rojo.

## Tradeoffs

- **La regex agarra prosa** como `de`. El patrón exige backtick o inicio de línea, como la de `make`.
- **Excluir los registros históricos** es una lista. Por R27 se declara con su razón en la misma prueba.

## Contexto de descubrimiento

Sale de la revisión del 2026-11-05 de los repositorios de una organización externa: los ejemplos de sus skills son entradas que se ejecutaron contra la versión declarada, y cada orden citada tiene que existir en la política de la CLI.

## Relacionados

- Caso 012: el Makefile del molde llamaba a un comando que no existía.

## Cierre

`test/repo/ops-commands.test.js` falla si un documento o un recorrido vivo cita un subcomando de `ops` que no está en
`FLAGS` (`engine/cli/args.js`), que ya era la lista exportada que el caso prefería al texto de ayuda. Reconoce cinco
formas, cada una con su regex: entre backtick o comillas (con el alias `cauce`), `node <cli|ruta a ops.js|$OPS|${…}>`,
`ops` al inicio de línea, `npm run ops --` y `npx …cauce`. Recorre `agents`, `flows`, `template`, `automatization`,
`engine`, `.github` y la raíz (los `.md` menos el CHANGELOG, y el Makefile), en `.md`, `.js`, `.sh`, `.yml`, `.toml` y
Makefile. Excluye por ruta `evaluations/results|cases`, `learning/reports|proposals` y `learning/HISTORY.md`.

Línea de base, antes de escribir la prueba: el barrido del caso repetido con `FLAGS` dio 451 citas vivas de 34 comandos
y ninguna inventada. Con la versión final, la prueba encuentra 492: 225 `node`, 210 entre comillas y 57 al inicio de
línea, todas de comandos existentes.

Contra el caso:

- **Fix, salir de una lista exportada:** se hizo, con `FLAGS`.
- **Fix, recorrer lo vivo y excluir registros:** se hizo, con la exclusión por ruta y su razón al lado (R27). Además de
  los registros que el caso nombraba, se excluyen los fixtures de eval, que pueden citar un comando inventado a
  propósito, y `HISTORY.md`.
- **Fix, mutación con `ops team` en un cargo:** en rojo.
- **Tradeoff, la regex agarra prosa:** se exige la forma de un comando. Quedan tres falsos rojos posibles y hoy no
  ocurre ninguno: `node ${script} build`, y prosa entre comillas que empiece por `ops` o `cauce`. Se dejan, porque dan
  rojo con el archivo nombrado y no pasan en silencio.
- **Tradeoff, la lista de exclusiones:** declarada en la misma prueba con su razón.

Lo que el caso no preveía, y lo encontró la revisión independiente: la primera versión sólo veía backtick y `node …ops.js`,
así que **no leía cómo citan los recorridos**. No veía `node <cli> X`, `node ${context.cli} X` ni `node "$OPS" X` en
`agent-learning.yml`, ni las comillas del texto que `autobuild` le pasa al agente, ni los `.toml` de Gemini, ni
`CONTRIBUTING.md`, ni la línea de instalación del README. Además se saltaba `template/planning/reports/`, que es molde
vivo, porque excluía por nombre de carpeta. Todo eso se arregló.

Decidido que no:

- **El segundo nivel** (`automation installx`, `flow showx`) no se valida: el caso pide subcomandos, y las acciones no
  están en una lista exportada.
- **La forma de array del motor** (`[cli, 'check']`) es código, no una cita en un documento.

### Lista de cierre

1. hecho: el barrido del caso repetido contra `FLAGS` antes de escribir la prueba dio 451 citas, 34 comandos y 0
   inventadas; no había prueba.
2. hecho: en la rama de la tanda, `fix/484-re-review-checks-what-it-asked`.
3. hecho: la prueba es la que se agrega. Su rojo se vio con cada cita inventada de la mutación (punto 4), porque hoy
   no hay ningún defecto vivo que la ponga roja.
4. hecho: 14 mutaciones en copias, todas en rojo: `ops team` en un SKILL.md; `node <cli>`, `node ${cli}` y
   `node "$OPS"` inventados; un comando entre comillas en `autobuild.js`; uno en un `.toml`; `cauce initx` en
   `CONTRIBUTING.md`; uno en `template/planning/reports/`; uno con `npm run ops --`; uno con `npx`; quitar las
   exclusiones; y romper cada forma con piso (`quoted`, `node`, `line`, `npx`).
5. no aplica: no se quita ni se reemplaza nada.
6. hecho: la prueba corre sobre el árbol real del repositorio, sin dobles.
7. no aplica: no depende de un modelo ni de un sistema externo.
8. hecho: corrieron la prueba sobre la versión final, las mutaciones y `npm run ci`. La forma `npm` no tiene ninguna
   cita viva y sólo la ejerció la mutación.
9. no aplica: no coordina nada.
10. hecho: nadie depende de una prueba nueva. La hermana de `make` no cambió, y `FLAGS` sólo se lee.
11. hecho: dos pasadas independientes. La primera encontró dos cosas que impedían entregar (formas de los recorridos y
    `.toml`) y varias menores, arregladas. La segunda no encontró nada que impidiera entregar; su menor, la línea de
    `npx`, se arregló y se vio en rojo. Los falsos rojos latentes quedan anotados arriba.
12. hecho: pasada uno por uno sobre la versión final. El comentario sobre `test/` decía que esa carpeta «cita comandos
    inventados a propósito» y sólo la cita esta misma prueba: se corrigió. El tokenizador a 0,22 devolvió «ninguno».
13. hecho: `npm run ci` con la prueba stageada.
14. hecho: recorrido arriba contra Fix y Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba.
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.120.0`. No lleva entrada en el CHANGELOG porque no viaja
    en el paquete: `test/` no está en `files`.

**Sin probar:** nada.
