---
caso: 499
titulo: el guard de workers toma un pipe entre comillas por un separador de comandos
estado: resuelto
resuelto-en: 0.120.0
prioridad: baja
version-detectada: 0.119.0
---

# 499 — `node -e 'const r = /(pytest|jest|vitest)/i'` dispara el guard de workers como si corriera jest sin cota

**🟢 resuelto en 0.120.0** · detectado en 0.119.0 · prioridad **baja**.

**Prioridad baja**: frena un comando que no corre ningún runner, y se esquiva pasando el script a un archivo. Sube a
media el día que frene una corrida de un recorrido, que no puede mover su comando a un archivo sola.

## Resumen

El guard `test-workers` frena un `jest` o `vitest` sin cota cuando lo ve «en posición de comando», y cuenta como tal
lo que sigue a un `;`, `&`, `|`, `(` o salto de línea. Ese conteo no sabe si el separador está dentro de comillas. Un
script de `node -e` (o cualquier argumento entrecomillado de un programa que no está en `DATA_ONLY`) que trae una
alternancia como `pytest|jest` se lee como `… | jest`, y el guard frena una corrida que no existe.

## Reproducción

Sobre 0.119.0, desde la raíz de una instancia, pasándole al guard sólo el texto de la llamada. El script arma la
palabra en dos partes para que el propio guard de la sesión no frene el comando que reproduce:

```bash
cat > /tmp/repro-499.sh <<'EOF'
#!/usr/bin/env bash
T='je''st'
for c in "node -e 'const r = /(pytest|$T|vitest)/i'" "grep -E 'pytest|$T|vitest' x.txt" \
         "echo 'a|$T'" "grep -E '$T' x.txt" "npx $T src"; do
  j=$(node -e 'process.stdout.write(JSON.stringify({hook_event_name:"PreToolUse",tool_name:"Bash",
    tool_input:{command:process.argv[1]},cwd:"/tmp"}))' "$c")
  printf '%s' "$j" | bash automatization/hooks/run-hook.sh test-workers >/dev/null 2>&1
  echo "exit=$? <- $c"
done
EOF
bash /tmp/repro-499.sh
```

Se corrió primero en una instancia real con Cauce 0.119.0, y el 2026-11-13 de nuevo desde la raíz de Cauce, con el mismo
resultado.

## Síntoma

```
exit=0 <- grep -E 'pytest|jest|vitest' x.txt
exit=2 <- node -e 'const r = /(pytest|jest|vitest)/i'
exit=0 <- echo 'a|jest'
exit=0 <- grep -E 'jest' x.txt
exit=2 <- npx jest src
```

El segundo es el falso positivo; el último, el freno correcto. La salida del segundo:

```
BLOQUEADO: 'jest' sin cota de workers lanza tantos procesos como núcleos, y dos a la vez tiran la máquina. Agregale
--maxWorkers=2 (o --runInBand). […]
  node -e 'const r = /(pytest|jest|vitest)/i'
```

En la sesión donde apareció frenó dos veces: un script de medición pasado por `node -e` con esa alternancia en una
expresión regular, y después el propio comando que intentaba reproducirlo.

## Causa raíz

Dos piezas, 0.119.0:

`engine/hooks/git-globals.js:228` — el texto entrecomillado se tapa sólo para los programas que se sabe que lo leen
como dato:

```js
const DATA_ONLY = new Set(['sed', 'grep', 'egrep', 'fgrep', 'rg', 'echo', 'printf', 'jq'])
```

Por eso `grep -E 'pytest|jest|vitest'` pasa: `asRun` (`engine/hooks/as-run.js:66`) le entrega a `test-workers` el
comando con esa cadena tapada. `node` no está en la lista —con razón: su script puede lanzar procesos—, así que el
script queda a la vista.

`engine/hooks/workers.js:27` — y ahí el comienzo de comando no mira las comillas:

```js
const AT = String.raw`(?:^|[;&|(\n]|${SHELL_C})\s*(?:(?:then|else|elif|if|do|while|until|!|\{)\s+)*(?:\w+=\S*\s+)*`
```

`[;&|(\n]` acepta el `|` de `(pytest|jest|vitest)`, que está dentro de las comillas del `-e`, y `RUNNER`
(`workers.js:44`) encuentra `jest` a continuación. El caso 286 resolvió que una **comilla** no abra comando salvo
detrás de un `sh -c`; esto es lo mismo para un **separador** dentro de las comillas.

## Fix propuesto

Que `launched` (`workers.js:157`) busque `RUNNER` sobre un texto donde los separadores que están dentro de comillas
no cuentan, salvo dentro del script de un `sh -c` —que es shell y ahí sí separan—. `quoting.js` ya tiene `masked`, y
`outerCommand` (`workers.js:63`) ya recorre las comillas como el shell: la forma sería pasar por `masked` lo
entrecomillado que no es un `SHELL_C`, y aplicar `RUNNER` a eso. Es una propuesta, no una decisión.

## Tradeoffs

- Un runner lanzado desde el script de otro lenguaje no se frena hoy ni se va a frenar con el fix:
  `node -e "require('child_process').execSync('jest')"` da exit 0, igual que `execSync( 'jest --x')` y
  `spawnSync('npx',['jest'])`, medido el 2026-11-13. Desde el 286 la comilla de después del `(` no abre comando. El fix
  no quita ningún freno, y que este guard no lea scripts de otros lenguajes conviene decirlo en su encabezado.
- Sin medir: cuánto cuesta enmascarar en cada comando de una sesión; `withoutQuotedData` ya recorre las comillas una
  vez por llamada.

## Contexto de descubrimiento

Una instancia de empresa, 2026-11-12, durante una auditoría de mecanismos: midiendo qué entradas de `done/` daban por
buena la evidencia con sólo nombrar una herramienta, el script de medición iba por `node -e` y traía la expresión
`/\b(golangci-lint|pytest|jest|vitest|tsc)\b/i`. El guard lo frenó; se esquivó pasando el script a un archivo.

## Relacionados

- **286** — el mismo guard tomaba `'jest'` dentro de un `grep` por una ejecución; arregló la comilla como comienzo de
  comando, no el separador entre comillas.
- **259** — el patrón de un `sed` leído como orden; de ahí sale `DATA_ONLY`.
- **067** — guards que cruzan el salto de línea y frenan lo que no es.

## Cierre

`test-workers` deja de tomar por comando un `;`, `|`, `&`, `(` o salto de línea que esté dentro del script entre
comillas de un intérprete de otro lenguaje, en posición de comando y con la bandera que recibe el script: `node` o
`bun` con `-e`, `-p`, `--eval` o `--print`; `python*` con `-c`; `perl` con `-e`. Son los que se comprobaron con su
`--help`: node 24.18, bun 1.3.14, python 3.14.4 y perl 5.40.1. `deno`, `ruby` y `php` no se pudieron comprobar en esta
máquina y se dejaron afuera: su script sigue frenando, que es la dirección segura. Cualquier otra comilla sigue
separando como antes. La lectura de comillas es la misma de `outerCommand`, sacada a
`scan()`.

Línea de base: el script de reproducción del caso con el motor de la rama. `node -e '/(pytest|jest|vitest)/i'` daba
`exit=2`. Después, `exit=0`, y `npx jest src` sigue en `exit=2`.

Contra el caso:

- **Fix, que `launched` no cuente los separadores entre comillas salvo en un `sh -c`:** se hizo distinto, al revés. La
  primera versión hacía eso, y la revisión independiente mostró que dejaba de frenar todo lo que la expresión de `sh -c`
  no nombra: `bash -ce`, `bash -o pipefail -c`, `eval`, `watch`, `parallel`, `git rebase -x` y más. También un heredoc
  con una comilla suelta, y un runner en una sustitución entre comillas dobles. Exceptuar sólo los intérpretes nombrados
  deja que lo nuevo nazca frenando (R27).
- **Tradeoff, un runner lanzado desde otro lenguaje no se frena:** se acepta, y el encabezado de la excepción en
  `workers.js` lo dice. Con el cambio, `node -e "execSync('cd x; npx jest')"` y `python3 -c "os.system('cd x; npx
  jest')"`, que antes frenaban por el `;` de adentro, pasan.
- **Tradeoff, el costo de enmascarar:** no se agrega un recorrido. `scan()` corre sólo cuando la expresión del runner ya
  encontró uno, que en el corpus fueron 75 de 87.824 comandos.

Lo que el caso no preveía: el usuario `node` de las imágenes oficiales. `su node -c '…'` se leía como el script de un
intérprete. Lo encontró la segunda pasada, y por eso el intérprete va anclado en posición de comando y con la bandera
de cada uno.

### Lista de cierre

1. hecho: la reproducción del caso con el motor de la rama, antes del cambio.
2. hecho: en la rama de la tanda, `fix/484-re-review-checks-what-it-asked`.
3. hecho: la prueba nueva en rojo sin el cambio («Got unwanted exception: node -e …») y en verde con él.
4. hecho: mutaciones en rojo: quitar la excepción entera; volver a leer el estado antes del separador; no reiniciar la
   comilla al entrar a una sustitución; dejar pasar toda comilla; tratar el comentario como «no separa»; y quitar el
   anclaje del intérprete. Ésta sobrevivió al principio, porque el caso de `su node` ya lo cubrían las banderas, y se
   le sumó `su -s /bin/sh python3 -c`.
5. hecho: cambia cómo el guard lee un comando. El motor de `HEAD` y el nuevo, sobre 87.824 comandos reales de las
   transcripciones de esta máquina: cambian 3, todos de «frena» a «pasa», y los tres son scripts de `python3 -c` o
   `node -e` con datos. Ninguno pasa de «pasa» a «frena». Antes de invertir el diseño cambiaban 7.
6. hecho: el guard real por `run-hook.sh`, con el script de reproducción, y la comparación sobre el corpus.
7. no aplica: no depende de un modelo ni de un runner. El guard recibe el texto del comando.
8. hecho: corrieron la reproducción, la suite de hooks, el corpus y las formas de la revisión (unos 85 comandos
   armados). Ningún comando del corpus trae las formas abiertas de la primera versión, así que el corpus solo no las
   habría encontrado.
9. no aplica: no coordina nada.
10. hecho: `outerCommand` devuelve lo mismo que antes. Lo midió la revisión con 300.000 cadenas al azar contra `HEAD`:
    0 diferencias. Las pruebas de los casos 286 y 313 siguen en verde.
11. hecho: tres pasadas independientes. La primera encontró tres huecos que impedían entregar —la sustitución entre
    comillas, el heredoc y los shells que `SHELL_C` no nombra— y el diseño se invirtió. La segunda, `su node -c`
    (impedía entregar), arreglado con el anclaje. La tercera, nada que impidiera entregar: corrigió un comentario que
    daba el heredoc por cubierto, y pidió comprobar las banderas de cada intérprete, que es por lo que la lista se
    achicó. Quedan anotados:
    - un heredoc cuyo cuerpo deja abierta la comilla de un `node -e`;
    - un script propio que se llame `node`;
    - un runner entre backticks dentro del script, que ya pasaba antes.
12. hecho: pasada uno por uno. Se corrigieron el comentario de posición de comando y uno de la prueba que contaba
    historia.
13. hecho: `npm run ci` con los cambios stageados.
14. hecho: recorrido arriba contra Fix y Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba.
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.120.0`, y entrada en el CHANGELOG.

**Sin probar:** un falso freno de una instancia de empresa sobre el motor nuevo; la medición se hizo sobre las
transcripciones de esta máquina.
