---
caso: 499
titulo: el guard de workers toma un pipe entre comillas por un separador de comandos
estado: abierto
prioridad: baja
version-detectada: 0.119.0
---

# 499 — `node -e 'const r = /(pytest|jest|vitest)/i'` dispara el guard de workers como si corriera jest sin cota

**🔴 abierto** · detectado en 0.119.0 · prioridad **baja**.

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
