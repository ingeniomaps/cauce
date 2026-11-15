---
caso: 518
titulo: secrets-shell resuelve una lectura contra el cwd de la sesión y no contra el cd del mismo comando
estado: resuelto
resuelto-en: 0.123.0
prioridad: media
version-detectada: 0.121.0
---

# 518 — secrets-shell resuelve una lectura contra el cwd de la sesión y no contra el cd del mismo comando

**🟢 resuelto en 0.123.0** · detectado en 0.121.0 · prioridad **media**: frena con la ruta equivocada, y la aprobación que la
persona ya dejó para la ruta correcta no alcanza.

## Resumen

`cd <dir> && grep … .env` se juzga como lectura de `<cwd de la sesión>/.env`, no de `<dir>/.env`. El bloqueo nombra un
archivo que el comando no lee, y una ruta aprobada en `.ops-approval` (la del `cd`) no lo destraba. Las escrituras del
mismo guard sí usan la base del `cd`.

## Reproducción

Con la sesión en `<ws>/portal`, y `<ws>/.env` aprobada en `planning/.ops-approval`, pasando el comando por la cadena
de guards de Bash del runner Claude (`guard-shell.sh`), sin ejecutarlo:

```bash
cd <ws> && grep -c GITHUB .env
```

## Síntoma

Medido el 2026-11-15 con el motor de `main` (0.122.0), con `execute('secrets-shell', …)` y la sesión en
`<ws>/portal`:

```
cd <ws> && grep -c GITHUB .env                     frena: «el comando lee <ws>/portal/.env, que es una credencial…»
  con <ws>/.env aprobada en .ops-approval          frena igual, con la misma ruta
grep -c GITHUB <ws>/.env, aprobada                 pasa
```

El bloqueo nombra un archivo que el comando no lee, y la aprobación del que sí lee no alcanza.

## Causa raíz

`engine/hooks/secrets-shell.js:159-161`: las lecturas se resuelven con `path.resolve(cwd, token)` contra `cwdOf(input)`
(`:161`), y `readTokens` (`:103`) no lleva la base de cada tramo. Las escrituras, en `:132`, sí usan `writes(command, cwd)`, que
devuelve la base que deja cada `cd`.

## Fix propuesto

Que `readTokens` devuelva cada palabra con la base de su tramo, como `writes`, y resolver con ella; con una base que no
se resuelve (`cd $X`), frenar pidiendo la ruta absoluta, como ya hace `:136-140` para la escritura.

`steps()` (`engine/hooks/shell-changes.js:262`) ya devuelve la base de cada tramo, con los `cd` entre comillas, los
subshells y los `cd` que no se resuelven, y es lo que usan `writes` y los guards de límites: conviene tomar la base de
ahí antes que volver a partir el comando en `readTokens`.

## Tradeoffs

Frena lo mismo, con la ruta correcta. Lo que cambia es la ruta que se aprueba: una aprobación que alguien haya dejado
para la ruta equivocada —la única que destrababa hoy— deja de servir, y el bloqueo pide la correcta. Un `cd $X` antes
de leer una credencial pasa a pedir la ruta absoluta, como ya pasa con la escritura.

Pruebas que dependen: `test/hooks/` de `secrets-shell`, que hoy pasan sin `cd` delante de la lectura.

## Contexto de descubrimiento

Auditoría de los guards en una instancia (2026-11-15), al volver a medir una entrada de su INBOX anotada el
2026-10-01 con 0.99.2: sigue igual en 0.121.0.

## Revisión (2026-11-15)

- **Real y sufrido:** un freno con la ruta equivocada que la aprobación correcta no destraba es la persona
  repitiendo lo que ya dijo. Pasó en uso real.
- **Arreglo acotado:** un guard, una función, y la base ya calculada en `steps()`.

## Relacionados

298 (el `cd` entre comillas en las escrituras), 405 (escribir una credencial por shell).

## Cierre

`readTokens`, en `engine/hooks/secrets-shell.js`, devuelve cada palabra que lee con la carpeta desde la que se
resuelve, y `secretsShell` resuelve con ella. La carpeta la mueve un `cd` de un tramo anterior, sólo cuando eso se sabe
sin interpretar: lo que sigue a `&&`, `;` o un salto. Tras un `||`, o en la rama `else` de un `if`, no se sabe si el
`cd` corrió —también con el `||` más adelante—; tras cualquier otro separador corre en otro proceso y no mueve nada; y con un `( … )`, un `$( … )`, un
backtick, un comentario o un separador entre comillas en el comando, lo que sigue a un `cd` no se sabe. Una carpeta que no se sabe no se adivina: la lectura de una credencial relativa frena pidiendo la ruta
absoluta, salvo que la persona la haya nombrado en el chat, igual que la escritura.

Línea de base: la reproducción del caso con el motor de `main` (0.122.0), arriba en «Síntoma».

Contra el caso:

- **Fix, cada palabra con la base de su tramo:** se hizo distinto. La base no sale de `steps()`, como sugería la
  revisión del caso, sino de una regla propia más angosta: `readTokens` parte el comando a su manera —mira lo
  entrecomillado y las redirecciones de entrada—, y emparejar sus tramos con los de `steps()` era otra fuente de error.
  La primera versión seguía también los alcances de `( … )` y `$( … )` con una pila, y la revisión independiente midió
  que dejaba pasar lecturas aprobadas en otra carpeta (`x="$(cd sub && pwd)"; cat .env`, backticks, `( … ) 2>…`,
  `cd x || …`) y armaba rutas falsas (`cd -P`, `cd "$(…)"`, `cd "sub dir"`). Se reemplazó por la regla de arriba, que
  ante la duda no adivina. La segunda pasada encontró dos formas más que se leían como un `cd` que mueve —separadores
  de un carácter seguidos de otro (`|&`, `&⏎`), y un `; cd ..;` dentro de comillas o de un comentario— y se cerraron
  con la misma regla.
- **Fix, con una base que no se resuelve frenar pidiendo la ruta absoluta:** se hizo, consultando el chat como la
  escritura. Sin eso, la primera versión frenaba lo que la persona había pedido nombrándolo.
- **Tradeoff, la aprobación de la ruta equivocada deja de servir:** se paga; está en el CHANGELOG.
- **Tradeoff, `cd $X` antes de leer pide la ruta absoluta:** se paga, y además vale para `cd -`, `cd -P`, `cd ... ||` y
  un comando con subshell, sustitución o backtick.
- **Pruebas que dependían:** las de `secrets-shell` siguen en verde sin cambios.
- **Retroceso aceptado frente a `main`:** con un subshell, una sustitución o un backtick en el comando, la carpeta
  queda desconocida hasta el final y no sólo hasta que cierra. `x=$(cd .. && pwd); cat .env`, que `main` dejaba pasar
  con el `.env` de la sesión aprobado, ahora pide la ruta absoluta. Pasa si la persona lo pidió en el chat. Seguir el
  alcance era lo que la primera versión hacía mal.

Lo que el caso no preveía, y queda como en `main`: `pushd`/`popd`, un `bash -c 'cd x && cat .env'` —la escritura sí
lee el script de adentro—, un `cd .. 2>&1 && …` —el `&` de la redirección se lee como fondo— y `cd ~usuario` siguen
resolviendo contra la carpeta de la sesión, igual que `cd .. &>/dev/null && …` y `cd .. >&2; …`. Tampoco se ve un
separador entre comillas escapadas (`"x\" ; cd .. ; y\""`) ni una lectura cuyo patrón trae un separador (`grep 'a|b'
.env`), como en `main`. Y una lectura con paréntesis después de un `cd` —`node -e
"…readFileSync('.env')"`— pide la ruta absoluta en vez de resolverse. No se tocó.

### Qué se corrió

Por la cadena real de hooks del runner Claude (`automatization/hooks/guard-shell.sh` con el JSON de `PreToolUse`), en el
banco `suelto`, con la sesión en `<banco>/portal`:

```
antes   cd <banco> && grep -c GITHUB .env, con <banco>/.env aprobada   BLOQUEADO: el comando lee <banco>/portal/.env …
después cd <banco> && grep -c GITHUB .env                              BLOQUEADO: el comando lee <banco>/.env …
        con <banco>/.env aprobada                                      exit 0
        cd .. || grep -c GITHUB .env                                   BLOQUEADO: … después de un `cd` a un destino que
                                                                       no se puede resolver acá …
```

El «antes» corrió con el motor de `origin/main` enlazado en el mismo banco.

### Lista de cierre

1. hecho: la reproducción del caso con el motor de `main`, y el «antes» por la cadena real.
2. hecho: en la rama `fix/518-secrets-read-cd-base`.
3. hecho: «secrets-shell resuelve una lectura desde el cd del mismo comando», en `test/hooks/secrets-shell.test.js`,
   roja con el motor de `main` (nombraba `<raíz>/portal/.env`) y verde con el nuevo.
4. hecho: en una copia, rojas: sin seguir el `cd`, resolver contra la sesión, `||` como `&&`, `|` y `&` moviendo la
   carpeta, separadores de un carácter moviéndola, sin el alcance de los paréntesis, sin el comentario, sin el
   separador entre comillas, sin el `else`, sin rechazar comillas y opciones, sin el chat, la clave sin la carpeta y
   sin sacar las comillas. Sobrevivió una línea que nunca corría, y se quitó.
5. hecho: lo que se quita es resolver contra la carpeta de la sesión; la prueba afirma que el bloqueo ya no nombra
   `<raíz>/portal/.env`, y la salida de antes y la de después están en «Qué se corrió».
6. hecho: por la cadena real de hooks en un banco, sin dobles.
7. no aplica: no depende de un modelo ni de un runner; el guard es el mismo en todos.
8. hecho: corrieron la prueba, las 448 de guards, la cadena real con el motor de antes y el de después; no corrió una
   sesión con modelo.
9. no aplica: no coordina nada entre runners ni raíces.
10. hecho: `readTokens` la usa sólo `secretsShell`; las pruebas de `secrets-shell` existentes siguen sin cambios.
11. hecho: tres pasadas independientes. La primera encontró tres cosas que impedían entregar y la versión se
    reescribió; la segunda, dos más, cerradas con la misma regla; la tercera, nada que impidiera entregar, y lo que
    señaló del `||` más adelante del `cd` se cerró igual. Los falsos frenos nuevos que nombró —un `#` o un `;` entre
    comillas en cualquier parte del comando, un `else` sin relación con el `cd`— van hacia el lado que frena y se
    destraban nombrando el archivo en el chat; quedan así.
12. hecho: pasada uno por uno sobre los comentarios del diff.
13. hecho: `npm run ci` con el cambio stageado.
14. hecho: recorrido arriba contra Fix y Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba.
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.123.0`, y entrada en el CHANGELOG.

**Sin probar:** una sesión real con modelo que lea una credencial después de un `cd`; el guard no depende del modelo.

