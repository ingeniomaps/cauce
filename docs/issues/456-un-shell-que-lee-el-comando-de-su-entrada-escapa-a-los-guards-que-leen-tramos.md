---
caso: 456
titulo: Un shell que lee el comando de su entrada —`echo "…" | sh`, un heredoc o un here-string a `bash`— escapa a los guards que leen el comando por tramos, porque el comando que corre llega como dato y no como palabra
estado: resuelto
resuelto-en: 0.117.0
prioridad: baja
version-detectada: 0.116.0
---

# 456 — Un shell que lee el comando de su entrada escapa a los guards que leen tramos

**🟢 resuelto en 0.117.0** · detectado en 0.116.0 · prioridad **baja**: no es la forma en que un agente suele escribir un comando,
y el arreglo del 455 ya cubre `sh -c`, que es la habitual.

## Resumen

Desde el 455, `steps` (`engine/hooks/shell-changes.js`) vuelve a leer lo que corre adentro de `sh -c`, `eval`,
`env -S`, `su -c` y `flock -c`. El shell que lee el comando de su entrada estándar no lo nombra en ninguna palabra:
en `echo 'rm -rf …' | sh` el comando es un argumento de `echo`, y en un heredoc o un here-string es un cuerpo que
`asRead` saca a propósito, porque en todos los demás casos es dato.

## Reproducción

El guard de límites desde una sesión cualquiera, en una instancia con una raíz declarada, con una ruta fuera de las
raíces, igual que `test/hooks/removal-boundary.test.js`.

## Síntoma

Medido el 2026-10-26 con el motor de `main` (`0f6c5f32`) y con el de la rama del 455; los dos dan lo mismo:

```
frena  rm -rf $HOME/fuera-de-las-raices/sub
pasa   echo 'rm -rf $HOME/fuera-de-las-raices/sub' | sh
pasa   printf 'rm -rf $HOME/fuera-de-las-raices/sub' | bash
pasa   bash <<EOF
       rm -rf $HOME/fuera-de-las-raices/sub
       EOF
pasa   sh <<< 'rm -rf $HOME/fuera-de-las-raices/sub'
```

## Causa raíz

- `engine/hooks/shell-changes.js` (`hidden`): un shell sin `-c` no tiene comando que leer.
- `engine/hooks/shell-changes.js` (`asRead`, `withoutBodies`): el cuerpo de un heredoc se quita antes de leer.

## Fix propuesto

Que el cuerpo de un heredoc o de un here-string dirigido a `sh|bash|zsh|dash|ksh`, y el argumento de un `echo` o un
`printf` cuya salida va por tubería a uno de ellos, se lea con `steps` como el de `sh -c`. Hay que mirar que no cambie
lo que `destructive` frena, que comparte `asRead`.

## Contexto de descubrimiento

El arreglo del 455, el 2026-10-26: buscando qué más afirmaba que un `sh -c` no se ve, apareció `FEEDS_SHELL`
(`engine/hooks/input.js`), que ya reconoce la tubería a un shell para otra pregunta.

## Relacionados

- 455: la misma clase, con el comando en una palabra.

## Cierre

**Resuelto en 0.117.0.**

- **Que el cuerpo de un heredoc o de un here-string dirigido a un shell se lea como el de `sh -c`.** Se hizo. Lee de su
  entrada un shell sin comando ni script, o con `-s`, `-`, `/dev/stdin`, `/dev/fd/0` o `/proc/self/fd/0`; el que abren
  `sudo -s`, `sudo -i` y `su` sin `-c`, y `source /dev/stdin`, que corre en el mismo shell. Se suman `ash`, `mksh`,
  `busybox` y `pkexec`. Lo que le llega se vuelve a leer con `steps`, y salvo con `source`, en su propio proceso: un
  `cd` del cuerpo no mueve lo de después. El heredoc cuenta también cuando el shell está más adelante en la tubería
  (`cat <<EOF | grep -v x | sh`) o recibe el cuerpo por su número (`sh 0<<EOF`), y no cuando lo que corre es
  `xargs sh`, que recibe nombres de archivo.
- **Que el argumento de un `echo` o un `printf` que va por tubería a un shell se lea igual.** Se hizo: `steps` lleva lo
  que cada tramo le pasa al siguiente. `echo` con sus banderas y sus `\n`, `printf` con su formato aplicado a sus
  valores, y cualquier otro tramo deja pasar lo que le llegó. Un salto o un comentario después del `|` no corta la
  tubería, `||` no pasa nada, y `2>&1` dejó de partir el tramo. Entre comillas dobles la barra se lee como en bash: sólo
  escapa `$`, `` ` ``, `"`, `\` y el salto.
- **Mirar que no cambie lo que `destructive` frena.** La premisa era falsa: `destructive` no comparte `asRead`. Lee
  `commandOf` (`engine/hooks/input.js`), que borra el cuerpo de un heredoc, y lo sigue borrando. Cambiaron dos cosas,
  que salieron de la revisión: `<<<` ya no se toma por un heredoc —en `bash <<< X`, un renglón posterior `X` se comía
  como cuerpo lo que había en medio, también un `rm -rf ~`—, y `|&`, `ash` y `mksh` cuentan como tubería a un shell.

**Lo que no preveía:**

- **El cuerpo ya lo borraba la lectura común**, `commandOf`, antes de `asRead`, y eso el caso no lo nombraba. Ahí la
  revisión de código tumbó dos diseños antes de dar con el que quedó:
  - Dejar el cuerpo como líneas sueltas filtraba su `cd` a lo de después en `destructive`, y eso saltaba la
    protección del directorio actual. Además leía como órdenes un heredoc anidado y juzgaba acá un `ssh` cortado con
    `\`.
  - Marcarlo dentro de `commandOf` ponía la marca en los mensajes y en la línea de aprobación que se le pide pegar a
    la persona, y le cobraba la lectura por tramos a cada guard.
  - Quedó así: `commandOf` es el de antes, y los cuatro guards que leen por tramos —`shell-boundary`, `line-scope`,
    `secrets-shell` y `ops-config-shell`— reciben el comando crudo. Ahí `asRead` borra los cuerpos en dos pasadas
    lineales —la primera se lleva también el terminador—, que es lo que hacían `commandOf` y `asRead` una detrás de la
    otra. El cuerpo que corre un shell queda como una palabra marcada que sólo `steps` lee. Con una sola pasada, un
    heredoc anidado con sangría o dos en un renglón dejaban escapar parte del cuerpo como comandos; la tercera pasada
    de revisión lo encontró.
- **`shell-changes.js` pasó las 500 líneas** y se partió: lo que dice qué corre un comando cuando va detrás de otro
  —los envoltorios, sus banderas, el `-c` de un shell, la entrada, lo que pasa por tubería— vive ahora en
  `engine/hooks/shell-wrappers.js`.
- **Lo que se decidió que no**, con la razón:
  - `eval bash <<EOF`, `bash -c "$(cat)"`, `eval "$(cat)"`, `source <(cat)`, `| (cd x && sh)` y un `cat <<EOF |` con
    el shell en la línea siguiente al cuerpo: formas raras, y cada una pediría otra lectura.
  - `destructive`, `git-add` y los demás guards que leen `commandOf` ven el cuerpo que corre un shell como dato, igual
    que antes. Que lo vean es otra lectura en cada uno, y la de `destructive` vive aparte a propósito (encabezado de
    `shell-changes.js`).

La prueba:

- `test/hooks/removal-boundary.test.js`, prueba nueva. Frenan:
  - las cuatro formas del síntoma;
  - `printf` con formato, con `--`, con menos valores y repetido; `echo -n` y `-e`, con comillas simples y dobles;
  - `bash -s --`, `bash -`, `bash /dev/fd/0`, `sh 0<<EOF` y `bash 2>&1`;
  - `cat | tee | sh`, `cat | grep | sh`, `|&`, y el salto y el comentario después de `|`;
  - `sudo -s`, `sudo su -`, `source /dev/stdin` con su `cd`, `ash`, `busybox sh` y `pkexec sh`;
  - un delimitador `END-1`, un here-string, un heredoc anidado con un apóstrofo seguido de un `rm`, y `<<<` con un
    renglón que repite su palabra.

  Pasan:
  - un documento escrito con `cat > … <<EOF`, también con un heredoc anidado con sangría o con dos en un renglón;
  - un `ssh` en una o dos líneas, un commit con `-F-`, `grep … <<EOF` y `xargs sh`;
  - `||` y `printf` sin formato;
  - un `case` con `a)` y un `cd` en el cuerpo, y el `cd` de un cuerpo, que no mueve lo de después.

  Ningún mensaje lleva la marca.
- `test/hooks/destructive.test.js`: el `cd` de un cuerpo no mueve el `rm -rf .` de después, `bash <<< X` con `rm -rf
  ~` en medio frena, y `|& sh` frena.
- `test/hooks/line-scope.test.js`: el `git` de una línea por `echo … | sh` y por `bash <<EOF` frena.
- Con el motor de antes del 456, las pruebas nuevas dieron rojo.
- En una copia, 37 mutaciones dieron rojo, una por pieza. Las que sobrevivieron en el camino marcaron código que no
  cambiaba nada —el `|&` como un solo corte, seguir líneas cortadas con `\`, de dónde sale la entrada de un tramo
  vacío y una condición de `reads`—, y se quitó.
- Tres pasadas de revisión de código; lo que encontraron se arregló con su prueba o quedó arriba con su razón.
- `npm run ci`: 1627 de 1627, con `shell-wrappers.js` en 100 de cobertura y la prueba de tiempo con comandos largos en
  verde.
- **Sesión real** de Claude Code 2.1.310, `claude -p` en `bypassPermissions`, en el banco instalado con el motor
  final, cada paso en una sesión atada por un `/autobuild piloto` real y autorizada por el dueño del proyecto:
  `echo 'git -C <banco>/app stash -u' | sh` y `bash <<FIN` con ese `git` adentro frenaron con «`<banco>/app` es el
  checkout de la sesión principal…»; el stash siguió vacío y `principal.txt`, en su lugar. Pasados al hook instalado,
  con el motor de antes del 456 los dos pasaban (`exit 0`) y con el de la rama frenan (`exit 2`), mientras un
  documento escrito con `cat > notas.md <<'FIN'`, un `git commit -F- <<'FIN'` y un `ssh host bash <<FIN` pasan.
